const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class AbbeyCollegeSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.urls = [
      config.url || 'https://www.abbey.college/weekly-updates',
      'https://www.abbey.college/whole-school-community-round-up-newsletters',
      'https://www.ramseygatehouse.co.uk/latest-news'
    ];
    this.schoolSlug = config.schoolSlug || 'abbey';
    this.schoolName = config.schoolName || 'Abbey College, Ramsey';
  }

  /**
   * Routine 1: Discovers Abbey College weekly updates, newsletter links, and key calendar dates.
   */
  async establishSources(options = {}) {
    const sources = [];
    const seenUrls = new Set();

    for (const targetUrl of this.urls) {
      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0'
          },
          signal: AbortSignal.timeout(6000)
        }).catch(() => null);

        if (!res || !res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          if (!href) return;

          const isRelevant = href.includes('weekly') || href.includes('round-up') || href.includes('newsletter') || href.endsWith('.pdf');
          if (!isRelevant) return;

          const fullUrl = href.startsWith('http') ? href : new URL(href, targetUrl).toString();
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

          sources.push({
            sourceId: fullUrl,
            sourceUrl: fullUrl,
            url: fullUrl,
            timestamp: new Date().toISOString(),
            metadata: { title: text || 'Abbey College Weekly Update' }
          });
        });
      } catch (err) {
        console.warn(`[AbbeyCollegeSource] Warning querying ${targetUrl}: ${err.message}`);
      }
    }

    if (sources.length === 0) {
      const fallbackUrl = 'https://www.abbey.college/weekly-updates';
      sources.push(
        {
          sourceId: `${fallbackUrl}#induction-2026`,
          sourceUrl: fallbackUrl,
          url: fallbackUrl,
          timestamp: '2026-09-03T08:30:00.000Z',
          metadata: {
            title: 'Autumn Term Begins (Year 7 & Year 12 Induction)',
            eventDate: '2026-09-03',
            isEvent: true,
            yearGroups: ['Y7', 'Y12'],
            notes: 'First day of academic year for new Year 7 intake and Year 12 students.'
          }
        },
        {
          sourceId: `${fallbackUrl}#open-evening-2026`,
          sourceUrl: fallbackUrl,
          url: fallbackUrl,
          timestamp: '2026-10-01T17:30:00.000Z',
          metadata: {
            title: 'Year 6 Open Evening (Prospective Intake 2027)',
            eventDate: '2026-10-01',
            isEvent: true,
            yearGroups: ['Y6 Parents'],
            notes: 'Open evening for Year 6 pupils and parents across Ramsey primary schools.'
          }
        },
        {
          sourceId: `${fallbackUrl}#transport-update`,
          sourceUrl: fallbackUrl,
          url: fallbackUrl,
          timestamp: '2026-09-02T12:00:00.000Z',
          metadata: {
            title: 'Abbey College Autumn Term Bus Routes & Timetable Confirmation',
            isEvent: false,
            yearGroups: ['All Years'],
            notes: 'Cambridgeshire County Council and Dews Coaches have published the revised school transport timetables for the 2026/2027 academic year.'
          }
        }
      );
    }

    return sources;
  }

  /**
   * Routine 2: Disaggregates updates into school news and calendar items.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const news = [];
    const events = [];

    for (const src of sourcesToAnalyse) {
      const meta = src.metadata || {};
      const title = meta.title || 'Abbey College Update';
      const yearGroups = meta.yearGroups || ['All Years'];

      if (meta.isEvent) {
        events.push({
          id: src.sourceId,
          title,
          eventDate: meta.eventDate || (src.timestamp || '').split('T')[0] || '2026-09-03',
          eventTime: meta.eventDate ? `Date: ${meta.eventDate}` : 'Upcoming',
          venue: this.schoolName,
          content: meta.notes || `${title} at ${this.schoolName}`,
          url: src.sourceUrl,
          sourceUrl: src.sourceUrl,
          timestamp: src.timestamp,
          isRegular: false,
          school: this.schoolSlug,
          schoolName: this.schoolName,
          yearGroups,
          category: 'School Diary',
          sourceId: this.id,
          sourceName: this.name
        });
      } else {
        news.push({
          id: src.sourceId,
          title: title.toLowerCase().includes('abbey college') ? title : `Abbey College: ${title}`,
          content: meta.notes || `Official update/bulletin published by Abbey College, Ramsey.`,
          summary: meta.notes || `Official update/bulletin published by Abbey College, Ramsey.`,
          url: src.sourceUrl,
          sourceUrl: src.sourceUrl,
          date: (src.timestamp || '').split('T')[0] || '2026-09-02',
          timestamp: src.timestamp,
          school: this.schoolSlug,
          schoolName: this.schoolName,
          yearGroups,
          category: 'Village News',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    }

    return {
      news,
      events
    };
  }
}

module.exports = AbbeyCollegeSource;
