const Parser = require('rss-parser');
const cheerio = require('cheerio');
const BaseSource = require('./base-source');
const { getCachedArticleSummary, setCachedArticleSummary, getCachedImageText, setCachedImageText } = require('../utils/processed-doc-cache');
const { isDeathNotice } = require('../utils/pre-filter');

const JUNK_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header', 'aside',
  '.share-links', '.social-share', '.article-share', '.utility-bar',
  '.author-bio', '.comments', '.comment-box', '.cookie-banner',
  
  // Newsquest in-article link widgets and commercial ad blocks
  '.link-builder-block',
  '.mar-block-ad',
  '.mar-block-ad--in-article',
  '.advert-container',
  '.ad-container',
  '.ad-wrapper',
  '.in-article-ad',
  '.ad-placeholder',
  '[class*="advert"]',
  '[id*="advert"]',
  '[class*="sponsored"]',
  '[class*="commercial"]',
  '[class*="newsletter-signup"]',
  '[class*="newsletter-promo"]',

  // Related story widgets and recommendations
  '.related-articles',
  '.recommended-articles',
  '.read-more',
  '.read-more-links',
  '[class*="read-more"]',
  '[class*="readMore"]',
  '[class*="related-"]',
  '[class*="related_"]',
  '[class*="relatedArticle"]',
  '[class*="recommended"]',
  '[class*="recommendation"]',
  '[class*="inline-embed"]',
  '[class*="embedded-article"]',
  '.taboola',
  '.outbrain'
];

class RssSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName', 'county'];
  }

  static extractCleanArticleBody(html) {
    if (!html) return '';
    const $ = cheerio.load(html);
    $(JUNK_SELECTORS.join(', ')).remove();

    const fetchedParagraphs = [];
    $('article p, .article-body p, main p').each((i, el) => {
      const $p = $(el);
      if ($p.parents('ul, ol, li, figure, figcaption, table').length > 0) {
        return;
      }
      const text = $p.text().trim();
      if (!text || text.length < 5) return;
      if (/^(?:read\s+more|see\s+also|related|more:|advertisement|share|comments?|follow\s+us|subscribe)/i.test(text)) {
        return;
      }
      const linkText = $p.find('a').text().trim();
      if (linkText && text.length < 120 && (linkText.length / text.length) > 0.8) {
        return;
      }
      fetchedParagraphs.push(text);
    });

    return fetchedParagraphs.join(' ').replace(/^(?:share\s*)+/i, '').trim();
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
            $(JUNK_SELECTORS.join(', ')).remove();

            // Collect candidate article images for text extraction
            $('article img, .article-body img, main img').each((i, el) => {
              const srcAttr = $(el).attr('src') || $(el).attr('data-src');
              if (srcAttr && srcAttr.startsWith('http') && !srcAttr.includes('icon') && !srcAttr.includes('logo') && !srcAttr.includes('avatar') && !srcAttr.includes('ad')) {
                candidateImages.push(srcAttr);
              }
            });

            const fetchedBody = RssSource.extractCleanArticleBody(html);
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
    const rawKeyword = (this.config.filterKeyword || this.placeName || '').trim();
    if (rawKeyword) {
      const escapedKw = rawKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeRegex = new RegExp(`\\b${escapedKw}\\b`, 'i');
      if (!placeRegex.test(fullText)) {
        return { news: [], events: [], governance: [], planning: [] };
      }
    }

    if (isDeathNotice(title, fullText, src.url)) {
      return { news: [], events: [], governance: [], planning: [] };
    }

    // Step 4: Summarise using LLM or structured extractor
    if (this.llm && typeof this.llm.extractStructuredItems === 'function' && !this.llm.isMockMode?.()) {
      const llmResult = await this.llm.extractStructuredItems(fullText, {
        title,
        url: src.url,
        placeName: this.placeName,
        county: this.county
      });
      if (llmResult !== null && typeof llmResult === 'object') {
        // LLM executed successfully. If it returned items, use them.
        // If it returned empty arrays, it authoritatively determined the article has no relevant news/events for this place.
        // Do NOT fall through to the deterministic fallback!
        return {
          news: Array.isArray(llmResult.news) ? llmResult.news : [],
          events: Array.isArray(llmResult.events) ? llmResult.events : [],
          governance: Array.isArray(llmResult.governance) ? llmResult.governance : [],
          planning: Array.isArray(llmResult.planning) ? llmResult.planning : []
        };
      }
    }

    // Deterministic fallback (only when LLM is unavailable, offline/mock, or failed)
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
