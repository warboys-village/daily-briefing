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
    const urlsToTry = [this.url];
    try {
      const editionsUrl = new URL('/editions/', this.url).toString();
      if (!urlsToTry.includes(editionsUrl)) urlsToTry.push(editionsUrl);
    } catch {
      // ignore URL constructor error
    }

    try {
      for (const targetUrl of urlsToTry) {
        if (sources.length > 0) break;
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
          signal: AbortSignal.timeout(6000)
        }).catch(() => null);

        if (res && res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);

          $('a[href$=".pdf"]').each((i, el) => {
            const href = $(el).attr('href');
            const linkText = $(el).text().toLowerCase();
            const lowerHref = (href || '').toLowerCase();
            const placeLower = (this.placeName || 'warboys').toLowerCase();

            if (href && (lowerHref.includes(placeLower) || lowerHref.includes('huntingdon') || lowerHref.includes('hunts') || linkText.includes(placeLower) || linkText.includes('huntingdon') || linkText.includes('hunts'))) {
              const fullPdfUrl = href.startsWith('http') ? href : new URL(href, targetUrl).toString();
              sources.push({
                sourceId: fullPdfUrl,
                sourceUrl: fullPdfUrl,
                url: fullPdfUrl,
                timestamp: new Date().toISOString(),
                metadata: { type: 'pdf' }
              });
              return false; // take latest matching edition
            }
          });
        }
      }
    } catch (err) {
      console.warn(`[VillageSceneSource] Web query warning:`, err.message);
    }

    // Strictly guard mock fallback: only provide mock source if explicitly requested
    if (sources.length === 0 && options.includeMockFallback) {
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
          const placeLower = (this.placeName || 'warboys').toLowerCase();
          // Extract only if meaningful editorial content mentions the village and is not just pure advertorial listings
          if (text.length > 100 && text.toLowerCase().includes(placeLower)) {
            // Check for editorial / community signals (avoiding pure advertising directory blocks)
            const isEditorial = /community|council|parish|fete|event|notice|exhibition|charity|volunteers|club|society/i.test(text);
            if (isEditorial) {
              newsItems.push({
                id: `village-scene-pdf-${Date.now()}`,
                title: `Village Scene Magazine Latest Community Notices`,
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
        }
      } else if (options.includeMockFallback && src.metadata?.type === 'mock') {
        newsItems.push({
          id: `sample-scene-item-${Date.now()}`,
          title: `Warboys Community Updates in Village Scene`,
          content: `Village Scene Magazine community notice updates for local residents.`,
          summary: `Village Scene Magazine community notice updates for local residents.`,
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
