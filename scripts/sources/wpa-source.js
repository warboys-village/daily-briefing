const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parseSwayNewsletter, extractSwayId } = require('../utils/wpa-sway-parser');
const { saveSchoolCalendar } = require('../utils/school-calendar-store');
const { saveSchoolAnnouncements } = require('../utils/school-announcements-store');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

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
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(8000)
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

        const regex = /https:\/\/(?:sway\.cloud\.microsoft|sway\.office\.com)\/(?:s\/)?([a-zA-Z0-9_-]+)(?:\?[^"'\s<>]*)?/gi;
        const matches = [...html.matchAll(regex)].map(m => m[0]);
        for (const m of matches) {
          if (!swayUrls.includes(m)) {
            swayUrls.push(m);
          }
        }
      }

      if (swayUrls.length === 0) {
        const defaultUrl = this.config.newsletterUrl || 'https://sway.cloud.microsoft/dsx9RpWqJtAljtqt?ref=Link';
        swayUrls.push(defaultUrl);
      }

      swayUrls.slice(0, 3).forEach((swayUrl, idx) => {
        sources.push({
          sourceId: swayUrl,
          sourceUrl: swayUrl,
          url: swayUrl,
          timestamp: new Date().toISOString(),
          metadata: { type: 'sway', isLatest: idx === 0 }
        });
      });
    } catch (err) {
      console.warn(`[WpaSource] Error discovering WPA newsletters:`, err.message);
    }

    // Include Parent Forum minutes document
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
   * Routine 2: Process a single WPA source item (Sway newsletter or Parent Forum document).
   */
  async processSingleItem(src, options = {}) {
    const newsItems = [];
    const eventItems = [];

    if (src.metadata?.type === 'sway') {
      const swayData = await parseSwayNewsletter(src.sourceUrl, options);
      if (swayData) {
        if (Array.isArray(swayData.announcements)) {
          // Save latest newsletter announcements to dedicated store
          if (swayData.announcements.length > 0 && src.metadata?.isLatest !== false) {
            saveSchoolAnnouncements(this.schoolSlug, {
              activeNewsletterUrl: src.sourceUrl,
              newsletterTitle: swayData.title,
              newsletterDate: swayData.newsletterDate,
              announcements: swayData.announcements
            }, {
              dataDir: options.dataDir || this.context?.villageConfig?.dataDir
            });
          }

          for (const ann of swayData.announcements) {
            // Only whole-village items belong in village newsItems/eventItems
            // All school announcements are preserved in saveSchoolAnnouncements above
            if (ann.isWholeVillage || ann.wholePlaceRelevance) {
              const item = {
                ...ann,
                school: this.schoolSlug,
                schoolName: this.schoolName,
                yearGroups: Array.isArray(ann.yearGroups) && ann.yearGroups.length > 0 ? ann.yearGroups : ['All Years'],
                sourceId: this.id,
                sourceName: this.name,
                sourceUrl: src.sourceUrl,
                timestamp: ann.date || src.timestamp,
                isWholeVillage: true
              };
              if (ann.eventDate) {
                eventItems.push(item);
              } else {
                newsItems.push(item);
              }
            }
          }

          // Generate whole-village card for newsletter publication
          if (swayData.title) {
            const dateBadge = swayData.newsletterDate || '';
            newsItems.push({
              id: `wpa-newsletter-published-${extractSwayId(src.sourceUrl)}`,
              title: `Warboys Primary Academy: Weekly Newsletter Published${dateBadge ? ` (${dateBadge})` : ''}`,
              content: `Warboys Primary Academy has published its weekly newsletter for families and the community. Includes Headteacher updates, term diary dates, and community information.`,
              summary: `Warboys Primary Academy has published its weekly newsletter.`,
              url: src.sourceUrl,
              sourceUrl: src.sourceUrl,
              date: src.timestamp,
              timestamp: src.timestamp,
              school: this.schoolSlug,
              schoolName: this.schoolName,
              yearGroups: ['All Years'],
              isWholeVillage: true,
              category: 'Community News',
              sourceId: this.id,
              sourceName: this.name
            });
          }
        }

        if (Array.isArray(swayData.diaryEvents)) {
          const cancelKeywords = ['cancel', 'cancelled', 'canceled', 'cancellation', 'postpone', 'postponed', 'called off', 'will not take place', 'rescheduled'];
          const announcementsText = (swayData.announcements || [])
            .filter(a => {
              const text = `${a.title || ''} ${a.content || ''}`.toLowerCase();
              return cancelKeywords.some(kw => text.includes(kw));
            })
            .map(a => `${a.title || ''}: ${a.content || ''}`);

          const mergedEvents = saveSchoolCalendar(this.schoolSlug, swayData.diaryEvents, {
            cancellationNotices: announcementsText,
            nowDate: options.nowDate || new Date(),
            dataDir: options.dataDir || this.context?.villageConfig?.dataDir
          });

          for (const evt of mergedEvents) {
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
              targetYears: Array.isArray(evt.targetYears) && evt.targetYears.length > 0 ? evt.targetYears : (evt.yearGroups || ['All Years']),
              category: 'School Diary',
              sourceId: this.id,
              sourceName: this.name,
              cancelled: evt.cancelled || false
            });
          }
        }
      }
    } else if (src.metadata?.type === 'parent-forum') {
      let content = 'Discussion and key action points from the latest Warboys Primary Academy Parent Forum meeting.';
      let summary = content;

      // Extract real text from the Parent Forum PDF
      const pdfData = await parsePdfFromUrl(src.sourceUrl, options);
      if (pdfData && pdfData.text) {
        const actionPoints = (pdfData.paragraphs || []).filter(p => p.toLowerCase().includes('action point') || p.toLowerCase().includes('agreed'));
        if (actionPoints.length > 0) {
          content = actionPoints.join('\n\n');
          summary = actionPoints[0].slice(0, 240);
        } else if (pdfData.text.length > 100) {
          content = pdfData.text.slice(0, 1000);
          summary = pdfData.text.slice(0, 240);
        }
      }

      newsItems.push({
        id: `wpa-parent-forum-${src.timestamp.split('T')[0]}`,
        title: `Warboys Primary Academy Parent Forum Minutes & Action Points`,
        content,
        summary,
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

    return {
      news: newsItems,
      events: eventItems,
      governance: [],
      planning: []
    };
  }
}

module.exports = WpaSource;
