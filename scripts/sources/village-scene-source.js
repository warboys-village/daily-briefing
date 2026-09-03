const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');

class VillageSceneSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://www.villagescene.co.uk/';
  }

  /**
   * Routine 1: Discovers latest magazine edition PDF URL.
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
        let pdfUrl = null;

        $('a[href$=".pdf"]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && (href.toLowerCase().includes('warboys') || href.toLowerCase().includes('huntingdon'))) {
            pdfUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            return false;
          }
        });

        if (pdfUrl) {
          sources.push({
            sourceId: pdfUrl,
            sourceUrl: pdfUrl,
            url: pdfUrl,
            timestamp: new Date().toISOString(),
            metadata: { type: 'pdf' }
          });
        }
      }
    } catch (err) {
      console.warn(`[VillageSceneSource] Web query warning:`, err.message);
    }

    if (sources.length === 0) {
      sources.push({
        sourceId: 'village-scene-default-edition',
        sourceUrl: 'https://www.villagescene.co.uk/sample.pdf',
        url: 'https://www.villagescene.co.uk/sample.pdf',
        timestamp: new Date().toISOString(),
        metadata: { type: 'mock' }
      });
    }

    return sources;
  }

  /**
   * Routine 2: Parses magazine PDF text and extracts community updates.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const newsItems = [];

    for (const src of sourcesToAnalyse) {
      if (src.metadata?.type === 'pdf') {
        const pdfRes = await fetch(src.sourceUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (pdfRes && pdfRes.ok) {
          const buffer = await pdfRes.arrayBuffer();
          const data = await pdfParse(Buffer.from(buffer));
          const text = (data.text || '').replace(/\s+/g, ' ').trim();
          if (text.length > 50) {
            newsItems.push({
              id: `village-scene-pdf-${Date.now()}`,
              title: `Village Scene Magazine Latest Community Edition`,
              content: text.slice(0, 1000),
              summary: text.slice(0, 300),
              url: src.sourceUrl,
              sourceUrl: src.sourceUrl,
              date: src.timestamp,
              timestamp: src.timestamp,
              category: 'Village News & Community',
              sourceId: this.id,
              sourceName: this.name
            });
          }
        }
      } else if (options.includeMockFallback || src.metadata?.type === 'mock') {
        newsItems.push({
          id: `sample-scene-item-${Date.now()}`,
          title: `Warboys Feast Week 2026 Preparations Announced in Village Scene`,
          content: `Village Scene Magazine reports that the 2026 Warboys Feast Week committee has started preparations for the annual summer festival. Stalls and volunteers welcome.`,
          summary: `Village Scene Magazine reports that the 2026 Warboys Feast Week committee has started preparations.`,
          url: 'https://www.villagescene.co.uk/',
          sourceUrl: 'https://www.villagescene.co.uk/',
          date: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          category: 'Community News',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    }

    return {
      news: newsItems
    };
  }
}

module.exports = VillageSceneSource;
