const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class ParishCouncilSource extends BaseSource {
  constructor(config) {
    super(config);
    this.url = config.url || 'https://warboysparishcouncil.co.uk';
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
        $('a').each((i, el) => {
          const text = $(el).text().trim();
          const href = $(el).attr('href');
          if (href && (text.toLowerCase().includes('minutes') || text.toLowerCase().includes('agenda') || text.toLowerCase().includes('notice'))) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            items.push({
              id: `parish-doc-${i}-${Date.now()}`,
              title: `Warboys Parish Council: ${text}`,
              content: `Warboys Parish Council meeting document: "${text}". Full agenda/minutes accessible at original source.`,
              url: fullUrl,
              date: new Date().toISOString(),
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

    // Mock fallback splitting meeting minutes into MULTIPLE distinct topic items + extracting upcoming events
    if (items.length === 0 && options.includeMockFallback) {
      const now = new Date();
      const minutesUrl = `https://warboysparishcouncil.co.uk/agendas-and-minutes/`;

      items.push(
        // Topic Item 1: Governance/News
        {
          id: `parish-topic-01`,
          title: `Parish Council Update: Adams Park Play Equipment Repairs & Grant Funding Approved`,
          content: `Warboys Parish Council approved £4,500 grant funding for replacement swings and safety surface repairs at Adams Park play area following ROSPA inspection report.`,
          url: minutesUrl,
          date: now.toISOString(),
          category: 'Village News & Governance',
          sourceId: this.id,
          sourceName: this.name
        },
        // Topic Item 2: Governance/News
        {
          id: `parish-topic-02`,
          title: `Traffic Management Committee: 20mph Speed Zone Reduction Proposal for High Street`,
          content: `The Traffic Advisory Committee recommended a formal submission to Cambridgeshire County Council Highways for a 20mph speed reduction zone on High Street and Ramsey Road.`,
          url: minutesUrl,
          date: now.toISOString(),
          category: 'Village News & Governance',
          sourceId: this.id,
          sourceName: this.name
        },
        // Topic Item 3: Event mentioned in meeting minutes -> Routed to Community Events!
        {
          id: `parish-event-mention-01`,
          title: `Annual Warboys Parish Assembly & Community Forum (Mentioned in Council Minutes)`,
          eventTime: `Wednesday 26 August • 7:00 PM`,
          eventCategory: `UPCOMING`,
          isRegular: false,
          venue: `Warboys Parish Centre`,
          content: `Official notice from Parish Council Minutes: All Warboys residents invited to the Annual Parish Assembly. Presentation of annual report and public question time.`,
          url: minutesUrl,
          date: new Date(now.getTime() + 86400000 * 11).toISOString(),
          category: 'Community Events',
          sourceId: this.id,
          sourceName: this.name
        }
      );
    }

    return items;
  }
}

module.exports = ParishCouncilSource;
