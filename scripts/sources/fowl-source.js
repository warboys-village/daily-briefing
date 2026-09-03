const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class FowlSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://fowl.org.uk/';
  }

  /**
   * Routine 1: Enumerate regular library session templates and blog event links.
   */
  async establishSources(options = {}) {
    const sources = [
      {
        sourceId: 'fowl-regular-rhymetime',
        sourceUrl: 'https://fowl.org.uk/listing/library/',
        url: 'https://fowl.org.uk/listing/library/',
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'regular',
          baseId: 'fowl-regular-rhymetime',
          title: `Warboys Library Baby & Toddler Rhymetime`,
          dayOfWeek: 2, // Tuesday
          timeStr: `Every Tuesday • 10:30 AM - 11:00 AM`,
          venue: `Warboys Community Library, 52 High Street`,
          content: `Rhyme Time session for babies and toddlers from birth to 3 years. Parents and carers please stay with your children. Free entry, drop-in session.`
        }
      },
      {
        sourceId: 'fowl-regular-storytime',
        sourceUrl: 'https://fowl.org.uk/listing/library/',
        url: 'https://fowl.org.uk/listing/library/',
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'regular',
          baseId: 'fowl-regular-storytime',
          title: `Warboys Library Children's Storytime`,
          dayOfWeek: 4, // Thursday
          timeStr: `Every Thursday • 10:30 AM - 11:00 AM`,
          venue: `Warboys Community Library, 52 High Street`,
          content: `Stories, rhymes, and colouring for children aged 0 to 5 years. Free drop-in, no booking required.`
        }
      },
      {
        sourceId: 'fowl-regular-coffeemorning',
        sourceUrl: 'https://fowl.org.uk/listing/library/',
        url: 'https://fowl.org.uk/listing/library/',
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'regular',
          baseId: 'fowl-regular-coffeemorning',
          title: `Warboys Library Fortnightly Coffee Morning`,
          dayOfWeek: 6, // Saturday
          timeStr: `Fortnightly on Saturdays • 10:30 AM - 12:00 PM`,
          venue: `Warboys Community Library, 52 High Street`,
          content: `Fortnightly Saturday coffee morning run by Friends of Warboys Library group. All welcome, drop in for tea, coffee, and friendly conversation.`
        }
      },
      {
        sourceId: 'fowl-history-society',
        sourceUrl: 'https://fowl.org.uk/2026/03/30/warboys-local-history-society/',
        url: 'https://fowl.org.uk/2026/03/30/warboys-local-history-society/',
        timestamp: '2026-03-30T12:00:00.000Z',
        metadata: {
          type: 'history-society'
        }
      }
    ];

    return sources;
  }

  /**
   * Routine 2: Format upcoming session dates and parse blog event items.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const eventItems = [];
    const newsItems = [];
    const now = options.nowDate || new Date();

    const toIsoDateStr = (dateObj) => {
      if (!dateObj || isNaN(dateObj.getTime())) return '';
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const getUpcomingWeekdayDates = (targetDay, count = 1) => {
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

    for (const src of sourcesToAnalyse) {
      if (src.metadata?.type === 'regular') {
        const def = src.metadata;
        const upcomingDates = getUpcomingWeekdayDates(def.dayOfWeek, 1);
        for (const d of upcomingDates) {
          const isoDateStr = toIsoDateStr(d);
          const dayLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

          eventItems.push({
            id: `${def.baseId}-${isoDateStr}`,
            title: def.title,
            eventTime: `${dayLabel} • ${def.timeStr.split('•')[1] || def.timeStr}`,
            eventCategory: 'UPCOMING',
            isRegular: true,
            venue: def.venue,
            content: def.content,
            url: src.url,
            sourceUrl: src.sourceUrl,
            date: d.toISOString(),
            timestamp: d.toISOString(),
            eventDate: isoDateStr,
            category: 'Community Events',
            sourceId: this.id,
            sourceName: this.name
          });
        }
      } else if (src.metadata?.type === 'history-society') {
        // Known scheduled talks from the Local History Society
        eventItems.push(
          {
            id: `fowl-history-society-2026-09-07`,
            title: `Warboys Local History Society: 'Bravery, Beheadings and Barbeques'`,
            eventTime: `Monday 7 September 2026 • 7:30 PM`,
            eventCategory: `UPCOMING`,
            isRegular: false,
            venue: `Methodist Church, High Street, Warboys`,
            content: `Warboys Local History Society: 'Bravery, Beheadings and Barbeques' (Speaker: Rev Ruth Clay) - Meeting at Methodist Church, High Street, Warboys at 7.30pm. All welcome. Charge for non-members £3.00.`,
            url: src.url,
            sourceUrl: src.sourceUrl,
            date: `2026-03-30T12:00:00.000Z`,
            timestamp: `2026-03-30T12:00:00.000Z`,
            eventDate: `2026-09-07`,
            category: 'Community Events',
            sourceId: this.id,
            sourceName: this.name
          },
          {
            id: `fowl-history-society-2026-10-05`,
            title: `Warboys Local History Society: 'Operation Epsilon (more on Farm Hall)'`,
            eventTime: `Monday 5 October 2026 • 7:30 PM`,
            eventCategory: `UPCOMING`,
            isRegular: false,
            venue: `Methodist Church, High Street, Warboys`,
            content: `Warboys Local History Society: 'Operation Epsilon (more on Farm Hall)' (Speaker: Roger Leivers) - Meeting at Methodist Church, High Street, Warboys at 7.30pm. All welcome. Charge for non-members £3.00.`,
            url: src.url,
            sourceUrl: src.sourceUrl,
            date: `2026-03-30T12:00:00.000Z`,
            timestamp: `2026-03-30T12:00:00.000Z`,
            eventDate: `2026-10-05`,
            category: 'Community Events',
            sourceId: this.id,
            sourceName: this.name
          }
        );
      }
    }

    return {
      events: eventItems,
      news: newsItems
    };
  }
}

module.exports = FowlSource;
