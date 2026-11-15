const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

function parseDayMonthYear(dayStr, monthStr, yearStr) {
  const mIdx = MONTHS[String(monthStr || '').toLowerCase()];
  if (mIdx === undefined) return null;
  const year = yearStr ? Number(yearStr.length === 2 ? `20${yearStr}` : yearStr) : new Date().getFullYear();
  const mm = String(mIdx + 1).padStart(2, '0');
  const dd = String(Number(dayStr)).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

class AbbeyCollegeSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.updateListUrls = [
      config.url || 'https://www.abbey.college/weekly-updates',
      'https://www.abbey.college/whole-school-community-round-up-newsletters'
    ];
    this.postsUrl = 'https://abbey.college/posts';
    this.termDatesUrl = 'https://www.abbey.college/term-dates';
    this.parentsForumUrl = 'https://www.abbey.college/parents-forum';
    this.sixthFormNewsUrl = 'https://www.ramseygatehouse.co.uk/latest-news';
    this.schoolSlug = config.schoolSlug || 'abbey';
    this.schoolName = config.schoolName || 'Abbey College, Ramsey';
  }

  /**
   * Routine 1: Discovers Abbey College weekly updates, Good News posts, term dates, and parent forum pages.
   */
  async establishSources() {
    const sources = [];
    const seenUrls = new Set();
    const dailyTimestamp = `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`;

    // 1. Latest 2 Weekly Family Updates & Community Round-Up PDFs
    let weeklyPdfCount = 0;
    for (const targetUrl of this.updateListUrls) {
      try {
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
          signal: AbortSignal.timeout(7000)
        }).catch(() => null);
        if (!res || !res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        $('a').each((_, el) => {
          if (weeklyPdfCount >= 2) return;
          const href = $(el).attr('href');
          const rawText = $(el).text().replace(/\s+/g, ' ').trim();
          if (!href) return;
          const fullUrl = href.startsWith('http') ? href : new URL(href, targetUrl).toString();
          const lowerUrl = fullUrl.toLowerCase();
          if (!lowerUrl.includes('meridianwebsitefiles.blob.core.windows.net/') && !lowerUrl.includes('.pdf')) return;
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

          const cleanTitle = rawText.replace(/(?:\.pdf)?\s*\d+(?:\.\d+)?\s*(?:kb|mb|gb)\b/gi, '').trim() || 'Abbey College Weekly Update';
          const parsedPdfDate = this.extractDateFromTextOrUrl(cleanTitle, fullUrl);
          if (parsedPdfDate && this.isOlderThanDays(parsedPdfDate, 30)) return;
          const itemTimestamp = parsedPdfDate ? parsedPdfDate.toISOString() : dailyTimestamp;

          sources.push({
            sourceId: fullUrl,
            sourceUrl: fullUrl,
            url: fullUrl,
            timestamp: itemTimestamp,
            metadata: { kind: 'weekly-pdf', title: cleanTitle, isPdfDocument: true }
          });
          weeklyPdfCount++;
        });
      } catch (err) {
        console.warn(`[AbbeyCollegeSource] Warning querying ${targetUrl}: ${err.message}`);
      }
    }

    // 2. Good News Blog Posts (https://abbey.college/posts)
    try {
      const res = await fetch(this.postsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(7000)
      }).catch(() => null);
      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        let postCount = 0;
        $('article a[href*="/posts/"], a[href*="/posts/"]').each((_, el) => {
          if (postCount >= 5) return;
          const href = $(el).attr('href');
          if (!href) return;
          const fullUrl = href.startsWith('http') ? href : new URL(href, this.postsUrl).toString();
          if (seenUrls.has(fullUrl) || fullUrl.replace(/\/+$/, '') === this.postsUrl) return;
          seenUrls.add(fullUrl);

          const text = $(el).text().replace(/\s+/g, ' ').trim();
          const parsedPostDate = this.extractDateFromTextOrUrl(text, fullUrl);
          if (parsedPostDate && this.isOlderThanDays(parsedPostDate, 30)) return;
          const itemTimestamp = parsedPostDate ? parsedPostDate.toISOString() : dailyTimestamp;
          const title = text.replace(/PostCalendar\s*Days\s*\d{2}\/\d{2}\/\d{4}/i, '').trim() || 'Abbey College Good News';
          sources.push({
            sourceId: fullUrl,
            sourceUrl: fullUrl,
            url: fullUrl,
            timestamp: itemTimestamp,
            metadata: { kind: 'post', title }
          });
          postCount++;
        });
      }
    } catch (err) {
      console.warn(`[AbbeyCollegeSource] Warning querying ${this.postsUrl}: ${err.message}`);
    }

    // 3. Term Dates Page
    sources.push({
      sourceId: this.termDatesUrl,
      sourceUrl: this.termDatesUrl,
      url: this.termDatesUrl,
      timestamp: dailyTimestamp,
      metadata: { kind: 'term-dates', title: 'Abbey College Term Dates 2026/27' }
    });

    // 4. Parent's Forum Page
    sources.push({
      sourceId: this.parentsForumUrl,
      sourceUrl: this.parentsForumUrl,
      url: this.parentsForumUrl,
      timestamp: dailyTimestamp,
      metadata: { kind: 'parents-forum', title: "Abbey College Parent's Forum" }
    });

    return sources.slice(0, 12);
  }

  /**
   * Routine 2: Disaggregates Abbey College PDFs, posts, term dates, and Parent's Forum into school news, events, and minutes.
   */
  async processSingleItem(src, options = {}) {
    const news = [];
    const events = [];
    const governance = [];
    const meta = src.metadata || {};
    const kind = meta.kind || (src.sourceUrl.includes('meridianwebsitefiles') || src.sourceUrl.endsWith('.pdf') ? 'weekly-pdf' : 'post');
    const dateOnly = (src.timestamp || new Date().toISOString()).split('T')[0];

    if (kind === 'weekly-pdf') {
      const pdfData = await parsePdfFromUrl(src.sourceUrl, options);
      const bodyText = pdfData && pdfData.text ? pdfData.text : '';
      if (!bodyText) return { news, events, governance, planning: [] };

      const llm = this.capabilities && this.capabilities.llm;
      let extracted = null;
      if (llm && typeof llm.isAvailable === 'function' && llm.isAvailable() && typeof llm.extractStructured === 'function') {
        try {
          extracted = await llm.extractStructured(
            bodyText.slice(0, 5000),
            { sourceName: this.name, schoolName: this.schoolName, date: dateOnly },
            { modelFamily: 'flash' }
          );
        } catch (err) {
          console.warn(`[AbbeyCollegeSource] LLM extraction skipped for ${src.sourceUrl}:`, err.message);
        }
      }

      if (extracted && Array.isArray(extracted.news) && extracted.news.length > 0) {
        extracted.news.forEach((ann, idx) => {
          if (!ann || !ann.title) return;
          const slugAnchor = ann.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
          news.push({
            id: `abbey-ann-${dateOnly}-${idx}-${slugAnchor}`,
            title: ann.title,
            content: ann.content || ann.summary || ann.title,
            summary: ann.summary || ann.content || ann.title,
            url: `${src.sourceUrl}#${slugAnchor}`,
            sourceUrl: src.sourceUrl,
            date: dateOnly,
            timestamp: src.timestamp,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: Array.isArray(ann.yearGroups) && ann.yearGroups.length > 0 ? ann.yearGroups : ['All Years'],
            category: 'School News',
            sourceId: this.id,
            sourceName: this.name
          });
        });
      } else {
        // Deterministic section splitter for Abbey College Weekly Family Updates
        const cleanText = bodyText.replace(/\s+/g, ' ').trim();
        const sectionSpecs = [
          { key: 'headteacher', title: `Headteacher's Update (${dateOnly})`, start: /Headteacher[’']s Update/i, end: /Vacancies at Abbey|Celebration of Spirit/i },
          { key: 'spirit', title: `Celebration of Spirit & Commendations (${dateOnly})`, start: /Celebration of Spirit/i, end: /Strong Partnerships|Parent's Forum/i },
          { key: 'forum-rshe', title: `Parent's Forum & MCAS Reminder (${dateOnly})`, start: /Strong Partnerships/i, end: /Diary Dates|Everything You Need/i },
          { key: 'personal-dev', title: `Wider Personal Development & RSHE Consultation (${dateOnly})`, start: /Wider Personal Development/i, end: /Communicating with us|Other news updates/i }
        ];
        let matchedAny = false;
        for (const sec of sectionSpecs) {
          const sMatch = cleanText.match(sec.start);
          if (!sMatch) continue;
          const rest = cleanText.slice(sMatch.index);
          const eMatch = rest.slice(20).match(sec.end);
          const snippet = (eMatch ? rest.slice(0, 20 + eMatch.index) : rest.slice(0, 550)).trim();
          if (snippet.length < 40) continue;
          matchedAny = true;
          news.push({
            id: `abbey-${sec.key}-${dateOnly}`,
            title: sec.title,
            content: snippet.slice(0, 750),
            summary: snippet.slice(0, 260),
            url: `${src.sourceUrl}#${sec.key}`,
            sourceUrl: src.sourceUrl,
            date: dateOnly,
            timestamp: src.timestamp,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: ['All Years'],
            category: 'School News',
            sourceId: this.id,
            sourceName: this.name
          });
        }
        if (!matchedAny) {
          news.push({
            id: `abbey-update-${dateOnly}`,
            title: meta.title || `Weekly Family Update (${dateOnly})`,
            content: cleanText.slice(0, 900),
            summary: cleanText.slice(0, 280),
            url: src.sourceUrl,
            sourceUrl: src.sourceUrl,
            date: dateOnly,
            timestamp: src.timestamp,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: ['All Years'],
            category: 'School News',
            sourceId: this.id,
            sourceName: this.name
          });
        }
      }

      if (extracted && Array.isArray(extracted.events)) {
        const todayIso = new Date().toISOString().split('T')[0];
        for (const evt of extracted.events) {
          if (!evt || !evt.title || !evt.eventDate || evt.eventDate < todayIso) continue;
          const dObj = new Date(`${evt.eventDate}T12:00:00Z`);
          const dateDisplay = !isNaN(dObj.getTime())
            ? dObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
            : evt.eventDate;
          events.push({
            id: `abbey-evt-${evt.eventDate}-${evt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`,
            title: evt.title,
            eventDate: evt.eventDate,
            dateDisplay,
            time: evt.time || 'All Day',
            eventTime: evt.time ? `${dateDisplay} (${evt.time})` : dateDisplay,
            venue: this.schoolName,
            content: evt.details || `${evt.title} at ${this.schoolName}.`,
            url: src.sourceUrl,
            sourceUrl: src.sourceUrl,
            timestamp: `${evt.eventDate}T00:00:00.000Z`,
            isRegular: false,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: Array.isArray(evt.yearGroups) && evt.yearGroups.length > 0 ? evt.yearGroups : ['All Years'],
            category: 'School Diary',
            sourceId: this.id,
            sourceName: this.name
          });
        }
      }
      return { news, events, governance, planning: [] };
    }

    if (kind === 'term-dates') {
      try {
        const res = await fetch(src.sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
          signal: AbortSignal.timeout(7000)
        });
        if (res && res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const todayIso = new Date().toISOString().split('T')[0];
          const blockLines = [];
          $('main p, main li, main h2, main h3, main tr').each((_, el) => {
            const line = $(el).text().replace(/\s+/g, ' ').trim();
            if (line) blockLines.push(line);
          });

          const dateLineRe = /^([A-Za-z0-9 '&\/(),-]{3,55}?)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
          const seenEvt = new Set();
          for (const line of blockLines) {
            const m = line.match(dateLineRe);
            if (!m) continue;
            const label = m[1].replace(/[-–:]+$/, '').trim();
            const isoDate = parseDayMonthYear(m[2], m[3], m[4]);
            if (!isoDate || isoDate < todayIso || !label) continue;
            if (!/open|inset|half term|term|holiday|bank holiday|easter|christmas/i.test(label)) continue;
            const key = `${isoDate}-${label.toLowerCase()}`;
            if (seenEvt.has(key)) continue;
            seenEvt.add(key);

            const dObj = new Date(`${isoDate}T12:00:00Z`);
            const dateDisplay = !isNaN(dObj.getTime())
              ? dObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              : isoDate;
            events.push({
              id: `abbey-term-${isoDate}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
              title: label,
              eventDate: isoDate,
              dateDisplay,
              time: 'School Calendar',
              eventTime: dateDisplay,
              venue: this.schoolName,
              content: `${label} (${dateDisplay}) — Abbey College 2026/27 Term Dates.`,
              url: src.sourceUrl,
              sourceUrl: src.sourceUrl,
              timestamp: `${isoDate}T00:00:00.000Z`,
              isRegular: false,
              relevance: 'school',
              isWholeVillage: false,
              school: this.schoolSlug,
              schoolName: this.schoolName,
              yearGroups: ['All Years'],
              category: 'Term Dates',
              sourceId: this.id,
              sourceName: this.name
            });
          }
        }
      } catch (err) {
        console.warn(`[AbbeyCollegeSource] Error fetching term dates:`, err.message);
      }
      return { news, events, governance, planning: [] };
    }

    if (kind === 'parents-forum') {
      try {
        const res = await fetch(src.sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
          signal: AbortSignal.timeout(7000)
        });
        if (res && res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const mainText = $('main').text().replace(/\s+/g, ' ').trim();
          governance.push({
            id: 'abbey-parents-forum',
            title: "Abbey College Parent's Forum",
            meetingTitle: "Abbey College Parent's Forum (Half-Termly Meeting)",
            meetingDate: dateOnly,
            date: dateOnly,
            summary: mainText.slice(0, 380),
            content: mainText.slice(0, 600),
            url: src.sourceUrl,
            sourceUrl: src.sourceUrl,
            timestamp: src.timestamp,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: ['All Years'],
            sourceId: this.id,
            sourceName: this.name
          });
        }
      } catch (err) {
        console.warn(`[AbbeyCollegeSource] Error fetching parent forum:`, err.message);
      }
      return { news, events, governance, planning: [] };
    }

    // Good News blog post
    try {
      const res = await fetch(src.sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(7000)
      });
      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const heading = $('h1').first().text().trim() || meta.title;
        const bodyText = $('article, main').first().text().replace(/\s+/g, ' ').trim();
        const cleanBody = bodyText.replace(heading, '').trim();
        news.push({
          id: `abbey-post-${Buffer.from(src.sourceUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14)}`,
          title: heading,
          content: cleanBody.slice(0, 800) || heading,
          summary: cleanBody.slice(0, 260) || heading,
          url: src.sourceUrl,
          sourceUrl: src.sourceUrl,
          date: dateOnly,
          timestamp: src.timestamp,
          relevance: 'school',
          isWholeVillage: false,
          school: this.schoolSlug,
          schoolName: this.schoolName,
          yearGroups: ['All Years'],
          category: 'Good News',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    } catch (err) {
      console.warn(`[AbbeyCollegeSource] Error fetching post ${src.sourceUrl}:`, err.message);
    }

    return { news, events, governance, planning: [] };
  }
}

module.exports = AbbeyCollegeSource;
