const Parser = require('rss-parser');
const cheerio = require('cheerio');
const BaseSource = require('./base-source');
const { getCachedArticleSummary, setCachedArticleSummary, getCachedImageText, setCachedImageText } = require('../utils/processed-doc-cache');
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
   * Routine 2: Process a single RSS item through the 4-step pipeline.
   */
  async processSingleItem(src, options = {}) {
    const title = (src.metadata?.title || '').trim();
    const initialSnippet = (src.metadata?.contentSnippet || '').trim();
    let articleBody = initialSnippet;
    const candidateImages = [];

    // Step 1: Gather content (deep fetch article body from web)
    if (src.url && src.url.startsWith('http')) {
      const cached = getCachedArticleSummary(src.url, options);
      if (cached && cached.cleanSummary) {
        articleBody = cached.cleanSummary;
      } else {
        try {
          const res = await fetch(src.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
            signal: AbortSignal.timeout(6000)
          });
          if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            $('.share-links, .social-share, .article-share, .utility-bar, script, style, nav, footer').remove();

            // Collect candidate article images for text extraction
            $('article img, .article-body img, main img').each((i, el) => {
              const srcAttr = $(el).attr('src') || $(el).attr('data-src');
              if (srcAttr && srcAttr.startsWith('http') && !srcAttr.includes('icon') && !srcAttr.includes('logo') && !srcAttr.includes('avatar')) {
                candidateImages.push(srcAttr);
              }
            });

            let fetchedBody = $('article p, .article-body p, main p')
              .map((i, el) => $(el).text().trim())
              .get()
              .filter(text => text.length > 0 && !/^(?:share|comments?|follow us|subscribe|advertisement)/i.test(text))
              .join(' ');

            fetchedBody = fetchedBody.replace(/^(?:share\s*)+/i, '').trim();
            if (fetchedBody && fetchedBody.length > 80) {
              articleBody = fetchedBody;
              setCachedArticleSummary(src.url, title, articleBody, options);
            }
          }
        } catch (err) {
          // Fall back to initial snippet on fetch failure
        }
      }
    }

    // Step 2: Extract text from relevant images (cached)
    let extractedImageText = '';
    for (const imgUrl of candidateImages.slice(0, 2)) {
      let imgText = getCachedImageText(imgUrl, options);
      if (!imgText && this.llm && typeof this.llm.extractImageText === 'function') {
        imgText = await this.llm.extractImageText(imgUrl);
        if (imgText) {
          setCachedImageText(imgUrl, imgText, { sourceUrl: src.url }, options);
        }
      }
      if (imgText) {
        extractedImageText += `\n[Text from Image]: ${imgText}`;
      }
    }

    const fullText = `${title} ${articleBody} ${extractedImageText}`.trim();

    // Step 3: Categorise & filter for place relevance
    const keyword = (this.config.filterKeyword || this.placeName || '').toLowerCase();
    if (keyword && !fullText.toLowerCase().includes(keyword)) {
      return { news: [], events: [], governance: [], planning: [] };
    }

    if (isDeathNotice(title, fullText, src.url)) {
      return { news: [], events: [], governance: [], planning: [] };
    }

    // Step 4: Summarise using LLM or structured extractor
    if (this.llm && typeof this.llm.extractStructuredItems === 'function') {
      const llmResult = await this.llm.extractStructuredItems(fullText, {
        title,
        url: src.url,
        placeName: this.placeName,
        county: this.county
      });
      if (llmResult && (llmResult.news.length > 0 || llmResult.events.length > 0)) {
        return llmResult;
      }
    }

    // Deterministic fallback
    const isEvent = /\b(festival|fair|fete|carnival|quiz|concert|showcase|open day|exhibition|market)\b/i.test(fullText);
    const itemRecord = {
      id: `rss-${Buffer.from(src.url).toString('base64').slice(0, 16)}`,
      title,
      content: articleBody.slice(0, 1200),
      summary: articleBody.slice(0, 300),
      url: src.url,
      sourceUrl: src.url,
      date: src.timestamp,
      timestamp: src.timestamp,
      category: isEvent ? 'Community Events' : 'Village News',
      sourceId: this.id,
      sourceName: this.name
    };

    if (isEvent) {
      itemRecord.eventTime = 'Upcoming Event';
      itemRecord.eventDate = src.timestamp.split('T')[0];
      itemRecord.venue = `${this.placeName}, ${this.county}`;
      return { news: [], events: [itemRecord], governance: [], planning: [] };
    } else {
      return { news: [itemRecord], events: [], governance: [], planning: [] };
    }
  }
}

module.exports = RssSource;
