const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

class EventsSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://www.warboysparishcouncil.gov.uk/our-community/warboys-diary/';
  }

  /**
   * Routine 1: Discover latest village diary PDF issue URL from the website.
   */
  async establishSources(options = {}) {
    const sources = [];
    let latestDiaryPdfUrl = null;

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.endsWith('.pdf') && href.toLowerCase().includes('warboys-diary')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            if (!latestDiaryPdfUrl) {
              latestDiaryPdfUrl = fullUrl;
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[EventsSource] Web query skipped:`, err.message);
    }

    if (!latestDiaryPdfUrl) {
      latestDiaryPdfUrl = 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf';
    }

    // Extract year/month hint from filename or default to publication date
    let pubTimestamp = new Date().toISOString();
    const match = latestDiaryPdfUrl.match(/(20\d{2})/);
    if (match) {
      pubTimestamp = `${match[1]}-04-01T12:00:00.000Z`;
    }

    sources.push({
      sourceId: latestDiaryPdfUrl,
      sourceUrl: latestDiaryPdfUrl,
      url: latestDiaryPdfUrl,
      timestamp: pubTimestamp,
      metadata: {
        title: 'Warboys Community Diary Publication'
      }
    });

    return sources;
  }

  /**
   * Routine 2: Extract scheduled events from the community diary publication PDF.
   */
  async processSingleItem(src, options = {}) {
    const eventItems = [];
    const targetPdfUrl = src.sourceUrl;

    const pdfData = await parsePdfFromUrl(targetPdfUrl, options);
    if (!pdfData || !pdfData.text) {
      return { events: [], news: [], governance: [], planning: [] };
    }

    // If LLM is available, use structured extraction
    if (this.llm && typeof this.llm.extractStructuredItems === 'function') {
      const llmResult = await this.llm.extractStructuredItems(pdfData.text, {
        title: src.metadata?.title || 'Warboys Community Diary',
        url: targetPdfUrl,
        placeName: this.placeName,
        county: this.county
      });
      if (llmResult && llmResult.events && llmResult.events.length > 0) {
        return llmResult;
      }
    }

    // Deterministic parser for the Diary What's On / Calendar section
    const monthMap = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };

    const lines = pdfData.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const dateRegex = /^(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b\s*(.*)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(dateRegex);
      if (match) {
        const day = String(match[1]).padStart(2, '0');
        const monthName = match[2].toLowerCase();
        const monthNum = monthMap[monthName];
        let restOfLine = match[3] || '';

        // Check if next line has venue or time information
        let extraLine = '';
        if (i + 1 < lines.length && !dateRegex.test(lines[i + 1]) && lines[i + 1].length < 80) {
          extraLine = lines[i + 1];
        }

        const combinedText = `${restOfLine} ${extraLine}`.trim();
        if (combinedText.length < 3) continue;

        // Determine year (diary is typically for 2026/2027)
        const year = '2026';
        const isoDate = `${year}-${monthNum}-${day}`;

        let venue = 'Warboys Community Centre';
        if (/weir\b/i.test(combinedText)) venue = 'Warboys Weir';
        else if (/sports field\b/i.test(combinedText)) venue = 'Warboys Sports Field';
        else if (/church\b/i.test(combinedText)) venue = 'Methodist Church, Warboys';
        else if (/library\b/i.test(combinedText)) venue = 'Warboys Community Library';

        let timeStr = `${day} ${match[2]} ${year}`;
        const timeMatch = combinedText.match(/(\d{1,2}(?:\.\d{2})?\s*(?:am|pm|start)|all day|\d{1,2}\s*-\s*\d{1,2}\s*(?:am|pm))/i);
        if (timeMatch) {
          timeStr = `${day} ${match[2]} ${year} • ${timeMatch[0]}`;
        }

        // Clean title
        let cleanTitle = restOfLine
          .replace(/^[^a-zA-Z0-9]+/, '')
          .replace(/(\d{1,2}(?:\.\d{2})?\s*(?:am|pm|start)|all day|\d{1,2}\s*-\s*\d{1,2}\s*(?:am|pm)).*/i, '')
          .replace(/\(see poster insert\)/i, '')
          .trim();

        if (cleanTitle.toLowerCase().includes('young at heart') || cleanTitle.toLowerCase().includes('christmas quiz')) {
          cleanTitle = 'Warboys Young at Heart Club Christmas Quiz (WDDC)';
        } else if (cleanTitle.toLowerCase().includes('christmas lighting') || cleanTitle.toLowerCase().includes('switch on')) {
          cleanTitle = 'Warboys Christmas Lighting Switch On';
        }

        if (!cleanTitle || cleanTitle.length < 4 || /^(this will|please|remember|note)/i.test(cleanTitle)) continue;

        const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        eventItems.push({
          id: `event-${slug}-${isoDate}`,
          title: cleanTitle,
          eventTime: timeStr,
          eventCategory: 'UPCOMING',
          isRegular: false,
          venue,
          content: `From Warboys Community Diary: ${cleanTitle}. ${combinedText}`,
          url: targetPdfUrl,
          sourceUrl: targetPdfUrl,
          date: `${isoDate}T12:00:00.000Z`,
          timestamp: `${isoDate}T12:00:00.000Z`,
          eventDate: isoDate,
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        });
      }
    }

    return {
      events: eventItems,
      news: [],
      governance: [],
      planning: []
    };
  }
}

module.exports = EventsSource;
