const zlib = require('zlib');
const { getCachedDocument, setCachedDocument } = require('./processed-doc-cache');

/**
 * Extracts Sway ID / Lookup Code from Sway URL.
 * Example: "https://sway.cloud.microsoft/MLTtAeuJheXv3QNm?ref=Link" -> "MLTtAeuJheXv3QNm"
 */
function extractSwayId(swayUrl) {
  if (!swayUrl) return null;
  const match = swayUrl.match(/sway\.(?:cloud\.microsoft|office\.com|com)\/(?:s\/)?([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Fetches native Sway document structure via direct REST API without Playwright.
 */
async function fetchSwayPayload(swayId) {
  const endpoint = `https://sway.cloud.microsoft/s/${swayId}/get?currentClientVersion=201`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0',
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) return null;

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let jsonStr = '';
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    jsonStr = zlib.gunzipSync(buffer).toString('utf-8');
  } else {
    jsonStr = buffer.toString('utf-8');
  }

  return JSON.parse(jsonStr);
}

/**
 * Recursively walks Sway tree to extract text nodes and embedded image URLs.
 */
function extractSwayNodes(payload) {
  const textNodes = [];
  const imageNodes = [];

  const root = payload?.StoryDiff?.propBags?.[0];

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    const props = node.props || {};

    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' && v.trim().length > 3) {
        if (v.startsWith('http') && (v.includes('/images/') || v.includes('.png') || v.includes('.jpg'))) {
          imageNodes.push(v);
        } else if (!v.startsWith('http') && v.trim().length > 15) {
          // Avoid internal class names
          if (!v.startsWith('Microsoft.Office.') && !v.includes('FirstLineEmphasized') && !v.includes('AbstractStyle')) {
            textNodes.push(v.trim());
          }
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }

  walk(root);

  return {
    textBlocks: Array.from(new Set(textNodes)),
    imageUrls: Array.from(new Set(imageNodes))
  };
}

const CANONICAL_YEAR_ORDER = ['R', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6'];

/**
 * Normalizes year group tokens and/or column booleans into canonical codes:
 * ['R', 'Y1', ..., 'Y6'] or ['All Years'].
 */
function normalizeYearGroups(rawYears = [], yearColumns = null) {
  const found = new Set();

  if (yearColumns && typeof yearColumns === 'object') {
    for (const [key, val] of Object.entries(yearColumns)) {
      if (!val) continue;
      const k = key.trim().toUpperCase();
      if (k === 'R' || k === 'RECEPTION' || k === 'EYFS') found.add('R');
      else if (/^Y?[1-6]$/.test(k)) found.add(`Y${k.replace('Y', '')}`);
    }
  }

  if (Array.isArray(rawYears)) {
    for (const raw of rawYears) {
      if (!raw || typeof raw !== 'string') continue;
      const s = raw.trim().toLowerCase();
      if (s === 'all' || s === 'all years' || s === 'whole school' || s === 'r-y6' || s === 'r to y6') {
        return ['All Years'];
      }
      if (s === 'r' || s === 'reception' || s === 'eyfs' || s === 'early years') {
        found.add('R');
      } else {
        const m = s.match(/^(?:year\s*|y)?([1-6])$/i);
        if (m) found.add(`Y${m[1]}`);
      }
    }
  }

  if (found.size === 0 || found.size === CANONICAL_YEAR_ORDER.length) {
    return ['All Years'];
  }

  return CANONICAL_YEAR_ORDER.filter(code => found.has(code));
}

/**
 * Invokes Gemini 2.5 Flash Multimodal Vision to extract calendar items and
 * decode color-coded year group cells from a term spreadsheet screenshot.
 */
async function extractDiaryEventsWithGemini(imageUrl, termHint = '', swayId = '') {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey || process.argv.includes('--mock')) {
    return null;
  }

  try {
    const resImg = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!resImg.ok) return null;

    const arrayBuffer = await resImg.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = resImg.headers.get('content-type') || 'image/png';

    const prompt = `You are analyzing a primary school "Dates for your Diary" spreadsheet image.
The table columns left-to-right are: Month, Date, Time, R, 1, 2, 3, 4, 5, 6, Event.
CRITICAL RULES FOR COLOURS:
1. Alternating rows may have a pale light-green tint in the Month, Date, Time, and Event text cells — ignore that row-shading tint!
2. The 7 narrow columns labelled R, 1, 2, 3, 4, 5, 6 represent Reception (R) and Year 1 to Year 6 (Y1..Y6). Each column has its own solid fill colour when active:
   - R = dark green, 1 = red, 2 = blue, 3 = yellow, 4 = light green, 5 = dark red, 6 = dark blue.
   - If a cell in R..6 is filled with that solid colour, set that column to true.
   - If a cell in R..6 is plain white/blank, set it to false.
   - If all 7 columns are filled across the row, set all 7 to true.

Extract every event row into a JSON array of objects with:
- title: exact event name string
- month: string (e.g. "September", "November", "January")
- dateRaw: string (e.g. "9th", "8th & 9th", "20th to 23rd")
- eventDate: ISO date YYYY-MM-DD (Academic year 2026-2027: Sep-Dec is 2026, Jan-Jul is 2027)
- time: string or null
- isNew: boolean (true if the Date cell is highlighted green)
- yearColumns: { "R": bool, "Y1": bool, "Y2": bool, "Y3": bool, "Y4": bool, "Y5": bool, "Y6": bool }
- targetYears: array of string codes e.g. ["Y5", "Y6"] or ["R"] or ["All Years"]
- notes: brief helpful summary of the event

Respond strictly with a pure JSON array.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!apiRes.ok) return null;
    const jsonRes = await apiRes.json();
    const rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item, idx) => ({
        id: `wpa-evt-${swayId}-${termHint.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${idx + 1}`,
        dateDisplay: `${item.month} ${item.dateRaw}`.trim(),
        eventDate: item.eventDate,
        title: item.title,
        time: item.time || '',
        yearGroups: normalizeYearGroups(item.targetYears, item.yearColumns),
        notes: item.notes || item.title,
        term: termHint,
        isNew: Boolean(item.isNew)
      }));
    }
  } catch (err) {
    console.warn(`[WpaSwayParser] Gemini Vision extraction error for ${imageUrl}:`, err.message);
  }
  return null;
}

/**
 * Extracts structured sections and cards from Sway ToC and ContentId nodes.
 */
function extractSwaySections(payload) {
  const root = payload?.StoryDiff?.propBags?.[0];
  if (!root) return [];

  const tocElements = [];
  function findToC(node) {
    if (!node) return;
    if (node.type === 'Node-ToCElement' && node.props?.Title) {
      tocElements.push({
        title: node.props.Title.trim(),
        subtitle: (node.props.SubTitle || '').trim(),
        targetId: node.props.NavigationTargetId
      });
    }
    if (Array.isArray(node.children)) node.children.forEach(findToC);
  }
  findToC(root);

  const contentMap = new Map();
  function indexContainers(node) {
    if (!node) return;
    if (node.props?.ContentId) {
      if (!contentMap.has(node.props.ContentId)) {
        contentMap.set(node.props.ContentId, []);
      }
      contentMap.get(node.props.ContentId).push(node);
    }
    if (Array.isArray(node.children)) node.children.forEach(indexContainers);
  }
  indexContainers(root);

  const sections = [];
  for (const sec of tocElements) {
    const nodes = contentMap.get(sec.targetId) || [];
    const texts = [];
    const links = [];
    const images = [];

    function extractProps(n) {
      if (!n) return;
      const p = n.props || {};
      if (p.Text && typeof p.Text === 'string') {
        const t = p.Text.trim();
        if (t && !texts.includes(t) && t !== sec.title) {
          texts.push(t);
        }
      }
      if (p.HyperlinkUri && typeof p.HyperlinkUri === 'string') {
        if (!links.includes(p.HyperlinkUri)) links.push(p.HyperlinkUri);
      }
      if (p.ImageUrl && typeof p.ImageUrl === 'string') {
        if (!images.includes(p.ImageUrl)) images.push(p.ImageUrl);
      }
      if (Array.isArray(n.children)) n.children.forEach(extractProps);
    }

    nodes.forEach(extractProps);

    sections.push({
      title: sec.title,
      subtitle: sec.subtitle,
      paragraphs: texts,
      links,
      images
    });
  }

  return sections;
}

/**
 * Builds structured announcement objects from dynamic Sway sections.
 */
function buildAnnouncementsFromSections(sections, swayUrl, swayId, pubDateStr, textBlocks = []) {
  const announcements = [];
  const skipTitles = ['dates for your diary', 'contact us', 'school letters and community news'];

  for (const sec of sections) {
    const titleLower = sec.title.toLowerCase();
    if (skipTitles.some(s => titleLower.includes(s))) continue;
    if (sec.paragraphs.length === 0) continue;

    let title = sec.title;
    let category = 'WPA Announcements';
    let url = sec.links[0] || swayUrl;

    if (titleLower.includes('this week') || titleLower.includes('headteacher')) {
      title = sec.subtitle ? `Headteacher's Message: ${sec.subtitle}` : `Headteacher's Weekly Message`;
    } else if (titleLower.includes('important news') || titleLower.includes('reminders')) {
      title = `School Reminders: Inhalers, Absences & School Dinners`;
    } else if (titleLower.includes('attendance')) {
      title = `Attendance Update: Termly Pizza Parties (TAPP) & Appointment Guidelines`;
    } else if (titleLower.includes('young carers')) {
      title = `Young Carers: Support & Parent Concern Form`;
    } else if (titleLower.includes('superstar') || titleLower.includes('stars of the week')) {
      title = `Celebrating our Superstars: Stars of the Week`;
      category = 'WPA Celebrations';
    } else if (titleLower.includes('p.t.f.a') || titleLower.includes('ptfa')) {
      title = `P.T.F.A: Pre-Loved School Uniform Sales`;
      url = sec.links[0] || 'https://www.facebook.com/warboysptfa/?locale=en_GB';
    } else if (titleLower.includes('community')) {
      category = 'Community Events';
    }

    announcements.push({
      id: `wpa-${titleLower.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 25)}-${swayId}`,
      title,
      content: sec.paragraphs.join('\n\n'),
      url,
      date: pubDateStr,
      category
    });
  }

  return announcements;
}

/**
 * Main parser function for a Sway newsletter URL.
 * Uses persistent document cache (processed_documents_cache.json).
 */
async function parseSwayNewsletter(swayUrl) {
  if (!swayUrl) return null;

  // 1. Check persistent document cache
  const cached = getCachedDocument(swayUrl);
  if (cached && Array.isArray(cached.announcements) && cached.announcements.length >= 5) {
    const headMsg = cached.announcements.find(a => a.title.toLowerCase().includes('headteacher'));
    if (!headMsg || headMsg.content.length > 100) {
      return cached;
    }
  }

  const swayId = extractSwayId(swayUrl);
  if (!swayId) return null;

  try {
    const payload = await fetchSwayPayload(swayId);
    if (!payload) return null;

    const { textBlocks, imageUrls } = extractSwayNodes(payload);
    let announcements = [];
    let diaryEvents = [];

    // Extract newsletter title and issue date
    const title = textBlocks.find(t => t.toLowerCase().includes('wpa weekly news') || t.toLowerCase().includes('newsletter')) || 'Warboys Primary Academy Weekly Newsletter';
    const dateMatch = title.match(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i);
    const newsletterDate = dateMatch ? dateMatch[1] : '';
    const pubDateStr = new Date().toISOString();

    // 1. Try dynamic ToC/ContentId section extraction first
    const sections = extractSwaySections(payload);
    if (sections.length > 0) {
      announcements = buildAnnouncementsFromSections(sections, swayUrl, swayId, pubDateStr, textBlocks);
    }

    // 2. Fallback if ToC extraction yielded no announcements (e.g. offline mock or legacy newsletter)
    if (announcements.length === 0) {
      const welcomeParas = textBlocks.filter(t =>
        t.toLowerCase().includes('welcome back') ||
        t.toLowerCase().includes('warm welcome back') ||
        t.toLowerCase().includes('settling into their new classrooms') ||
        t.toLowerCase().includes('extend a huge welcome to our new reception') ||
        t.toLowerCase().includes('newsletter will be shared every friday')
      );

      if (welcomeParas.length > 0) {
        announcements.push({
          id: `wpa-welcome-${swayId}`,
          title: `Headteacher's Message: Welcome Back & Start of Autumn Term`,
          content: welcomeParas.join('\n\n'),
          url: swayUrl,
          date: pubDateStr,
          category: 'WPA Announcements'
        });
      } else {
        const olderHeadteacher = textBlocks.filter(t =>
          t.toLowerCase().includes('welcome to this week') ||
          t.toLowerCase().includes('first full week') ||
          t.toLowerCase().includes('wonderful to see') ||
          t.toLowerCase().includes('have a lovely weekend')
        );
        if (olderHeadteacher.length > 0) {
          announcements.push({
            id: `wpa-headteacher-${swayId}`,
            title: `Headteacher's Weekly Message & School Updates`,
            content: olderHeadteacher.join('\n\n'),
            url: swayUrl,
            date: pubDateStr,
            category: 'WPA Announcements'
          });
        }
      }

      const ptfaPara = textBlocks.find(t => t.toLowerCase().includes('pre‑loved') || t.toLowerCase().includes('pre-loved') || t.toLowerCase().includes('ptfa'));
      if (ptfaPara) {
        announcements.push({
          id: `wpa-ptfa-${swayId}`,
          title: `P.T.F.A: Pre-Loved School Uniform Sales`,
          content: `A quick reminder that our PTFA sells high-quality pre-loved school uniform through their Facebook page. It is a great way to save money, support the school, and give uniform items a new life. Extra items for the autumn term are available online.`,
          url: 'https://www.facebook.com/warboysptfa/?locale=en_GB',
          date: pubDateStr,
          category: 'WPA Announcements'
        });
      }
    }

    // Extract Diary Events dynamically from the "Dates for your Diary" Sway section images
    const diarySection = sections.find(s => s.title.toLowerCase().includes('diary'));
    const diaryImages = (diarySection && Array.isArray(diarySection.images) && diarySection.images.length > 0)
      ? diarySection.images.map((url, i) => ({ url, label: `Diary Page ${i + 1}` }))
      : [];

    let visionEvents = [];
    const seenVisionKeys = new Map();
    for (const img of diaryImages) {
      const extracted = await extractDiaryEventsWithGemini(img.url, img.label, swayId);
      if (Array.isArray(extracted)) {
        for (const evt of extracted) {
          const normTitle = (evt.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const key = `${evt.eventDate || ''}:${normTitle}`;
          if (key && seenVisionKeys.has(key)) {
            const prev = seenVisionKeys.get(key);
            if (prev.yearGroups && evt.yearGroups && !prev.yearGroups.includes('All Years')) {
              prev.yearGroups = normalizeYearGroups([...prev.yearGroups, ...evt.yearGroups]);
            }
          } else {
            seenVisionKeys.set(key, evt);
            visionEvents.push(evt);
          }
        }
      }
    }

    if (visionEvents.length > 0) {
      diaryEvents = visionEvents.map(evt => ({
        ...evt,
        url: swayUrl,
        sourceUrl: swayUrl
      }));
    }

    const result = {
      swayUrl,
      swayId,
      title,
      newsletterDate,
      textBlocks,
      imageUrls,
      announcements,
      diaryEvents
    };

    // Store in document cache
    setCachedDocument(swayUrl, result);

    return result;
  } catch (err) {
    console.warn(`[WpaSwayParser] Error parsing ${swayUrl}:`, err.message);
    return null;
  }
}

module.exports = {
  extractSwayId,
  fetchSwayPayload,
  extractSwaySections,
  parseSwayNewsletter,
  normalizeYearGroups
};
