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

    // Helper: Extract ALL scheduled date lines from multi-event programme text
    const parseAllEventDatesFromText = (text, defaultYear = 2026) => {
      if (!text) return [];
      const results = [];
      const dateRegex = /(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?/gi;

      let match;
      while ((match = dateRegex.exec(text)) !== null) {
        const dayNum = match[2];
        const monthName = match[3];
        const yr = match[4] || defaultYear;
        const eventDateObj = new Date(`${dayNum} ${monthName} ${yr} 12:00:00`);

        if (!isNaN(eventDateObj.getTime())) {
          // Extract text snippet surrounding this date
          const snippetStart = Math.max(0, match.index);
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

    // 1. Generate regular weekly library sessions
    const regularDefinitions = [
      {
        baseId: 'fowl-regular-rhymetime',
        title: `Warboys Library Baby & Toddler Rhymetime`,
        dayOfWeek: 2, // Tuesday
        timeStr: `Every Tuesday • 10:30 AM - 11:00 AM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Songs, action rhymes, and storytime for babies and toddlers from birth to 3 years. Free entry, drop-in session.`
      },
      {
        baseId: 'fowl-regular-storytime',
        title: `Warboys Library Children's Storytime`,
        dayOfWeek: 4, // Thursday
        timeStr: `Every Thursday • 10:30 AM - 11:00 AM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Stories, rhymes, and colouring activities for children aged 0 to 5 years. Parents and carers welcome. Free drop-in.`
      },
      {
        baseId: 'fowl-regular-ithelp',
        title: `Warboys Library IT & Digital Helper Drop-In`,
        dayOfWeek: 4, // Thursday
        timeStr: `Every Thursday • 2:00 PM - 4:00 PM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Free weekly digital support for smartphones, tablets, laptops, emails, and internet forms. Friendly volunteer assistance.`
      },
      {
        baseId: 'fowl-regular-craftchat',
        title: `Warboys Library Craft & Chat Social Group`,
        dayOfWeek: 5, // Friday
        timeStr: `Every Friday • 10:30 AM - 12:00 PM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Weekly social crafting morning. Bring your knitting, crochet, sewing, or crafting projects and enjoy tea and conversation.`
      },
      {
        baseId: 'fowl-regular-legoclub',
        title: `Warboys Library Weekly Lego & Board Games Club`,
        dayOfWeek: 6, // Saturday
        timeStr: `Every Saturday • 10:00 AM - 12:00 PM`,
        venue: `Warboys Community Library, 52 High Street`,
        content: `Weekly Lego building and board games session for children and young families. All materials provided. Free drop-in.`
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

    // 2. Crawl FOWL Blog page & individual post pages for single or multi-event programmes
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

            // Extract ALL multi-event dates mentioned in post
            const detectedDateList = parseAllEventDatesFromText(fullText, postDate.getFullYear());

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

    // 3. Multi-event schedule fallback covering Warboys Local History Society & upcoming programme dates
    if (options.includeMockFallback) {
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

      const d1 = new Date(now); d1.setDate(d1.getDate() + 3); // Tuesday 18 Aug
      const d2 = new Date(now); d2.setDate(d2.getDate() + 7); // Saturday 22 Aug

      items.push(
        {
          id: `fowl-event-bacon-butty-${toIsoDateStr(d1)}`,
          title: `Bacon Butty Bonanza outside Royal Oak Pub`,
          eventTime: `${d1.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} • 8:00 AM - 12:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Outside Royal Oak Pub, Warboys`,
          content: `Bacon Butty Bonanza! Taking place outside the Royal Oak Pub in Warboys. Organised by Friends of Warboys Library.`,
          url: `https://fowl.org.uk/2026/04/12/bacon-butty-bonanza-2/`,
          date: now.toISOString(),
          eventDate: toIsoDateStr(d1),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        {
          id: `fowl-event-book-sale-${toIsoDateStr(d2)}`,
          title: `Warboys Library Late-Summer Book Sale`,
          eventTime: `${d2.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} • 10:00 AM - 12:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Community Library`,
          content: `Friends of Warboys Library are having a Book Sale! Saturday morning from 10.00am to 12.00 Midday. Everybody Welcome – Come and grab some bargains!`,
          url: `https://fowl.org.uk/2026/04/12/warboys-library-book-sale/`,
          date: now.toISOString(),
          eventDate: toIsoDateStr(d2),
          category: 'Community Events',
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
