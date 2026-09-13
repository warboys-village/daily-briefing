const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

function parseNewsletterDate(text, href) {
  const str = `${text} ${href}`.toLowerCase();

  const monthMap = {
    jan: '01', january: '01', feb: '02', february: '02',
    mar: '03', march: '03', apr: '04', april: '04',
    may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11',
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

  return new Date().toISOString();
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
        signal: AbortSignal.timeout(8000)
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

    return sources.slice(0, 3);
  }

  /**
   * Routine 2: Process a single newsletter PDF.
   */
  async processSingleItem(src, options = {}) {
    const news = [];
    const governance = [];
    const meta = src.metadata || {};
    const nlTitle = meta.title || 'Ramsey Town Council Newsletter';
    const nlDate = (src.timestamp || '').split('T')[0] || new Date().toISOString().split('T')[0];

    if (src.sourceUrl && src.sourceUrl.endsWith('.pdf')) {
      const pdfData = await parsePdfFromUrl(src.sourceUrl, options);
      if (pdfData && pdfData.text) {
        if (this.llm && typeof this.llm.extractStructuredItems === 'function') {
          const llmResult = await this.llm.extractStructuredItems(pdfData.text, {
            title: nlTitle,
            url: src.sourceUrl,
            placeName: this.placeName,
            county: this.county
          });
          if (llmResult) {
            return llmResult;
          }
        }

        const paragraphs = (pdfData.paragraphs || []).filter(p => p.length > 60);
        for (let i = 0; i < Math.min(paragraphs.length, 2); i++) {
          const p = paragraphs[i];
          const headline = p.slice(0, 90).replace(/\.\s.*$/, '').trim();
          news.push({
            id: `ramsey-nl-${i}-${nlDate}`,
            title: `${nlTitle}: ${headline}`,
            date: nlDate,
            timestamp: src.timestamp,
            content: p,
            summary: p.slice(0, 240) + '...',
            url: src.sourceUrl,
            sourceUrl: src.sourceUrl,
            category: 'Village News',
            sourceId: this.id,
            sourceName: this.name
          });
        }
      }
    }

    return {
      governance,
      news,
      events: [],
      planning: []
    };
  }
}

module.exports = RamseyNewsletterSource;
