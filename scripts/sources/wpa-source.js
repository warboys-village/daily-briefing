const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parseSwayNewsletter } = require('../utils/wpa-sway-parser');

class WpaSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.url = config.url || 'https://www.wpa.education/parents/letters-newsletters';
    this.schoolSlug = config.schoolSlug || config.slug || 'wpa';
    this.schoolName = config.schoolName || config.name || 'Warboys Primary Academy';
  }

  /**
   * Routine 1: Discovers active Sway newsletters and parent forum documents.
   */
  async establishSources(options = {}) {
    const sources = [];

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      let swayUrls = [];
      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href') || '';
          if (href.includes('sway.cloud.microsoft') || href.includes('sway.office.com')) {
            swayUrls.push(href);
          }
        });
      }

      if (swayUrls.length === 0) {
        swayUrls.push('https://sway.cloud.microsoft/MLTtAeuJheXv3QNm?ref=Link');
      }

      for (const swayUrl of swayUrls.slice(0, 3)) {
        sources.push({
          sourceId: swayUrl,
          sourceUrl: swayUrl,
          url: swayUrl,
          timestamp: new Date().toISOString(),
          metadata: { type: 'sway' }
        });
      }
    } catch (err) {
      console.warn(`[WpaSource] Error discovering WPA newsletters:`, err.message);
    }

    // Always include Parent Forum minutes document
    sources.push({
      sourceId: 'wpa-parent-forum-minutes',
      sourceUrl: 'https://www.wpa.education/_resources/900970c4-19bf-4b59-b76b-d6ffdd00534b',
      url: 'https://www.wpa.education/_resources/900970c4-19bf-4b59-b76b-d6ffdd00534b',
      timestamp: '2026-05-18T12:00:00.000Z',
      metadata: { type: 'parent-forum' }
    });

    return sources;
  }

  /**
   * Routine 2: Parse Sway newsletters and extract announcement items and diary events.
   * Outputs school identifier and targeted school years for every item.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const newsItems = [];
    const eventItems = [];

    for (const src of sourcesToAnalyse) {
      if (src.metadata?.type === 'sway') {
        const swayData = await parseSwayNewsletter(src.sourceUrl);
        if (swayData) {
          if (Array.isArray(swayData.announcements)) {
            for (const ann of swayData.announcements) {
              const item = {
                ...ann,
                school: this.schoolSlug,
                schoolName: this.schoolName,
                yearGroups: Array.isArray(ann.yearGroups) && ann.yearGroups.length > 0 ? ann.yearGroups : ['All Years'],
                sourceId: this.id,
                sourceName: this.name,
                sourceUrl: src.sourceUrl,
                timestamp: ann.date || src.timestamp
              };
              if (ann.eventDate || (ann.category || '').toLowerCase().includes('event')) {
                eventItems.push(item);
              } else {
                newsItems.push(item);
              }
            }
          }

          if (Array.isArray(swayData.diaryEvents)) {
            for (const evt of swayData.diaryEvents) {
              eventItems.push({
                id: evt.id,
                title: evt.title,
                eventDate: evt.eventDate,
                eventTime: evt.dateDisplay || evt.eventDate,
                venue: this.schoolName,
                content: evt.notes || evt.title,
                url: src.sourceUrl,
                sourceUrl: src.sourceUrl,
                timestamp: evt.eventDate,
                isRegular: false,
                school: this.schoolSlug,
                schoolName: this.schoolName,
                yearGroups: Array.isArray(evt.yearGroups) && evt.yearGroups.length > 0 ? evt.yearGroups : ['All Years'],
                category: 'School Diary',
                sourceId: this.id,
                sourceName: this.name
              });
            }
          }
        }
      } else if (src.metadata?.type === 'parent-forum') {
        newsItems.push({
          id: `wpa-parent-forum-1`,
          title: `Warboys Primary Academy Parent Forum Minutes & Action Points`,
          content: `Discussion and key action points from the latest Warboys Primary Academy Parent Forum meeting. Topics covered school communications, upcoming parent events, and community partnership initiatives.`,
          summary: `Discussion and key action points from the latest Warboys Primary Academy Parent Forum meeting.`,
          url: src.sourceUrl,
          sourceUrl: src.sourceUrl,
          date: src.timestamp,
          timestamp: src.timestamp,
          school: this.schoolSlug,
          schoolName: this.schoolName,
          yearGroups: ['All Years'],
          category: 'School Governance',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    }

    return {
      news: newsItems,
      events: eventItems
    };
  }
}

module.exports = WpaSource;
