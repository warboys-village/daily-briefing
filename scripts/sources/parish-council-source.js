const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parseDocxFromUrl } = require('../utils/docx-parser');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

class ParishCouncilSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list';
  }

  /**
   * Routine 1: Scrape calendar list to discover meeting minutes documents (DOCX and PDF).
   */
  async establishSources(options = {}) {
    const sources = [];

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          const isMinutesDoc = (href.endsWith('.docx') || href.endsWith('.pdf')) &&
                               (href.includes('-mn-') || href.includes('minutes') || href.includes('04-mn'));
          if (isMinutesDoc) {
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
                  type: href.endsWith('.pdf') ? 'pdf' : 'docx'
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
   * Routine 2: Process a single minutes document (DOCX or PDF).
   */
  async processSingleItem(src, options = {}) {
    const governanceItems = [];
    const eventItems = [];

    let extractedItems = [];
    if (src.sourceUrl.endsWith('.docx')) {
      extractedItems = await parseDocxFromUrl(src.sourceUrl, options);
    } else if (src.sourceUrl.endsWith('.pdf')) {
      const pdfData = await parsePdfFromUrl(src.sourceUrl, options);
      if (pdfData && pdfData.text) {
        if (this.llm && typeof this.llm.extractStructuredItems === 'function') {
          const llmResult = await this.llm.extractStructuredItems(pdfData.text, {
            title: src.metadata?.title || 'Parish Council Minutes',
            url: src.sourceUrl,
            placeName: this.placeName,
            county: this.county
          });
          if (llmResult) {
            return llmResult;
          }
        }
      }
    }

    if (Array.isArray(extractedItems)) {
      for (const item of extractedItems) {
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

    return {
      governance: governanceItems,
      events: eventItems,
      news: [],
      planning: []
    };
  }
}

module.exports = ParishCouncilSource;
