const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class ParishCouncilSource extends BaseSource {
  constructor(config) {
    super(config);
    this.url = config.url || 'https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list';
  }

  // Helper: Parse non-ISO dd mm yy dates with various separators (. / - space)
  parseDdMmYyDate(textStr) {
    if (!textStr) return null;
    const match = textStr.match(/\b(\d{1,2})[\.\/\-\s](\d{1,2})[\.\/\-\s](\d{2,4})\b/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;

      const d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  async extract(options = {}) {
    const items = [];

    try {
      const res = await fetch(this.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        // Parse meeting entries from meeting-calendar list view
        $('a').each((i, el) => {
          const text = $(el).text().trim();
          const href = $(el).attr('href');
          if (href && (text.toLowerCase().includes('agenda') || text.toLowerCase().includes('minutes') || text.toLowerCase().includes('mn') || href.endsWith('.pdf') || href.endsWith('.docx'))) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            const dateObj = this.parseDdMmYyDate(text) || this.parseDdMmYyDate(href) || new Date();
            const formattedDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            items.push({
              id: `parish-doc-${i}-${Date.now()}`,
              title: `Warboys Parish Council: ${text}`,
              content: `Warboys Parish Council meeting document (${formattedDate}): "${text}". Associated document available at source link.`,
              url: fullUrl,
              date: dateObj.toISOString(),
              category: 'Village News & Governance',
              sourceId: this.id,
              sourceName: this.name
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[ParishCouncilSource] Web query skipped:`, err.message);
    }

    // Fallback using real live URLs from https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list
    if (items.length === 0 && options.includeMockFallback) {
      const now = new Date();
      const fullCouncilAgendaUrl = `https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/05-agenda-10.08.26-LW.pdf`;
      const minutesDocxUrl = `https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/04-mn-13.07.26.docx`;
      const planningAgendaUrl = `https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/05-agenda-pl-10.08.26-.docx`;

      items.push(
        // Topic Item 1: Full Council Agenda -> Direct link to 10.08.26 Agenda PDF
        {
          id: `parish-topic-01`,
          title: `Full Council Meeting Agenda (10/08/2026) - Adams Park Funding & Committee Reports`,
          content: `Warboys Parish Council Full Council agenda for meeting on 10 August 2026 at Warboys Community Centre Small Hall. Includes grant funding discussions and committee reports.`,
          url: fullCouncilAgendaUrl,
          date: `2026-08-10T12:00:00.000Z`,
          category: 'Village News & Governance',
          sourceId: this.id,
          sourceName: this.name
        },
        // Topic Item 2: Full Council Meeting Minutes -> Direct link to 13.07.26 Minutes DOCX (Associated Document)
        {
          id: `parish-topic-02`,
          title: `Full Council Meeting Minutes (13/07/2026) - Associated Document`,
          content: `Approved meeting minutes from the Full Council meeting held on 13 July 2026. Document published under Associated Documents section.`,
          url: minutesDocxUrl,
          date: `2026-07-13T12:00:00.000Z`,
          category: 'Village News & Governance',
          sourceId: this.id,
          sourceName: this.name
        },
        // Topic Item 3: Planning Committee Agenda -> Direct link to 10.08.26 Planning Agenda DOCX
        {
          id: `parish-topic-03`,
          title: `Planning Committee Meeting Agenda (10/08/2026)`,
          content: `Planning Committee agenda for meeting on Monday 10 August 2026 at 8pm in Warboys Community Centre Small Hall.`,
          url: planningAgendaUrl,
          date: `2026-08-10T12:00:00.000Z`,
          category: 'Village News & Governance',
          sourceId: this.id,
          sourceName: this.name
        }
      );
    }

    return items;
  }
}

module.exports = ParishCouncilSource;
