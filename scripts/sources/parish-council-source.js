const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parseDocxFromUrl } = require('../utils/docx-parser');

class ParishCouncilSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list';
  }

  // Helper: Parse non-ISO dd mm yy dates with various separators (. / - space)
  parseDdMmYyDate(textStr) {
    if (!textStr) return null;
    const match = textStr.match(/\b(\d{1,2})[\.\/\-\s](\d{1,2})[\.\/\-\s](\d{2,4})\b/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;

      const d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  /**
   * Routine 1: Scrape calendar list to discover meeting minutes documents.
   */
  async establishSources(options = {}) {
    const sources = [];

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.endsWith('.docx') && (href.includes('-mn-') || href.includes('minutes') || href.includes('04-mn'))) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            if (!sources.some(s => s.sourceUrl === fullUrl)) {
              // Parse date from URL filename (e.g. 04-mn-13.07.26.docx)
              let meetingDate = new Date().toISOString();
              const dateMatch = href.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
              if (dateMatch) {
                let yr = parseInt(dateMatch[3], 10);
                if (yr < 100) yr += 2000;
                const d = new Date(yr, parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[1], 10), 19, 0, 0);
                if (!isNaN(d.getTime())) meetingDate = d.toISOString();
              }

              sources.push({
                sourceId: fullUrl,
                sourceUrl: fullUrl,
                url: fullUrl,
                timestamp: meetingDate,
                metadata: {
                  title: $(el).text().trim() || 'Parish Council Meeting Minutes',
                  type: 'docx'
                }
              });
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[ParishCouncilSource] Web query warning:`, err.message);
    }

    return sources;
  }

  /**
   * Routine 2: Parse DOCX text from uncached meeting documents, extracting agenda items & event notices.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const governanceItems = [];
    const eventItems = [];

    for (const src of sourcesToAnalyse) {
      const extractedDocxItems = await parseDocxFromUrl(src.sourceUrl);
      if (extractedDocxItems && extractedDocxItems.length > 0) {
        for (const item of extractedDocxItems) {
          const isEvent = (item.category || '').toLowerCase().includes('event') || item.eventDate;
          const enhancedItem = {
            ...item,
            sourceId: this.id,
            sourceName: this.name,
            sourceUrl: src.sourceUrl,
            timestamp: src.timestamp
          };

          if (isEvent) {
            eventItems.push(enhancedItem);
          } else {
            governanceItems.push(enhancedItem);
          }
        }
      }
    }

    return {
      governance: governanceItems,
      events: eventItems
    };
  }
}

module.exports = ParishCouncilSource;
