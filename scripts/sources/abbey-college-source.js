const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

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

    return sources.slice(0, 4);
  }

  /**
   * Routine 2: Disaggregates updates into school news and calendar items through real document fetching.
   */
  async processSingleItem(src, options = {}) {
    const news = [];
    const events = [];
    const meta = src.metadata || {};
    let title = meta.title || 'Abbey College Update';
    let bodyText = '';

    if (src.sourceUrl.endsWith('.pdf')) {
      const pdfData = await parsePdfFromUrl(src.sourceUrl, options);
      if (pdfData && pdfData.text) {
        bodyText = (pdfData.paragraphs || []).join(' ');
      }
    } else {
      try {
        const res = await fetch(src.sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const heading = $('h1').text().trim();
          if (heading) title = heading;
          bodyText = $('article, main, .entry-content').text().replace(/\s+/g, ' ').trim();
        }
      } catch (e) {}
    }

    const cleanContent = bodyText || `${title} published by ${this.schoolName}.`;
    const lower = `${title} ${cleanContent}`.toLowerCase();
    const isWholeVillage = lower.includes('open evening') || lower.includes('fete') || lower.includes('community') || lower.includes('bus route') || lower.includes('transport');
    const isEvent = lower.includes('induction') || lower.includes('open evening') || lower.includes('term begins') || lower.includes('parents meeting');

    if (isEvent) {
      events.push({
        id: src.sourceId,
        title,
        eventDate: (src.timestamp || '').split('T')[0],
        eventTime: 'Upcoming Session',
        venue: this.schoolName,
        content: cleanContent.slice(0, 600),
        url: src.sourceUrl,
        sourceUrl: src.sourceUrl,
        timestamp: src.timestamp,
        isRegular: false,
        isWholeVillage,
        school: this.schoolSlug,
        schoolName: this.schoolName,
        yearGroups: ['All Years'],
        category: 'School Diary',
        sourceId: this.id,
        sourceName: this.name
      });
    } else {
      news.push({
        id: src.sourceId,
        title: title.toLowerCase().includes('abbey college') ? title : `Abbey College: ${title}`,
        content: cleanContent.slice(0, 800),
        summary: cleanContent.slice(0, 250),
        url: src.sourceUrl,
        sourceUrl: src.sourceUrl,
        date: (src.timestamp || '').split('T')[0],
        timestamp: src.timestamp,
        isWholeVillage,
        school: this.schoolSlug,
        schoolName: this.schoolName,
        yearGroups: ['All Years'],
        category: 'School News',
        sourceId: this.id,
        sourceName: this.name
      });
    }

    return {
      news,
      events,
      governance: [],
      planning: []
    };
  }
}

module.exports = AbbeyCollegeSource;
