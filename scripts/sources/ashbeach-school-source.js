const BaseSource = require('./base-source');
const cheerio = require('cheerio');

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

function inferSchoolIsoDate(dayNum, monthName, refDate = new Date()) {
  const mIdx = MONTHS[monthName.toLowerCase()];
  if (mIdx === undefined) return null;
  let year = refDate.getFullYear();
  if (refDate.getMonth() >= 8 && mIdx <= 6) year += 1;
  const mm = String(mIdx + 1).padStart(2, '0');
  const dd = String(Number(dayNum)).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Collector for The Ashbeach Primary School (eSchools platform).
 * Extracts upcoming calendar events from homepage/calendar widget, news stories, and newsletter links.
 */
class AshbeachSchoolSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.baseUrl = config.url || 'https://www.ashbeachprimary.co.uk/';
    this.schoolSlug = config.schoolSlug || 'ashbeach';
    this.schoolName = config.schoolName || 'The Ashbeach Primary School';
  }

  async establishSources() {
    const todayIso = new Date().toISOString().split('T')[0];
    return [
      {
        sourceId: 'ashbeach-home',
        sourceUrl: this.baseUrl,
        url: this.baseUrl,
        timestamp: `${todayIso}T00:00:00.000Z`,
        metadata: { kind: 'home' }
      },
      {
        sourceId: 'ashbeach-newsletters',
        sourceUrl: 'https://www.ashbeachprimary.co.uk/page/?title=Newsletters&pid=14',
        url: 'https://www.ashbeachprimary.co.uk/page/?title=Newsletters&pid=14',
        timestamp: `${todayIso}T00:00:00.000Z`,
        metadata: { kind: 'newsletters' }
      }
    ];
  }

  async processSingleItem(src) {
    const events = [];
    const news = [];
    const kind = src.metadata && src.metadata.kind;

    try {
      const res = await fetch(src.sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VillageDaily/1.0)' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res || !res.ok) return { news, events, governance: [], planning: [] };

      const html = await res.text();
      const $ = cheerio.load(html);

      if (kind === 'home') {
        const seenEventUrls = new Set();
        $('a[href*="calendar/"][href*="event="]').each((_, el) => {
          const href = $(el).attr('href');
          const fullUrl = href.startsWith('http') ? href : new URL(href, this.baseUrl).toString();
          if (seenEventUrls.has(fullUrl)) return;
          seenEventUrls.add(fullUrl);

          const text = $(el).text().replace(/\s+/g, ' ').trim();
          const m = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+\1\s+\2\s+(.+?)(?:\s+\d{1,2}\s+[A-Za-z]+.*)?$/);
          const mSimple = !m && text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(.+)$/);
          const match = m || mSimple;
          if (!match) return;

          const isoDate = inferSchoolIsoDate(match[1], match[2]);
          if (!isoDate) return;

          let rawTitle = (match[3] || '').replace(/•.*$/, '').trim();
          rawTitle = rawTitle.replace(/\s+\d{1,2}\s+[A-Za-z]+\s+\d{1,2}\s+[A-Za-z]+.*$/, '').trim();
          if (!rawTitle) return;

          const timeMatch = text.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?(?:\s*-\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)?)?|All Day)/i);
          const timeStr = timeMatch ? timeMatch[1] : 'All Day';

          events.push({
            id: `ashbeach-evt-${isoDate}-${rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
            title: rawTitle,
            eventDate: isoDate,
            dateDisplay: `${match[1]} ${match[2]}`,
            time: timeStr,
            eventTime: `${match[1]} ${match[2]} (${timeStr})`,
            venue: this.schoolName,
            content: `${rawTitle} at ${this.schoolName}.`,
            url: fullUrl,
            sourceUrl: fullUrl,
            timestamp: `${isoDate}T00:00:00.000Z`,
            isRegular: false,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: ['All Years'],
            category: 'School Diary',
            sourceId: this.id,
            sourceName: this.name
          });
        });

        const seenNews = new Set();
        $('a[href*="storyid="]').each((_, el) => {
          const href = $(el).attr('href');
          const fullUrl = href.startsWith('http') ? href : new URL(href, this.baseUrl).toString();
          if (seenNews.has(fullUrl)) return;
          seenNews.add(fullUrl);
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (!text || text.length < 5) return;
          const contextText = $(el).closest('li, article, div, tr').text().replace(/\s+/g, ' ').trim();
          const parsedDate = this.extractDateFromTextOrUrl(contextText || text, fullUrl);
          if (parsedDate && this.isOlderThanDays(parsedDate, 21)) return;
          const itemDate = parsedDate || new Date();
          const itemIso = itemDate.toISOString();
          const expiresAt = new Date(itemDate.getTime() + 21 * 86400000).toISOString();
          news.push({
            id: `ashbeach-story-${Buffer.from(fullUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14)}`,
            title: `${this.schoolName}: ${text.slice(0, 90)}`,
            content: text,
            summary: text.slice(0, 220),
            url: fullUrl,
            sourceUrl: fullUrl,
            date: itemIso.split('T')[0],
            timestamp: itemIso,
            expiresAt,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: ['All Years'],
            category: 'School News',
            sourceId: this.id,
            sourceName: this.name
          });
        });
      } else if (kind === 'newsletters') {
        const seen = new Set();
        $('a').each((_, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (!href || (!href.includes('sway.cloud.microsoft') && !href.toLowerCase().includes('.pdf'))) return;
          const fullUrl = href.startsWith('http') ? href : new URL(href, this.baseUrl).toString();
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          const contextText = $(el).closest('li, p, div, tr').text().replace(/\s+/g, ' ').trim();
          const parsedDate = this.extractDateFromTextOrUrl(contextText || text, fullUrl);
          if (parsedDate && this.isOlderThanDays(parsedDate, 21)) return;
          const itemDate = parsedDate || new Date();
          const itemIso = itemDate.toISOString();
          const expiresAt = new Date(itemDate.getTime() + 21 * 86400000).toISOString();
          news.push({
            id: `ashbeach-nl-${Buffer.from(fullUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14)}`,
            title: `${this.schoolName}: ${text || 'School Newsletter'}`,
            content: `${text || 'School Newsletter'} published by ${this.schoolName}.`,
            summary: `${text || 'School Newsletter'} published by ${this.schoolName}.`,
            url: fullUrl,
            sourceUrl: fullUrl,
            date: itemIso.split('T')[0],
            timestamp: itemIso,
            expiresAt,
            relevance: 'school',
            isWholeVillage: false,
            school: this.schoolSlug,
            schoolName: this.schoolName,
            yearGroups: ['All Years'],
            category: 'School News',
            sourceId: this.id,
            sourceName: this.name
          });
        });
      }
    } catch (err) {
      console.warn(`[AshbeachSchoolSource] Error fetching ${src.sourceUrl}:`, err.message);
    }

    return { news, events, governance: [], planning: [] };
  }
}

module.exports = AshbeachSchoolSource;
