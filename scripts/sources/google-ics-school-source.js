const BaseSource = require('./base-source');
const cheerio = require('cheerio');

/**
 * Unfolds iCalendar lines (CRLF + space/tab continuation) and parses VEVENT blocks.
 */
function parseIcsEvents(icsText) {
  const unfolded = String(icsText || '').replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1)
      .replace(/\\n/gi, ' ')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();
    const key = keyPart.split(';')[0].toUpperCase();
    current[key] = val;
    if (key === 'DTSTART') current.DTSTART_RAW = line;
  }

  return events;
}

function parseIcsDate(dtStr) {
  if (!dtStr) return null;
  const dateOnly = dtStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return {
      isoDate: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`,
      timeStr: 'All Day'
    };
  }
  const dateTime = dtStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTime) {
    const isoDate = `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`;
    const timeStr = `${dateTime[4]}:${dateTime[5]}`;
    return { isoDate, timeStr };
  }
  return null;
}

/**
 * Reusable collector for schools publishing a public Google Calendar (.ics) feed
 * and an optional newsletters page.
 */
class GoogleIcsSchoolSource extends BaseSource {
  static get requiredInputs() {
    return ['icsUrl', 'schoolSlug', 'schoolName', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.icsUrl = config.icsUrl || (config.params && config.params.icsUrl);
    this.newsletterUrl = config.url || config.newsletterUrl || (config.params && config.params.newsletterUrl) || '';
    this.schoolSlug = config.schoolSlug || (config.params && config.params.schoolSlug);
    this.schoolName = config.schoolName || (config.params && config.params.schoolName);
  }

  async establishSources() {
    const todayIso = new Date().toISOString().split('T')[0];
    const sources = [
      {
        sourceId: `${this.schoolSlug}-ics`,
        sourceUrl: this.icsUrl,
        url: this.icsUrl,
        timestamp: `${todayIso}T00:00:00.000Z`,
        metadata: { kind: 'ics' }
      }
    ];
    if (this.newsletterUrl) {
      sources.push({
        sourceId: `${this.schoolSlug}-newsletters`,
        sourceUrl: this.newsletterUrl,
        url: this.newsletterUrl,
        timestamp: `${todayIso}T00:00:00.000Z`,
        metadata: { kind: 'newsletters' }
      });
    }
    return sources;
  }

  async processSingleItem(src) {
    const events = [];
    const news = [];
    const kind = src.metadata && src.metadata.kind;

    if (kind === 'ics') {
      try {
        const res = await fetch(src.sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VillageDaily/1.0)' },
          signal: AbortSignal.timeout(8000)
        });
        if (res && res.ok) {
          const icsText = await res.text();
          const parsed = parseIcsEvents(icsText);
          const todayIso = new Date().toISOString().split('T')[0];
          const horizon = new Date();
          horizon.setDate(horizon.getDate() + 180);
          const horizonIso = horizon.toISOString().split('T')[0];

          for (const ve of parsed) {
            if (!ve.SUMMARY) continue;
            const dt = parseIcsDate(ve.DTSTART);
            if (!dt || dt.isoDate < todayIso || dt.isoDate > horizonIso) continue;

            const dObj = new Date(`${dt.isoDate}T12:00:00Z`);
            const dateDisplay = !isNaN(dObj.getTime())
              ? dObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              : dt.isoDate;

            events.push({
              id: `${this.schoolSlug}-ics-${ve.UID || dt.isoDate}-${ve.SUMMARY.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
              title: ve.SUMMARY,
              eventDate: dt.isoDate,
              dateDisplay,
              time: dt.timeStr,
              eventTime: dt.timeStr === 'All Day' ? dateDisplay : `${dateDisplay} (${dt.timeStr})`,
              venue: ve.LOCATION || this.schoolName,
              content: ve.DESCRIPTION || `${ve.SUMMARY} at ${this.schoolName}.`,
              url: this.newsletterUrl || this.icsUrl,
              sourceUrl: this.icsUrl,
              timestamp: `${dt.isoDate}T00:00:00.000Z`,
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
          }
        }
      } catch (err) {
        console.warn(`[GoogleIcsSchoolSource] Error fetching ICS ${src.sourceUrl}:`, err.message);
      }
    } else if (kind === 'newsletters') {
      try {
        const res = await fetch(src.sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VillageDaily/1.0)' },
          signal: AbortSignal.timeout(8000)
        });
        if (res && res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const seen = new Set();
          $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (!href || (!href.toLowerCase().includes('.pdf') && !/newsletter|letter|update/i.test(text))) return;
            if (href.startsWith('#') || href.startsWith('mailto:')) return;
            const fullUrl = href.startsWith('http') ? href : new URL(href, src.sourceUrl).toString();
            if (fullUrl === src.sourceUrl || seen.has(fullUrl)) return;
            seen.add(fullUrl);
            if (!text || text.length < 4) return;
            const contextText = $(el).closest('li, p, div, tr').text().replace(/\s+/g, ' ').trim();
            const parsedDate = this.extractDateFromTextOrUrl(contextText || text, fullUrl);
            if (parsedDate && this.isOlderThanDays(parsedDate, 21)) return;
            const itemDate = parsedDate || new Date();
            const itemIso = itemDate.toISOString();
            const expiresAt = new Date(itemDate.getTime() + 21 * 86400000).toISOString();
            news.push({
              id: `${this.schoolSlug}-nl-${Buffer.from(fullUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
              title: `${this.schoolName}: ${text}`,
              content: `${text} published on ${this.schoolName} newsletters page.`,
              summary: `${text} published by ${this.schoolName}.`,
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
        console.warn(`[GoogleIcsSchoolSource] Error fetching newsletters ${src.sourceUrl}:`, err.message);
      }
    }

    return { news: news.slice(0, 6), events, governance: [], planning: [] };
  }
}

module.exports = GoogleIcsSchoolSource;
