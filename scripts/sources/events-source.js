const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class EventsSource extends BaseSource {
  constructor(config) {
    super(config);
    this.url = config.url || 'https://www.warboysparishcouncil.gov.uk/our-community/warboys-diary/';
  }

  async extract(options = {}) {
    const items = [];
    const todayIso = new Date().toISOString().split('T')[0];

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $('.event, .diary-entry, article, .entry-content p, tr').each((i, el) => {
          const text = $(el).text().trim();
          if (text && text.length > 20 && (text.toLowerCase().includes('pm') || text.toLowerCase().includes('am') || text.toLowerCase().includes('hall') || text.toLowerCase().includes('church'))) {
            const isToday = text.toLowerCase().includes('today') || text.includes(todayIso);
            items.push({
              id: `event-${i}-${Date.now()}`,
              title: text.slice(0, 100),
              eventTime: isToday ? 'Today' : 'Upcoming',
              eventCategory: isToday ? 'TODAY' : 'UPCOMING',
              venue: 'Warboys Village Center / Parish Hall',
              content: text.slice(0, 500),
              url: this.url,
              date: isToday ? new Date().toISOString() : new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
              category: 'Community Events',
              sourceId: this.id,
              sourceName: this.name
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[EventsSource] Web query skipped:`, err.message);
    }

    // Mock fallback covering Today's Events and Upcoming Events
    if (items.length === 0 && options.includeMockFallback) {
      const now = new Date();
      const todayDateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

      const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 5);
      const nextWeekStr = nextWeek.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

      items.push(
        {
          id: `event-today-01`,
          title: `Warboys Farmers Market & Coffee Morning`,
          eventTime: `${todayDateStr} • 9:00 AM - 12:30 PM`,
          eventCategory: `TODAY`,
          venue: `Warboys Parish Centre & High Street Green`,
          content: `Fresh local produce, handmade crafts, hot refreshments, and village stallholders. Organised by Warboys Community Association.`,
          url: this.url,
          date: now.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        {
          id: `event-upcoming-01`,
          title: `Warboys Local History Society Meeting: 'Highways & Byways of Cambridgeshire'`,
          eventTime: `${tomorrowStr} • 7:30 PM`,
          eventCategory: `UPCOMING`,
          venue: `Warboys Village Hall`,
          content: `Illustrated talk by local historian John Smiths. All residents and guests welcome. Entry £3 includes tea and biscuits.`,
          url: this.url,
          date: tomorrow.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        {
          id: `event-upcoming-02`,
          title: `Warboys Community Library Storytime & Craft Session`,
          eventTime: `${nextWeekStr} • 10:30 AM`,
          eventCategory: `UPCOMING`,
          venue: `Warboys Community Library`,
          content: `Free story hour and craft activities for toddlers and pre-school children. Parents and carers welcome.`,
          url: this.url,
          date: nextWeek.toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        }
      );
    }

    return items;
  }
}

module.exports = EventsSource;
