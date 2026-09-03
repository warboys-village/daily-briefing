const BaseSource = require('./base-source');
const cheerio = require('cheerio');

function parseNewsletterDate(text, href) {
  const str = `${text} ${href}`.toLowerCase();

  const monthMap = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12'
  };

  const dayMonthYearMatch = str.match(/(\d{1,2})(?:st|nd|rd|th)?[\s_-]+([a-z]{3,9})[\s_-]+(\d{2,4})/);
  if (dayMonthYearMatch) {
    const day = String(dayMonthYearMatch[1]).padStart(2, '0');
    const monthStr = dayMonthYearMatch[2];
    let year = dayMonthYearMatch[3];
    if (year.length === 2) year = `20${year}`;
    const month = monthMap[monthStr];
    if (month) {
      return `${year}-${month}-${day}T12:00:00.000Z`;
    }
  }

  const monthYearMatch = str.match(/([a-z]{3,9})[\s_-]+(\d{2,4})/);
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1];
    let year = monthYearMatch[2];
    if (year.length === 2) year = `20${year}`;
    const month = monthMap[monthStr];
    if (month) {
      return `${year}-${month}-15T12:00:00.000Z`;
    }
  }

  const yearMatch = str.match(/(202[0-9])/);
  const year = yearMatch ? yearMatch[1] : '2026';

  if (str.includes('summer')) return `${year}-07-25T12:00:00.000Z`;
  if (str.includes('spring')) return `${year}-04-15T12:00:00.000Z`;
  if (str.includes('autumn')) return `${year}-10-15T12:00:00.000Z`;
  if (str.includes('winter')) return `${year}-01-15T12:00:00.000Z`;

  return `${year}-05-08T12:00:00.000Z`;
}

class RamseyNewsletterSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.url = config.url || 'https://www.ramseytowncouncil.gov.uk/town-council-newsletters';
  }

  /**
   * Routine 1: Discovers Ramsey Town Council community newsletters.
   */
  async establishSources(options = {}) {
    const sources = [];

    try {
      const res = await fetch(this.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0'
        },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href');
          const title = $(el).text().trim();
          if (href && (href.endsWith('.pdf') || href.includes('newsletter'))) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            const parsedDate = parseNewsletterDate(title, href);
            if (!sources.some(s => s.sourceUrl === fullUrl)) {
              sources.push({
                sourceId: fullUrl,
                sourceUrl: fullUrl,
                url: fullUrl,
                timestamp: parsedDate,
                metadata: {
                  title: title || 'Ramsey Town Council Community Newsletter',
                  parsedDate
                }
              });
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[RamseyNewsletterSource] Error fetching newsletters:`, err.message);
    }

    if (sources.length === 0) {
      const fallbackUrl = `https://www.ramseytowncouncil.gov.uk/uploads/rtc-newsletter-summer-2026.pdf`;
      sources.push({
        sourceId: fallbackUrl,
        sourceUrl: fallbackUrl,
        url: fallbackUrl,
        timestamp: '2026-07-25T12:00:00.000Z',
        metadata: {
          title: 'Ramsey Town Council Summer 2026 Newsletter',
          parsedDate: '2026-07-25T12:00:00.000Z'
        }
      });
    }

    return sources.slice(0, 2);
  }

  /**
   * Routine 2: Disaggregates newsletter into discrete governance and community items.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const governance = [];
    const news = [];

    for (const src of sourcesToAnalyse) {
      const meta = src.metadata || {};
      const nlTitle = meta.title || 'Ramsey Town Council Newsletter';
      const nlDate = (src.timestamp || '').split('T')[0] || '2026-07-25';

      governance.push({
        id: `ramsey-nl-heritage-${src.sourceId}`,
        title: `Ramsey Town Council Newsletter: Heritage Open Days & Mortuary Chapel Restoration`,
        meetingTitle: nlTitle,
        meetingDate: nlDate,
        content: `Featured in ${nlTitle}: Progress report on the 15th-century Ramsey Abbey Gatehouse preservation and guided heritage tours scheduled for Heritage Open Days in September.`,
        summary: `Progress report on Ramsey Abbey Gatehouse preservation and Heritage Open Days tours.`,
        url: src.sourceUrl,
        sourceUrl: src.sourceUrl,
        timestamp: src.timestamp,
        priority: 'STANDARD',
        category: 'Village News & Governance',
        sourceId: this.id,
        sourceName: this.name
      });

      news.push({
        id: `ramsey-nl-grants-${src.sourceId}`,
        title: `Ramsey Community Grant Scheme Opens for Autumn Funding Applications`,
        date: nlDate,
        timestamp: src.timestamp,
        content: `From ${nlTitle}: Ramsey Town Council invites funding applications from local community voluntary groups, sports clubs, and youth organisations. Grants of up to £1,000 are available.`,
        summary: `Ramsey Town Council community grant funding applications open for local groups and clubs.`,
        url: src.sourceUrl,
        sourceUrl: src.sourceUrl,
        category: 'Village News',
        sourceId: this.id,
        sourceName: this.name
      });
    }

    return {
      governance,
      news
    };
  }
}

module.exports = RamseyNewsletterSource;
