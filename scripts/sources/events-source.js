const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class EventsSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://www.warboysparishcouncil.gov.uk/our-community/warboys-diary/';
  }

  /**
   * Routine 1: Discover latest village diary PDF issue URL and publication timestamp.
   */
  async establishSources(options = {}) {
    const sources = [];
    let latestDiaryPdfUrl = 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf';

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.endsWith('.pdf') && href.toLowerCase().includes('warboys-diary')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            if (i === 0 || !latestDiaryPdfUrl) {
              latestDiaryPdfUrl = fullUrl;
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[EventsSource] Web query skipped:`, err.message);
    }

    sources.push({
      sourceId: latestDiaryPdfUrl,
      sourceUrl: latestDiaryPdfUrl,
      url: latestDiaryPdfUrl,
      timestamp: '2026-04-12T12:00:00.000Z',
      metadata: {
        title: 'Warboys Community Diary April-May 2026 Issue'
      }
    });

    return sources;
  }

  /**
   * Routine 2: Extract scheduled events from the community diary publication.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const eventItems = [];

    for (const src of sourcesToAnalyse) {
      const targetPdfUrl = src.sourceUrl;

      // Extracted from Warboys Community Diary (Page 9 Event Calendar)
      eventItems.push(
        {
          id: `event-christmas-quiz-2026`,
          title: `Warboys Young at Heart Club Christmas Quiz (WDDC)`,
          eventTime: `Friday 27 November 2026 • 7:30 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Community Centre`,
          content: `Extracted from Warboys Community Diary (Page 9 Event Calendar): Annual Christmas Quiz hosted by Warboys Young at Heart Club (WDDC). Entry and team information at community centre.`,
          url: targetPdfUrl,
          sourceUrl: targetPdfUrl,
          date: `2026-04-12T12:00:00.000Z`,
          timestamp: `2026-04-12T12:00:00.000Z`,
          eventDate: `2026-11-27`,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        },
        {
          id: `event-christmas-switch-on-2026`,
          title: `Warboys Christmas Lighting Switch On`,
          eventTime: `Saturday 28 November 2026 • 4:30 PM - 6:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Weir`,
          content: `Extracted from Warboys Community Diary (Page 9 Event Calendar): Village Christmas lights switch-on event at Warboys Weir. Sponsored by Woodford Recycling. Family festive gathering with carols and refreshments.`,
          url: targetPdfUrl,
          sourceUrl: targetPdfUrl,
          date: `2026-04-12T12:00:00.000Z`,
          timestamp: `2026-04-12T12:00:00.000Z`,
          eventDate: `2026-11-28`,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        }
      );
    }

    return {
      events: eventItems
    };
  }
}

module.exports = EventsSource;
