const Parser = require('rss-parser');
const cheerio = require('cheerio');
const BaseSource = require('./base-source');
const { getCachedArticleSummary, setCachedArticleSummary } = require('../utils/processed-doc-cache');
const { isDeathNotice } = require('../utils/pre-filter');

class RssSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName', 'county'];
  }

  constructor(config, context) {
    super(config, context);
    this.parser = new Parser({
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' }
    });
  }

  /**
   * Routine 1: Discover available RSS items from the feed.
   */
  async establishSources(options = {}) {
    const { maxDays = 21 } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);

    const sources = [];
    try {
      const feed = await this.parser.parseURL(this.config.url);
      for (const entry of feed.items || []) {
        const itemDate = entry.isoDate ? new Date(entry.isoDate) : (entry.pubDate ? new Date(entry.pubDate) : new Date());
        if (itemDate < cutoffDate) continue;

        sources.push({
          sourceId: entry.guid || entry.link,
          sourceUrl: entry.link,
          url: entry.link,
          timestamp: itemDate.toISOString(),
          metadata: {
            title: (entry.title || '').trim(),
            contentSnippet: (entry.contentSnippet || entry.content || entry.summary || '').trim(),
            pubDate: entry.pubDate,
            isoDate: entry.isoDate
          }
        });
      }
    } catch (err) {
      console.warn(`[RssSource] Error establishing sources from ${this.name} (${this.config.url}):`, err.message);
    }

    return sources;
  }

  /**
   * Routine 2: Fetch and analyse full text for uncached RSS items, evaluating place relevance.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const newsItems = [];
    const eventItems = [];
    const placeName = this.placeName;
    const county = this.county;
    const keyword = (this.config.filterKeyword || placeName || '').toLowerCase();

    for (const src of sourcesToAnalyse) {
      const title = (src.metadata?.title || '').trim();
      const initialSnippet = (src.metadata?.contentSnippet || '').trim();
      let fullText = `${title} ${initialSnippet}`;
      let articleBody = initialSnippet;

      // Deep fetch article body if from huntspost.co.uk
      if (src.url && src.url.includes('huntspost.co.uk')) {
        const cached = getCachedArticleSummary(src.url);
        if (cached && cached.cleanSummary) {
          articleBody = cached.cleanSummary;
          fullText = `${title} ${articleBody}`;
        } else {
          try {
            const res = await fetch(src.url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
              signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
              const html = await res.text();
              const $ = cheerio.load(html);
              $('.share-links, .social-share, .article-share, .utility-bar, script, style').remove();

              let fetchedBody = $('article p, .article-body p')
                .map((i, el) => $(el).text().trim())
                .get()
                .filter(text => text.length > 0 && !/^(?:share|comments?|follow us|subscribe)/i.test(text))
                .join(' ');

              fetchedBody = fetchedBody.replace(/^(?:share\s*)+/i, '').trim();
              if (fetchedBody && fetchedBody.length > 80) {
                articleBody = fetchedBody;
                fullText = `${title} ${articleBody}`;
                setCachedArticleSummary(src.url, title, articleBody);
              }
            }
          } catch (err) {
            // Fall back to initial snippet on fetch error
          }
        }
      }

      // Keyword & place relevance filter
      if (keyword && !fullText.toLowerCase().includes(keyword)) {
        continue;
      }

      // 5-layer death notice filtering
      if (isDeathNotice(title, fullText)) {
        continue;
      }

      const itemRecord = {
        id: `rss-${Buffer.from(src.url).toString('base64').slice(0, 16)}`,
        title,
        content: articleBody.slice(0, 1200),
        summary: articleBody.slice(0, 300),
        url: src.url,
        sourceUrl: src.url,
        date: src.timestamp,
        timestamp: src.timestamp,
        category: 'Village News',
        sourceId: this.id,
        sourceName: this.name
      };

      if ((title + articleBody).toLowerCase().includes('event') || (title + articleBody).toLowerCase().includes('festival')) {
        eventItems.push(itemRecord);
      } else {
        newsItems.push(itemRecord);
      }
    }

    return {
      news: newsItems,
      events: eventItems
    };
  }
}

module.exports = RssSource;
