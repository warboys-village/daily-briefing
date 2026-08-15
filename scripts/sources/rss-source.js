const Parser = require('rss-parser');
const BaseSource = require('./base-source');

class RssSource extends BaseSource {
  constructor(config) {
    super(config);
    this.parser = new Parser({
      headers: { 'User-Agent': 'VillageDailyBot/1.0 (+https://github.com/village-daily)' }
    });
  }

  async extract(options = {}) {
    const { maxDays = 7, filterKeyword } = options;
    const keyword = filterKeyword || this.config.filterKeyword;
    const items = [];

    try {
      const feed = await this.parser.parseURL(this.config.url);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxDays);

      for (const entry of feed.items || []) {
        const itemDate = entry.isoDate ? new Date(entry.isoDate) : (entry.pubDate ? new Date(entry.pubDate) : new Date());
        if (itemDate < cutoffDate) continue;

        const title = (entry.title || '').trim();
        const content = (entry.contentSnippet || entry.content || entry.summary || '').trim();
        const fullText = `${title} ${content}`;

        if (keyword && !fullText.toLowerCase().includes(keyword.toLowerCase())) {
          continue;
        }

        items.push({
          id: entry.guid || entry.link || `${this.id}-${Date.now()}-${Math.random()}`,
          title,
          content: content.slice(0, 1000),
          url: entry.link || this.config.url,
          date: itemDate.toISOString(),
          category: 'News',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    } catch (err) {
      console.warn(`[RssSource:${this.id}] Error fetching feed ${this.config.url}:`, err.message);
    }

    return items;
  }
}

module.exports = RssSource;
