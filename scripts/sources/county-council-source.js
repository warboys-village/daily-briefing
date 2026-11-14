const BaseSource = require('./base-source');
const cheerio = require('cheerio');

class CountyCouncilSource extends BaseSource {
  static get requiredInputs() {
    return ['url', 'county', 'placeName'];
  }

  constructor(config, context) {
    super(config, context);
    this.url = config.url || 'https://cambridgeshire.cmis.uk.com/ccc_live/';
  }

  /**
   * Routine 1: Enumerate CMIS committees and discover meeting documents.
   */
  async establishSources(options = {}) {
    const targetCommittees = [
      { id: '62', name: 'Highways and Transport Committee' },
      { id: '20', name: 'County Council' },
      { id: '67', name: 'Environment and Green Investment Committee' },
      { id: '4', name: 'Children and Young People Committee' },
      { id: '71', name: 'Strategy, Resources and Performance Committee' }
    ];

    const sources = [];
    const dailyTimestamp = `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`;
    for (const committee of targetCommittees) {
      const committeeUrl = `https://cambridgeshire.cmis.uk.com/ccc_live/Committees/CouncilCommittees/tabid/140/ctl/ViewCMIS_CommitteeDetails/mid/529/id/${committee.id}/Default.aspx`;
      sources.push({
        sourceId: `cmis-comm-${committee.id}`,
        sourceUrl: committeeUrl,
        url: committeeUrl,
        timestamp: dailyTimestamp,
        metadata: {
          committeeId: committee.id,
          committeeName: committee.name
        }
      });
    }

    return sources;
  }

  /**
   * Routine 2: Fetch committee page and extract real decision reports relevant to the county and place.
   */
  async processSingleItem(src, options = {}) {
    const governanceItems = [];
    const place = this.placeName.toLowerCase();
    const county = this.county.toLowerCase();

    const committeeName = src.metadata?.committeeName || 'County Committee';
    const committeeId = src.metadata?.committeeId || '0';

    try {
      const res = await fetch(src.sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
        signal: AbortSignal.timeout(8000)
      });

      if (res && res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim();

          if (href.includes('ViewMeetingPublic') || href.includes('Document.ashx')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.url).toString();
            const lowerText = text.toLowerCase();
            const isRelevant = lowerText.match(/highways|transport|send|school|huntingdonshire|a141|b1040|b1043|environment|bus/) ||
                               lowerText.includes(place) || lowerText.includes(county);

            if (isRelevant && text.length > 5) {
              const rowText = $(el).closest('tr').text() || text;
              const dateMatch = rowText.match(/(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i);
              let itemIsoDate = src.timestamp || new Date().toISOString();
              if (dateMatch) {
                const parsed = new Date(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]} 12:00:00Z`);
                if (!isNaN(parsed.getTime())) itemIsoDate = parsed.toISOString();
              }

              const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
              governanceItems.push({
                id: `ccc-${committeeId}-${slug}-${i}`,
                title: `Cambridgeshire County Council (${committeeName}): ${text}`,
                content: `Official committee report and decision pack from Cambridgeshire County Council (${committeeName}) regarding ${text}.`,
                summary: `Official committee report and decision pack from Cambridgeshire County Council (${committeeName}) regarding ${text}.`,
                url: fullUrl,
                sourceUrl: src.sourceUrl,
                date: itemIsoDate,
                timestamp: itemIsoDate,
                meetingTitle: `Cambridgeshire County Council (${committeeName})`,
                meetingDate: itemIsoDate,
                category: 'Village News & Governance',
                priority: lowerText.includes(place) ? 'HIGH' : 'STANDARD',
                sourceId: this.id,
                sourceName: this.name || 'Cambridgeshire County Council'
              });
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[CountyCouncilSource] Error querying committee ${committeeId}:`, err.message);
    }

    return {
      governance: governanceItems,
      events: [],
      news: [],
      planning: []
    };
  }
}

module.exports = CountyCouncilSource;
