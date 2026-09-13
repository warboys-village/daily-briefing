const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class LibraryEventsSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.url = config.url || 'https://info.cambridgeshire.gov.uk/kb5/cambridgeshire/directory/results.action?camcommunitychannel=6-4&location_postcode__outcode=PE26&sortorder=1&sorttype=field&sortfield=__created';
  }

  /**
   * Routine 1: Discovers library events and community activities in the target area.
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

        $('.hit_title a, .result_item h3 a, article h2 a').each((i, el) => {
          const title = $(el).text().trim();
          const href = $(el).attr('href');
          if (title && href) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            sources.push({
              sourceId: `lib-evt-${i}`,
              sourceUrl: fullUrl,
              url: fullUrl,
              timestamp: new Date().toISOString(),
              metadata: { title }
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[LibraryEventsSource] Query warning: ${err.message}`);
    }

    return sources;
  }

  /**
   * Routine 2: Process an individual library event.
   */
  async processSingleItem(src, options = {}) {
    const meta = src.metadata || {};
    let title = meta.title || 'Library Community Event';
    let bodyText = '';
    let eventTime = 'Weekly Session';
    let eventDate = (src.timestamp || '').split('T')[0] || new Date().toISOString().split('T')[0];

    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const heading = $('h1').text().trim();
        if (heading) title = heading;
        bodyText = $('.description, article, main, .content').text().replace(/\s+/g, ' ').trim();
      }
    } catch (err) {
      // Fall back to title snippet
    }

    return {
      events: [
        {
          id: src.sourceId,
          title,
          eventTime,
          eventDate,
          venue: `${this.placeName} Library`,
          content: bodyText ? bodyText.slice(0, 500) : `${title} hosted at ${this.placeName} Library.`,
          url: src.sourceUrl,
          sourceUrl: src.sourceUrl,
          timestamp: src.timestamp,
          isRegular: true,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        }
      ],
      news: [],
      governance: [],
      planning: []
    };
  }
}

module.exports = LibraryEventsSource;
