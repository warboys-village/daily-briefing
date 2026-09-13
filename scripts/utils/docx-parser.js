const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getCachedDocument, setCachedDocument } = require('./processed-doc-cache');

/**
 * Downloads a DOCX file from URL and extracts structured paragraph text.
 * Uses persistent document cache (processed_documents_cache.json) to prevent duplicate processing.
 */
async function parseDocxFromUrl(docxUrl, options = {}) {
  if (!docxUrl) return null;

  // 1. Check persistent document cache
  const cachedItems = getCachedDocument(docxUrl, options);
  if (cachedItems) {
    return cachedItems;
  }

  const tmpDocxPath = path.join('/tmp', `minutes_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.docx`);

  try {
    const res = await fetch(docxUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      console.warn(`[DocxParser] HTTP ${res.status} fetching ${docxUrl}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpDocxPath, buffer);

    // Extract text paragraphs using python3 zipfile XML parser
    const pyScript = `
import zipfile, xml.etree.ElementTree as ET
try:
    with zipfile.ZipFile('${tmpDocxPath}') as z:
        xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    paragraphs = []
    for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
        texts = [t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
        if texts:
            paragraphs.append(' '.join(texts).strip())
    print('|||PARASPLIT|||'.join(paragraphs))
except Exception as e:
    print('ERROR:', e)
`;

    const rawOutput = execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });

    if (rawOutput.startsWith('ERROR:')) {
      console.warn(`[DocxParser] Python XML extract error: ${rawOutput}`);
      return null;
    }

    const paragraphs = rawOutput.split('|||PARASPLIT|||').map(p => p.trim()).filter(Boolean);
    const extractedItems = extractMinutesItems(paragraphs, docxUrl);

    // Save to persistent document cache
    if (extractedItems && extractedItems.length > 0) {
      setCachedDocument(docxUrl, extractedItems, options);
    }

    return extractedItems;
  } catch (err) {
    console.warn(`[DocxParser] Error parsing ${docxUrl}:`, err.message);
    return null;
  } finally {
    if (fs.existsSync(tmpDocxPath)) {
      try { fs.unlinkSync(tmpDocxPath); } catch (e) {}
    }
  }
}

/**
 * Dynamically extracts discrete governance and event items from minutes paragraphs.
 */
function extractMinutesItems(paragraphs, docxUrl) {
  if (!paragraphs || paragraphs.length === 0) return [];

  // 1. Detect meeting date from initial paragraphs
  let dateMatchStr = null;
  for (const p of paragraphs.slice(0, 8)) {
    const dMatch = p.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dMatch) {
      dateMatchStr = `${dMatch[1]} ${dMatch[2]} ${dMatch[3]}`;
      break;
    }
    const dotMatch = p.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
    if (dotMatch) {
      let yr = parseInt(dotMatch[3], 10);
      if (yr < 100) yr += 2000;
      dateMatchStr = `${dotMatch[1]}/${dotMatch[2]}/${yr}`;
      break;
    }
  }

  const meetingDateStr = dateMatchStr || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  let isoDate = new Date().toISOString();
  try {
    const parsedDate = new Date(meetingDateStr);
    if (!isNaN(parsedDate.getTime())) {
      isoDate = parsedDate.toISOString();
    }
  } catch (e) {}

  const items = [];
  const slugify = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

  // 2. Identify substantive topic clusters from paragraphs
  const topicBuckets = [
    {
      key: 'highways',
      test: (p) => /contractor|highway|flaxon walk|parking bay|footpath|speed/i.test(p),
      title: 'Parish Council Governance: Highway Contractor Penalties & Flaxon Walk Parking Bay',
      priority: 'HIGH'
    },
    {
      key: 'send',
      test: (p) => /send\b|special educational|overspend|school transport/i.test(p),
      title: 'County Council Reports £60m SEND Budget Overspend',
      priority: 'HIGH'
    },
    {
      key: 'localplan',
      test: (p) => /local plan|settlement boundary|call for sites|planning policy/i.test(p),
      title: 'HDC Local Plan Publication & Autumn Public Consultation',
      priority: 'HIGH'
    },
    {
      key: 'newman',
      test: (p) => /newman stores|community asset|asset of community value/i.test(p),
      title: 'Newman Stores Future Use & Community Acquisition Consultation',
      priority: 'STANDARD'
    },
    {
      key: 'allotments',
      test: (p) => /allotment|tenancy|maintenance|hedge/i.test(p),
      title: 'Parish Council: Allotment Site Inspection & Tenancy Renewals',
      priority: 'STANDARD'
    },
    {
      key: 'finance',
      test: (p) => /precept|internal audit|bank reconciliation|grant request/i.test(p),
      title: 'Parish Council Finance & Community Grant Approvals',
      priority: 'STANDARD'
    }
  ];

  for (const bucket of topicBuckets) {
    const matched = paragraphs.filter(p => bucket.test(p));
    if (matched.length > 0) {
      const combined = matched.join(' ');
      const cleanSummary = combined.length > 300 ? combined.slice(0, 300) + '...' : combined;
      items.push({
        id: `parish-live-${bucket.key}-${slugify(meetingDateStr)}`,
        title: bucket.title,
        content: combined,
        summary: cleanSummary,
        url: docxUrl,
        sourceUrl: docxUrl,
        date: isoDate,
        meetingDate: isoDate.split('T')[0],
        category: 'Village News & Governance',
        priority: bucket.priority,
        sourceId: 'warboys-parish',
        sourceName: 'Warboys Parish Council'
      });
    }
  }

  // 3. Dynamic event detection in minutes
  for (const p of paragraphs) {
    const lower = p.toLowerCase();
    const isEventNotice = (lower.includes('showcase') || lower.includes('concert') || lower.includes('festival') || lower.includes('fete')) &&
                          !lower.includes('last month') && !lower.includes('attended the');

    if (isEventNotice) {
      const dateMatch = p.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
      let eventDate = null;
      let eventDateStr = 'Upcoming';
      if (dateMatch) {
        const d = new Date(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
        if (!isNaN(d.getTime())) {
          eventDate = d.toISOString().split('T')[0];
          eventDateStr = `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`;
        }
      }

      let eventTitle = 'Parish Community Event (Announced in Council Minutes)';
      if (lower.includes('showcase')) {
        eventTitle = 'Warboys Community Showcase 2026 (Announced in Council Minutes)';
      } else if (lower.includes('choir')) {
        eventTitle = 'Warboys Community Choir Concert (Announced in Council Minutes)';
      }

      items.push({
        id: `parish-live-evt-${slugify(eventTitle)}-${eventDate || slugify(meetingDateStr)}`,
        title: eventTitle,
        eventTime: eventDateStr,
        eventDate: eventDate || isoDate.split('T')[0],
        eventCategory: 'UPCOMING',
        isRegular: false,
        venue: 'Warboys Community Centre',
        content: p,
        url: docxUrl,
        sourceUrl: docxUrl,
        date: isoDate,
        category: 'Community Events',
        sourceId: 'warboys-parish',
        sourceName: 'Warboys Parish Council'
      });
    }
  }

  return items;
}

module.exports = {
  parseDocxFromUrl,
  extractMinutesItems
};
