const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { saveCalendar } = require('../utils/events-calendar-store');

class FowlSource extends BaseSource {
  constructor(config) {
    super(config);
    this.url = config.url || 'https://fowl.org.uk/';
  }

  async extract(options = {}) {
    const items = [];
    const eventsUrl = 'https://fowl.org.uk/listing/library/';
    const blogUrl = 'https://fowl.org.uk/blog/';

    // Helper: Parse publication date from WordPress URL /2026/04/12/
    const parseUrlDate = (href) => {
      if (!href) return null;
      const match = href.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (match) {
        return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
      }
      return null;
    };

    // Helper: Detect specific event date inside text
    const parseEventDateFromText = (text, defaultYear = 2026) => {
      if (!text) return null;
      const match = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i) ||
                    text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
      if (match) {
        let day, monthName;
        if (isNaN(parseInt(match[1]))) {
          monthName = match[1];
          day = match[2];
        } else {
          day = match[1];
          monthName = match[2];
        }
        const d = new Date(`${day} ${monthName} ${defaultYear}`);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    };

    // 1. Crawl FOWL Library events page (regular sessions)
    try {
      const res = await fetch(eventsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $('.listing-item, article, .entry-content p, h2, h3').each((i, el) => {
          const text = $(el).text().trim();
          if (text && text.length > 25 && (text.toLowerCase().includes('storytime') || text.toLowerCase().includes('rhymetime') || text.toLowerCase().includes('lego') || text.toLowerCase().includes('book sale'))) {
            items.push({
              id: `fowl-event-${i}-${Date.now()}`,
              title: text.slice(0, 100),
              eventTime: 'Weekly / Regular Session',
              eventCategory: 'UPCOMING',
              isRegular: true,
              venue: 'Warboys Community Library, 52 High Street',
              content: text.slice(0, 400),
              url: eventsUrl,
              date: new Date().toISOString(),
              eventDate: new Date().toISOString(),
              category: 'Community Events',
              sourceId: this.id,
              sourceName: this.name
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[FowlSource] Library listing fetch warning:`, err.message);
    }

    // 2. Crawl FOWL Blog page
    try {
      const res = await fetch(blogUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $('article, .post, .entry').each((i, el) => {
          const rawTitle = $(el).find('h2, h3, .entry-title').text().trim();
          const href = $(el).find('a').attr('href');
          const snippet = $(el).find('p, .entry-summary').text().trim();

          if (rawTitle) {
            const cleanTitle = rawTitle.replace(/^FOWL Blog:\s*/i, '').trim();
            const postDate = parseUrlDate(href) || new Date();
            const fullText = `${cleanTitle} ${snippet}`;

            const detectedEventDate = parseEventDateFromText(fullText, postDate.getFullYear());
            const isEvent = detectedEventDate || fullText.toLowerCase().includes('event') || fullText.toLowerCase().includes('taking place') || fullText.toLowerCase().includes('fete') || fullText.toLowerCase().includes('book sale') || fullText.toLowerCase().includes('meeting') || fullText.toLowerCase().includes('pantomime');

            if (isEvent) {
              const eventDateObj = detectedEventDate || postDate;
              const formattedTime = eventDateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

              items.push({
                id: `fowl-event-${i}-${Date.now()}`,
                title: cleanTitle,
                eventTime: formattedTime,
                eventCategory: 'UPCOMING',
                isRegular: false,
                venue: 'Warboys Village Location',
                content: snippet || cleanTitle,
                url: href || blogUrl,
                date: postDate.toISOString(),
                eventDate: eventDateObj.toISOString(),
                category: 'Community Events',
                sourceId: this.id,
                sourceName: this.name
              });
            } else {
              items.push({
                id: `fowl-blog-${i}-${Date.now()}`,
                title: cleanTitle,
                content: snippet || cleanTitle,
                url: href || blogUrl,
                date: postDate.toISOString(),
                category: 'Village News & Community',
                sourceId: this.id,
                sourceName: this.name
              });
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[FowlSource] Blog fetch warning:`, err.message);
    }

    // Mock fallback covering CURRENT & UPCOMING events relative to today (15 Aug 2026)
    if (items.length === 0 && options.includeMockFallback) {
      const now = new Date();
      
      const d1 = new Date(now); d1.setDate(d1.getDate() + 3); // 18 Aug
      const d2 = new Date(now); d2.setDate(d2.getDate() + 7); // 22 Aug
      const d3 = new Date(now); d3.setDate(d3.getDate() + 14); // 29 Aug

      items.push(
        // FOWL Library regular session (Event)
        {
          id: `fowl-event-mock-01`,
          title: `Warboys Library Weekly Rhymetime & Toddler Story Session`,
          eventTime: `Every Tuesday • 10:30 AM - 11:15 AM`,
          eventCategory: `UPCOMING`,
          isRegular: true,
          venue: `Warboys Community Library, 52 High Street`,
          content: `Regular weekly songs, action rhymes, and storytime for babies, toddlers, and pre-schoolers. Free entry, drop-in session.`,
          url: eventsUrl,
          date: now.toISOString(),
          eventDate: now.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        // Bacon Butty Bonanza -> Upcoming event 18 Aug
        {
          id: `fowl-event-bacon-butty`,
          title: `Bacon Butty Bonanza outside Royal Oak Pub`,
          eventTime: `${d1.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} • 8:00 AM - 12:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Outside Royal Oak Pub, Warboys`,
          content: `Bacon Butty Bonanza! Taking place outside the Royal Oak Pub in Warboys. Organised by Friends of Warboys Library.`,
          url: `https://fowl.org.uk/2026/04/12/bacon-butty-bonanza-2/`,
          date: now.toISOString(),
          eventDate: d1.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        // Warboys Library Book Sale -> Upcoming event 22 Aug
        {
          id: `fowl-event-book-sale`,
          title: `Warboys Library Late-Summer Book Sale`,
          eventTime: `${d2.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} • 10:00 AM - 12:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Community Library`,
          content: `Friends of Warboys Library are having a Book Sale! Saturday morning from 10.00am to 12.00 Midday. Everybody Welcome – Come and grab some bargains!`,
          url: `https://fowl.org.uk/2026/04/12/warboys-library-book-sale/`,
          date: now.toISOString(),
          eventDate: d2.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        // Warboys History Society Talk -> Upcoming event 29 Aug
        {
          id: `fowl-event-history-society`,
          title: `Warboys Local History Society: 'The Enclosure of Warboys'`,
          eventTime: `${d3.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} • 7:30 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Methodist Church, High Street, Warboys`,
          content: `Warboys Local History Society meeting: Illustrated talk on 'The Enclosure of Warboys' by Bill Franklin. All welcome.`,
          url: `https://fowl.org.uk/2026/03/30/warboys-local-history-society/`,
          date: now.toISOString(),
          eventDate: d3.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        // News item
        {
          id: `fowl-news-over-55`,
          title: `Over 55 Club Social Sessions at Sports & Social Club`,
          content: `55Plus Club Event at the Sports & Social Club only £1 at the Door! New Members Welcome.`,
          url: `https://fowl.org.uk/2025/09/12/over-55-club-2/`,
          date: now.toISOString(),
          category: 'Village News & Community',
          sourceId: this.id,
          sourceName: this.name
        }
      );
    }

    // Save current/upcoming event items to persistent repo calendar store
    const eventItemsOnly = items.filter(i => i.category === 'Community Events');
    if (eventItemsOnly.length > 0) {
      saveCalendar(eventItemsOnly);
    }

    return items;
  }
}

module.exports = FowlSource;
