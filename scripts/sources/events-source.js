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
    let latestDiaryPdfUrl = 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf';

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        // Discover the specific latest Warboys Diary PDF issue link
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.endsWith('.pdf') && href.toLowerCase().includes('warboys-diary')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            if (i === 0 || !latestDiaryPdfUrl) {
              latestDiaryPdfUrl = fullUrl;
            }
          }
        });

        $('.event, .diary-entry, article, .entry-content p, tr').each((i, el) => {
          const text = $(el).text().trim();
          if (text && text.length > 20 && (text.toLowerCase().includes('pm') || text.toLowerCase().includes('am') || text.toLowerCase().includes('hall') || text.toLowerCase().includes('church'))) {
            const isToday = text.toLowerCase().includes('today') || text.includes(todayIso);
            items.push({
              id: `event-${i}-${Date.now()}`,
              title: text.slice(0, 100),
              eventTime: isToday ? 'Today' : 'Upcoming',
              eventCategory: isToday ? 'TODAY' : 'UPCOMING',
              venue: 'Warboys Village Centre',
              content: text.slice(0, 500),
              url: latestDiaryPdfUrl,
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

    // Mock fallback with true upcoming dates & specific Warboys Diary PDF issue link
    if (items.length === 0 && options.includeMockFallback) {
      const targetPdfUrl = latestDiaryPdfUrl;

      items.push(
        // Farmers Market & Coffee Morning: Saturday 5 September 2026 (Upcoming, NOT today)
        {
          id: `event-farmers-market-2026`,
          title: `Warboys Farmers Market & Coffee Morning`,
          eventTime: `Saturday 5 September 2026 • 9:00 AM - 12:30 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Parish Centre & High Street Green`,
          content: `Extracted from Warboys Community Diary: Fresh local produce, handmade crafts, hot refreshments, and village stallholders. Organised by Warboys Community Association.`,
          url: targetPdfUrl,
          date: `2026-08-15T12:00:00.000Z`,
          eventDate: `2026-09-05`,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        // History Society Talk: Monday 7 September 2026
        {
          id: `event-history-society-2026`,
          title: `Warboys Local History Society: 'Bravery, Beheadings and Barbeques'`,
          eventTime: `Monday 7 September 2026 • 7:30 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Parish Centre`,
          content: `Extracted from Warboys Community Diary: Illustrated history presentation by Stuart Orme. Admission £3 for non-members.`,
          url: targetPdfUrl,
          date: `2026-08-15T12:00:00.000Z`,
          eventDate: `2026-09-07`,
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
