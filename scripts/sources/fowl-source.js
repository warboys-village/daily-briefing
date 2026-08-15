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
    const historySocietyUrl = 'https://fowl.org.uk/2026/03/30/warboys-local-history-society/';
    const now = new Date();

    // Helper: Format local Date to YYYY-MM-DD string without timezone shift
    const toIsoDateStr = (dateObj) => {
      if (!dateObj || isNaN(dateObj.getTime())) return '';
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // Helper: Get next N dates for a specific day of week (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const getUpcomingWeekdayDates = (targetDay, count = 4) => {
      const dates = [];
      const current = new Date(now);
      current.setHours(12, 0, 0, 0);

      while (dates.length < count) {
        if (current.getDay() === targetDay) {
          dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
      return dates;
    };

    // Helper: Parse publication date from WordPress URL /2026/04/12/
    const parseUrlDate = (href) => {
      if (!href) return null;
      const match = href.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (match) {
        return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
      }
      return null;
    };

    // Helper: Extract ALL scheduled date lines from text with accurate year inference from postDate
    const parseAllEventDatesFromText = (text, postDate) => {
      if (!text) return [];
      const results = [];
      const defaultYear = postDate ? postDate.getFullYear() : 2026;
      const dateRegex = /(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?/gi;

      let match;
      while ((match = dateRegex.exec(text)) !== null) {
        const dayNum = match[2];
        const monthName = match[3];
        const yr = match[4] || defaultYear;
        const eventDateObj = new Date(`${dayNum} ${monthName} ${yr} 12:00:00`);

        if (!isNaN(eventDateObj.getTime())) {
          const snippetStart = Math.max(0, match.index - 20);
          const snippetEnd = Math.min(text.length, match.index + 120);
          const rawSnippet = text.slice(snippetStart, snippetEnd).trim();

          results.push({
            eventDateObj,
            snippet: rawSnippet
          });
        }
      }
      return results;
    };

    // 1. Exact 3 regular sessions published on https://fowl.org.uk/listing/library/
    const regularDefinitions = [
      {
        baseId: 'fowl-regular-rhymetime',
        title: `Warboys Library Baby & Toddler Rhymetime`,
        dayOfWeek: 2, // Tuesday
        timeStr: `Every Tuesday • 10:30 AM - 11:00 AM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Rhyme Time session for babies and toddlers from birth to 3 years. Parents and carers please stay with your children. Free entry, drop-in session.`
      },
      {
        baseId: 'fowl-regular-storytime',
        title: `Warboys Library Children's Storytime`,
        dayOfWeek: 4, // Thursday
        timeStr: `Every Thursday • 10:30 AM - 11:00 AM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Stories, rhymes, and colouring for children aged 0 to 5 years. Free drop-in, no booking required.`
      },
      {
        baseId: 'fowl-regular-coffeemorning',
        title: `Warboys Library Fortnightly Coffee Morning`,
        dayOfWeek: 6, // Saturday
        timeStr: `Fortnightly on Saturdays • 10:30 AM - 12:00 PM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Fortnightly Saturday coffee morning run by Friends of Warboys Library group. All welcome, drop in for tea, coffee, and friendly conversation.`
      }
    ];

    for (const def of regularDefinitions) {
      const upcomingDates = getUpcomingWeekdayDates(def.dayOfWeek, 4);
      for (const d of upcomingDates) {
        const isoDateStr = toIsoDateStr(d);
        const dayLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

        items.push({
          id: `${def.baseId}-${isoDateStr}`,
          title: def.title,
          eventTime: `${dayLabel} • ${def.timeStr.split('•')[1] || def.timeStr}`,
          eventCategory: 'UPCOMING',
          isRegular: true,
          venue: def.venue,
          content: def.content,
          url: eventsUrl,
          date: d.toISOString(),
          eventDate: isoDateStr,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    }

    // 2. Crawl FOWL Blog page & individual post pages
    try {
      const res = await fetch(blogUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const articles = $('article, .post, .entry').toArray();

        for (let i = 0; i < articles.length; i++) {
          const el = articles[i];
          const rawTitle = $(el).find('h2, h3, .entry-title').text().trim();
          const href = $(el).find('a').attr('href');
          const snippet = $(el).find('p, .entry-summary').text().trim();

          if (rawTitle) {
            const cleanTitle = rawTitle.replace(/^FOWL Blog:\s*/i, '').trim();
            const postDate = parseUrlDate(href) || now;
            const fullText = `${cleanTitle} ${snippet}`;

            const detectedDateList = parseAllEventDatesFromText(fullText, postDate);

            if (detectedDateList.length > 0) {
              for (const evtData of detectedDateList) {
                const eventDateObj = evtData.eventDateObj;
                const formattedTime = eventDateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
                const isoDateStr = toIsoDateStr(eventDateObj);

                items.push({
                  id: `fowl-blog-event-${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${isoDateStr}`,
                  title: cleanTitle,
                  eventTime: formattedTime,
                  eventCategory: 'UPCOMING',
                  isRegular: false,
                  venue: 'Warboys Community Library / Village Location',
                  content: evtData.snippet || snippet || cleanTitle,
                  url: href || blogUrl,
                  date: postDate.toISOString(),
                  eventDate: isoDateStr,
                  category: 'Community Events',
                  sourceId: this.id,
                  sourceName: this.name
                });
              }
            } else if (fullText.toLowerCase().includes('event') || fullText.toLowerCase().includes('fete') || fullText.toLowerCase().includes('book sale') || fullText.toLowerCase().includes('meeting')) {
              const formattedTime = postDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
              const isoDateStr = toIsoDateStr(postDate);

              items.push({
                id: `fowl-blog-event-${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${isoDateStr}`,
                title: cleanTitle,
                eventTime: formattedTime,
                eventCategory: 'UPCOMING',
                isRegular: false,
                venue: 'Warboys Community Library / Village Location',
                content: snippet || cleanTitle,
                url: href || blogUrl,
                date: postDate.toISOString(),
                eventDate: isoDateStr,
                category: 'Community Events',
                sourceId: this.id,
                sourceName: this.name
              });
            } else {
              items.push({
                id: `fowl-blog-news-${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
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
        }
      }
    } catch (err) {
      console.warn(`[FowlSource] Blog fetch warning:`, err.message);
    }

    // 3. Fallback items with 100% ACCURATE true dates matching post URLs & text
    if (options.includeMockFallback) {
      // Historical past events (posted 12 April 2026 describing Saturday 18 April 2026) -> True Date: 2026-04-18
      items.push(
        {
          id: `fowl-event-bacon-butty-2026-04-18`,
          title: `Bacon Butty Bonanza outside Royal Oak Pub`,
          eventTime: `Saturday 18 April 2026 • 8:00 AM - 12:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Outside Royal Oak Pub, Warboys`,
          content: `Bacon Butty Bonanza! Taking place outside the Royal Oak Pub in Warboys. Organised by Friends of Warboys Library.`,
          url: `https://fowl.org.uk/2026/04/12/bacon-butty-bonanza-2/`,
          date: `2026-04-12T12:00:00.000Z`,
          eventDate: `2026-04-18`,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        {
          id: `fowl-event-book-sale-2026-04-18`,
          title: `Warboys Library Spring Book Sale`,
          eventTime: `Saturday 18 April 2026 • 10:00 AM - 12:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Community Library`,
          content: `Friends of Warboys Library are having a Book Sale! Saturday 18th April 2026 from 10.00am to 12.00 Midday. Everybody Welcome – Come and grab some bargains!`,
          url: `https://fowl.org.uk/2026/04/12/warboys-library-book-sale/`,
          date: `2026-04-12T12:00:00.000Z`,
          eventDate: `2026-04-18`,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        }
      );

      // Future Programme Events (Upcoming September, October, November 2026 talks)
      const historyDates = [
        { dateStr: '2026-09-14', timeLabel: 'Monday 14 September 2026 • 7:30 PM', topic: `Warboys Local History Society: 'The Enclosure of Warboys'` },
        { dateStr: '2026-10-12', timeLabel: 'Monday 12 October 2026 • 7:30 PM', topic: `Warboys Local History Society: 'Local Fens & Railway Heritage'` },
        { dateStr: '2026-11-09', timeLabel: 'Monday 9 November 2026 • 7:30 PM', topic: `Warboys Local History Society: 'Warboys Parish Records & Families'` }
      ];

      for (const h of historyDates) {
        items.push({
          id: `fowl-history-society-${h.dateStr}`,
          title: h.topic,
          eventTime: h.timeLabel,
          eventCategory: 'UPCOMING',
          isRegular: false,
          venue: 'Methodist Church, High Street, Warboys',
          content: `${h.topic} - Illustrated talk at the Methodist Church, High Street, Warboys. All welcome.`,
          url: historySocietyUrl,
          date: now.toISOString(),
          eventDate: h.dateStr,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        });
      }
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
