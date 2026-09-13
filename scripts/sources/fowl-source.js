const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { getCachedImageText, setCachedImageText } = require('../utils/processed-doc-cache');

class FowlSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://fowl.org.uk/';
  }

  /**
   * Routine 1: Discovers community listings and library activity items from the FOWL website.
   */
  async establishSources(options = {}) {
    const sources = [];
    const seenUrls = new Set();

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
          if (!href) return;

          const isFowlItem = href.includes('fowl.org.uk/listing/') ||
                             href.includes('fowl.org.uk/category/events/') ||
                             href.includes('fowl.org.uk/whats-on');

          if (isFowlItem && !seenUrls.has(href)) {
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
              metadata: {
                title,
                url: href
              }
            });
          }
        });
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
   * Routine 2: Process a single FOWL community item through the 4-step pipeline.
   */
  async processSingleItem(src, options = {}) {
    const now = options.nowDate || new Date();
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
          $('.menu, nav, footer, script, style').remove();

          const heading = $('h1').text().trim();
          if (heading) itemTitle = heading;

          $('article img, main img, .entry-content img').each((i, el) => {
            const srcAttr = $(el).attr('src');
            if (srcAttr && srcAttr.startsWith('http') && !srcAttr.includes('logo')) {
              candidateImages.push(srcAttr);
            }
          });

          bodyText = $('article, main, .entry-content, .listing-content').text().replace(/\s+/g, ' ').trim();
        }
      } catch (err) {
        // Fall back gracefully
      }
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

    // Step 3 & 4: Categorise and format regular library sessions or events
    const isRhyme = src.sourceId.includes('rhymetime') || itemTitle.toLowerCase().includes('rhymetime');
    const isStory = src.sourceId.includes('storytime') || itemTitle.toLowerCase().includes('storytime');
    const isCoffee = src.sourceId.includes('coffeemorning') || itemTitle.toLowerCase().includes('coffee');

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
    } else if (bodyText.length > 50) {
      // General community notice or listing
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

    return {
      events: eventItems,
      news: newsItems,
      governance: [],
      planning: []
    };
  }
}

module.exports = FowlSource;
