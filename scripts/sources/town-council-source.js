const BaseSource = require('./base-source');
const cheerio = require('cheerio');
const { parsePdfFromUrl } = require('../utils/pdf-parser');

function parseBritishDate(rawStr) {
  if (!rawStr) return null;
  const monthMap = {
    jan: '01', january: '01', feb: '02', february: '02',
    mar: '03', march: '03', apr: '04', april: '04',
    may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11',
    dec: '12', december: '12'
  };

  const m = rawStr.match(/(\d{1,2})[\s_-]+([a-z]{3,9})[\s_-]+(\d{2,4})/i);
  if (m) {
    const day = String(m[1]).padStart(2, '0');
    const monthStr = m[2].toLowerCase();
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    const month = monthMap[monthStr];
    if (month) {
      return `${year}-${month}-${day}T12:00:00.000Z`;
    }
  }
  return null;
}

function extractMeetingDate(href, title, desc, publishedDateStr) {
  const text = `${href} ${title} ${desc}`.toLowerCase();

  // 1. Match YYYYMMDD in filename/title/desc
  const mYmd = text.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (mYmd) {
    return `${mYmd[1]}-${mYmd[2]}-${mYmd[3]}T12:00:00.000Z`;
  }

  // 2. Match British date patterns in filename/title/desc
  const parsedFromText = parseBritishDate(text);
  if (parsedFromText) {
    return parsedFromText;
  }

  // 3. Fallback to website publication date
  if (publishedDateStr) {
    const parsedPubDate = parseBritishDate(publishedDateStr);
    if (parsedPubDate) return parsedPubDate;
  }

  return null;
}

class TownCouncilSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'placeName'];
  }

  constructor(config = {}, context = {}) {
    super(config, context);
    this.url = config.url || 'https://www.ramseytowncouncil.gov.uk/documents';
  }

  /**
   * Routine 1: Discovers Ramsey Town Council documents and meeting minutes from the documents directory.
   */
  async establishSources(options = {}) {
    const sources = [];
    const seenUrls = new Set();

    try {
      const res = await fetch(this.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml'
        },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a.download-icon, a[href*="/uploads/"]').each((i, el) => {
          const href = $(el).attr('href');
          if (!href || (!href.includes('/uploads/') && !href.endsWith('.pdf') && !href.endsWith('.docx'))) return;

          const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
          if (seenUrls.has(fullUrl)) return;

          const card = $(el).parents().filter((idx, parentEl) => $(parentEl).find('.heading, .published').length > 0).first();
          const rawTitle = card.find('.heading, h2, h3').text().trim();
          const rawDate = card.find('.published').text().trim();
          const desc = card.find('p').not('.published').text().trim();

          const textCombined = `${rawTitle} ${desc} ${href}`.toLowerCase();
          const isPolicyOrAudit = textCombined.includes('policy') || textCombined.includes('standing-order') || textCombined.includes('annual-return') || textCombined.includes('account') || textCombined.includes('audit');
          if (isPolicyOrAudit) return;

          seenUrls.add(fullUrl);
          const parsedDate = extractMeetingDate(href, rawTitle, desc, rawDate) || new Date().toISOString();

          sources.push({
            sourceId: fullUrl,
            sourceUrl: fullUrl,
            url: fullUrl,
            timestamp: parsedDate,
            metadata: {
              rawTitle: rawTitle || desc || 'Ramsey Town Council Meeting Document',
              desc,
              parsedDate,
              textCombined
            }
          });
        });
      }
    } catch (err) {
      console.warn(`[TownCouncilSource] Error querying ${this.name}: ${err.message}`);
    }

    return sources;
  }

  /**
   * Routine 2: Disaggregates a document into topic-specific governance news items using real PDF text.
   */
  async processSingleItem(src, options = {}) {
    const governance = [];
    const meta = src.metadata || {};
    const docTitle = meta.rawTitle || 'Ramsey Town Council Document';
    const meetingDate = (src.timestamp || '').split('T')[0] || new Date().toISOString().split('T')[0];

    // Download and parse PDF text if PDF
    if (src.sourceUrl && src.sourceUrl.endsWith('.pdf')) {
      const pdfData = await parsePdfFromUrl(src.sourceUrl, options);
      if (pdfData && pdfData.text) {
        if (this.llm && typeof this.llm.extractStructuredItems === 'function') {
          const llmResult = await this.llm.extractStructuredItems(pdfData.text, {
            title: docTitle,
            url: src.sourceUrl,
            placeName: this.placeName,
            county: this.county
          });
          if (llmResult && llmResult.governance && llmResult.governance.length > 0) {
            return llmResult;
          }
        }

        // Deterministic extraction from real paragraphs
        const lines = (pdfData.paragraphs || []).filter(p => p.length > 50);
        for (let i = 0; i < Math.min(lines.length, 3); i++) {
          const p = lines[i];
          const headline = p.slice(0, 100).replace(/\.\s.*$/, '').trim();
          governance.push({
            id: `rtc-doc-${i}-${meetingDate}`,
            title: `${docTitle}: ${headline}`,
            meetingTitle: docTitle,
            meetingDate: meetingDate,
            content: p,
            summary: p.slice(0, 240) + '...',
            url: src.sourceUrl,
            sourceUrl: src.sourceUrl,
            timestamp: src.timestamp,
            priority: 'STANDARD',
            category: 'Village News & Governance',
            sourceId: this.id,
            sourceName: this.name
          });
        }
      }
    }

    return {
      governance,
      events: [],
      news: [],
      planning: []
    };
  }
}

module.exports = TownCouncilSource;
