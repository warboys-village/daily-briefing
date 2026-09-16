const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { getCachedImageText, setCachedImageText } = require('../utils/processed-doc-cache');

const MONTH_MAP = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11
};

class FowlSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://fowl.org.uk/';
  }

  /**
   * Helper: Parse event date from text if present.
   */
  extractEventDate(text, now = new Date()) {
    if (!text) return null;

    // Pattern 1: DD/MM/YYYY
    const slashMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (slashMatch) {
      const day = parseInt(slashMatch[1], 10);
      const month = parseInt(slashMatch[2], 10) - 1;
      const year = parseInt(slashMatch[3], 10);
      const d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }

    // Pattern 2: Day Month [Year] e.g. "Saturday 7th November 2026" or "7th November2026" or "18th April"
    const dmMatch = text.match(/\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*([a-zA-Z]+)\s*(\d{4})?\b/i);
    if (dmMatch) {
      const day = parseInt(dmMatch[1], 10);
      const monthName = dmMatch[2].toLowerCase();
      if (monthName in MONTH_MAP) {
        const month = MONTH_MAP[monthName];
        let year = dmMatch[3] ? parseInt(dmMatch[3], 10) : now.getFullYear();
        const d = new Date(year, month, day, 12, 0, 0);
        if (!isNaN(d.getTime())) return d;
      }
    }

    // Pattern 3: Month Day [Year] e.g. "November 7th 2026"
    const mdMatch = text.match(/\b([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i);
    if (mdMatch) {
      const monthName = mdMatch[1].toLowerCase();
      if (monthName in MONTH_MAP) {
        const day = parseInt(mdMatch[2], 10);
        const month = MONTH_MAP[monthName];
        let year = mdMatch[3] ? parseInt(mdMatch[3], 10) : now.getFullYear();
        const d = new Date(year, month, day, 12, 0, 0);
        if (!isNaN(d.getTime())) return d;
      }
    }

    return null;
  }

  /**
   * Helper: Extract event time string from text.
   */
  extractTimeDisplay(text) {
    if (!text) return '';
    const match = text.match(/(?:(?:from|at|taking place from)\s*)?(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*(?:to|-|until)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|midday|noon)?|\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)\b)/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Routine 1: Discovers community listings and library activity items from the FOWL website.
   * Discovers discrete posts from the main site and crawlable listing/events pages,
   * never emitting category/archive URLs directly as items.
   */
  async establishSources(options = {}) {
    const sources = [];
    const seenUrls = new Set();
    const listingPagesToCrawl = new Set();

    const isExcludedArchive = (url) => {
      if (!url) return true;
      return url.includes('/category/') ||
             url.includes('/author/') ||
             url.includes('/tag/') ||
             url.includes('/page/') ||
             url.endsWith('/events/') ||
             url.endsWith('/whats-on/') ||
             url.endsWith('/whats-on') ||
             url.endsWith('/contact/') ||
             url.endsWith('/contact');
    };

    const isDiscreteItem = (url) => {
      if (!url || !url.startsWith('http')) return false;
      if (isExcludedArchive(url)) return false;
      return url.includes('fowl.org.uk/listing/') ||
             Boolean(url.match(/fowl\.org\.uk\/\d{4}\/\d{2}\//));
    };

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('[data-url], a[href]').each((i, el) => {
          const href = $(el).attr('data-url') || $(el).attr('href');
          if (!href || !href.startsWith('http')) return;

          if (href.includes('fowl.org.uk/category/events') || href.includes('fowl.org.uk/whats-on')) {
            listingPagesToCrawl.add(href.split('#')[0]);
          } else if (isDiscreteItem(href) && !seenUrls.has(href)) {
            seenUrls.add(href);
            const title = $(el).text().trim() || $(el).attr('title') || 'FOWL Community Listing';
            let baseId = `fowl-${href.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)}`;
            if (href.includes('rhymetime')) baseId = 'fowl-regular-rhymetime';
            else if (href.includes('storytime')) baseId = 'fowl-regular-storytime';

            sources.push({
              sourceId: baseId,
              sourceUrl: href,
              url: href,
              timestamp: new Date().toISOString(),
              metadata: { title, url: href }
            });
          }
        });
      }

      // Crawl discovered listing/category pages to find discrete post links
      for (const listingUrl of Array.from(listingPagesToCrawl).slice(0, 3)) {
        try {
          const lRes = await fetch(listingUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
            signal: AbortSignal.timeout(6000)
          }).catch(() => null);

          if (lRes && lRes.ok) {
            const lHtml = await lRes.text();
            const $l = cheerio.load(lHtml);
            $l('.post__title a, .hp-listing__title a, .entry-title a, article a, h2 a, h3 a').each((i, el) => {
              const href = $l(el).attr('href');
              if (href && isDiscreteItem(href) && !seenUrls.has(href)) {
                seenUrls.add(href);
                const title = $l(el).text().trim() || 'FOWL Community Event';
                let baseId = `fowl-${href.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)}`;
                sources.push({
                  sourceId: baseId,
                  sourceUrl: href,
                  url: href,
                  timestamp: new Date().toISOString(),
                  metadata: { title, url: href }
                });
              }
            });
          }
        } catch {
          // Continue gracefully
        }
      }
    } catch (err) {
      console.warn(`[FowlSource] Web query warning:`, err.message);
    }

    // Ensure core library sessions are enumerated if scraping was partial
    const coreSessions = [
      {
        sourceId: 'fowl-regular-rhymetime',
        sourceUrl: 'https://fowl.org.uk/listing/rhymetime-0-3-years/',
        title: 'Warboys Library Baby & Toddler Rhymetime',
        dayOfWeek: 2,
        timeStr: 'Every Tuesday • 10:30 AM - 11:00 AM'
      },
      {
        sourceId: 'fowl-regular-storytime',
        sourceUrl: 'https://fowl.org.uk/listing/storytime-0-5-years/',
        title: 'Warboys Library Children\'s Storytime',
        dayOfWeek: 4,
        timeStr: 'Every Thursday • 10:30 AM - 11:00 AM'
      },
      {
        sourceId: 'fowl-regular-coffeemorning',
        sourceUrl: 'https://fowl.org.uk/listing/coffee-morning/',
        title: 'Warboys Library Fortnightly Coffee Morning',
        dayOfWeek: 6,
        timeStr: 'Fortnightly on Saturdays • 10:30 AM - 12:00 PM'
      }
    ];

    for (const session of coreSessions) {
      if (!sources.some(s => s.sourceId === session.sourceId)) {
        sources.push({
          sourceId: session.sourceId,
          sourceUrl: session.sourceUrl,
          url: session.sourceUrl,
          timestamp: new Date().toISOString(),
          metadata: {
            title: session.title,
            dayOfWeek: session.dayOfWeek,
            timeStr: session.timeStr
          }
        });
      }
    }

    return sources;
  }

  /**
   * Routine 2: Process a single FOWL community item through the pipeline.
   */
  async processSingleItem(src, options = {}) {
    if (!src || !src.url || src.url.includes('/category/') || src.url.includes('/page/')) {
      return { events: [], news: [], governance: [], planning: [] };
    }

    const now = options.nowDate ? new Date(options.nowDate) : new Date();
    const eventItems = [];
    const newsItems = [];

    const toIsoDateStr = (dateObj) => {
      if (!dateObj || isNaN(dateObj.getTime())) return '';
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const getNextWeekdayDate = (targetDay) => {
      const current = new Date(now);
      current.setHours(12, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        if (current.getDay() === targetDay) return new Date(current);
        current.setDate(current.getDate() + 1);
      }
      return current;
    };

    let itemTitle = src.metadata?.title || 'Community Activity';
    let bodyText = '';
    const candidateImages = [];

    // Step 1: Gather content
    if (src.url && src.url.startsWith('http')) {
      try {
        const res = await fetch(src.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $('.menu, nav, footer, script, style, .hp-pagination, .widget').remove();

          const heading = $('h1, .post__title, .hp-listing__title, .entry-title').first().text().trim();
          if (heading) itemTitle = heading;

          $('article img, main img, .entry-content img, .post__text img, .hp-post__text img').each((i, el) => {
            const srcAttr = $(el).attr('src');
            if (srcAttr && srcAttr.startsWith('http') && !srcAttr.includes('logo')) {
              candidateImages.push(srcAttr);
            }
          });

          bodyText = $('.post__text, .hp-post__text, .listing-content, .entry-content, article, main').first().text().replace(/\s+/g, ' ').trim();
        }
      } catch (err) {
        // Fall back gracefully
      }
    }

    // Reject archive pages disguised as single items
    if (itemTitle.toLowerCase() === 'events' || bodyText.toLowerCase().startsWith('events notices')) {
      return { events: [], news: [], governance: [], planning: [] };
    }

    // Step 2: Extract text from relevant images (cached)
    let imageOcrText = '';
    for (const imgUrl of candidateImages.slice(0, 1)) {
      let ocr = getCachedImageText(imgUrl, options);
      if (!ocr && this.llm && typeof this.llm.extractImageText === 'function') {
        ocr = await this.llm.extractImageText(imgUrl);
        if (ocr) setCachedImageText(imgUrl, ocr, { sourceUrl: src.url }, options);
      }
      if (ocr) imageOcrText += ` [Poster Text: ${ocr}]`;
    }

    // Step 3 & 4: Categorise regular sessions vs discrete events vs general news
    const isRhyme = src.sourceId.includes('rhymetime') || itemTitle.toLowerCase().includes('rhymetime');
    const isStory = src.sourceId.includes('storytime') || itemTitle.toLowerCase().includes('storytime');
    const isCoffee = src.sourceId.includes('coffeemorning') || itemTitle.toLowerCase().includes('coffee-morning');

    if (isRhyme || isStory || isCoffee) {
      let dayOfWeek = 2; // Tuesday
      let timeStr = 'Every Tuesday • 10:30 AM - 11:00 AM';
      let title = 'Warboys Library Baby & Toddler Rhymetime';
      let desc = 'Rhyme Time session for babies and toddlers from birth to 3 years. Free drop-in session.';

      if (isStory) {
        dayOfWeek = 4; // Thursday
        timeStr = 'Every Thursday • 10:30 AM - 11:00 AM';
        title = 'Warboys Library Children\'s Storytime';
        desc = 'Stories, rhymes, and colouring for children aged 0 to 5 years. Free drop-in, no booking required.';
      } else if (isCoffee) {
        dayOfWeek = 6; // Saturday
        timeStr = 'Fortnightly on Saturdays • 10:30 AM - 12:00 PM';
        title = 'Warboys Library Fortnightly Coffee Morning';
        desc = 'Fortnightly Saturday coffee morning run by Friends of Warboys Library group. All welcome.';
      }

      const nextDate = getNextWeekdayDate(dayOfWeek);
      const isoDateStr = toIsoDateStr(nextDate);
      const dayLabel = nextDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

      eventItems.push({
        id: `${src.sourceId}-${isoDateStr}`,
        title,
        eventTime: `${dayLabel} • ${timeStr.split('•')[1] || timeStr}`,
        eventCategory: 'UPCOMING',
        isRegular: true,
        venue: 'Warboys Community Library, 52 High Street',
        content: `${desc}${imageOcrText}`,
        url: src.url,
        sourceUrl: src.sourceUrl,
        date: nextDate.toISOString(),
        timestamp: nextDate.toISOString(),
        eventDate: isoDateStr,
        category: 'Community Events',
        sourceId: this.id,
        sourceName: this.name
      });
    } else {
      // Check for discrete event dates in the content or poster text
      const fullContent = `${itemTitle} ${bodyText} ${imageOcrText}`;
      const eventDate = this.extractEventDate(fullContent, now);

      if (eventDate) {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        // Discard past events
        if (eventDate >= todayStart) {
          const isoDateStr = toIsoDateStr(eventDate);
          const dayLabel = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
          const extractedTime = this.extractTimeDisplay(fullContent);
          const timeDisplay = extractedTime ? `${dayLabel} • ${extractedTime}` : dayLabel;

          eventItems.push({
            id: `fowl-event-${src.sourceId.replace(/[^a-zA-Z0-9-]/g, '')}-${isoDateStr}`,
            title: itemTitle,
            eventTime: timeDisplay,
            eventCategory: 'UPCOMING',
            isRegular: false,
            venue: 'Warboys Community Library, 52 High Street',
            content: bodyText.slice(0, 1000) + imageOcrText,
            url: src.url,
            sourceUrl: src.sourceUrl,
            date: eventDate.toISOString(),
            timestamp: eventDate.toISOString(),
            eventDate: isoDateStr,
            category: 'Community Events',
            sourceId: this.id,
            sourceName: this.name
          });
        }
      } else if (bodyText.length > 50) {
        // Genuine non-event community news
        newsItems.push({
          id: `fowl-${Buffer.from(src.url).toString('base64').slice(0, 16)}`,
          title: itemTitle,
          content: bodyText.slice(0, 1000) + imageOcrText,
          summary: bodyText.slice(0, 250),
          url: src.url,
          sourceUrl: src.sourceUrl,
          date: src.timestamp,
          timestamp: src.timestamp,
          category: 'Village News',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    }

    return {
      events: eventItems,
      news: newsItems,
      governance: [],
      planning: []
    };
  }
}

module.exports = FowlSource;
