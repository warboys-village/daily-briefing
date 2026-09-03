const BaseSource = require('./base-source');

class HdcPlanningSource extends BaseSource {
  static get requiredInputs() {
    return ['placeName', 'districtCouncil'];
  }

  constructor(config, context) {
    super(config, context);
    this.parishFilter = config.parishFilter || this.placeName;
  }

  /**
   * Routine 1: Query PlanIt API to discover planning application records.
   */
  async establishSources(options = {}) {
    const { maxDays = 60 } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);

    const sources = [];
    const planitUrl = `https://www.planit.org.uk/api/applics/json?auth=Huntingdonshire&kwords=${encodeURIComponent(this.parishFilter)}&pg_sz=30`;

    try {
      const res = await fetch(planitUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        const records = data.records || data.applications || (Array.isArray(data) ? data : []);

        for (const rec of records) {
          const rawDate = rec.start_date || rec.consulted_date || rec.decision_date || rec.date;
          const itemDate = rawDate ? new Date(rawDate) : new Date();
          if (itemDate < cutoffDate) continue;

          const ref = rec.uid || rec.app_ref || rec.reference || 'Ref Pending';
          const link = rec.url || rec.link || `https://www.huntingdonshire.gov.uk/planning/search/?ref=${encodeURIComponent(ref)}`;

          sources.push({
            sourceId: `hdc-plan-${ref.replace(/[^a-zA-Z0-9]/g, '-')}`,
            sourceUrl: link,
            url: link,
            timestamp: itemDate.toISOString(),
            metadata: rec
          });
        }
      }
    } catch (err) {
      console.warn(`[HdcPlanningSource] Web query warning:`, err.message);
    }

    return sources;
  }

  /**
   * Routine 2: Analyse planning application records and format schema-compliant items.
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const planningItems = [];

    for (const src of sourcesToAnalyse) {
      const rec = src.metadata || {};
      const address = (rec.address || rec.location || '').trim();
      const description = (rec.description || rec.proposal || rec.app_type || 'Planning Application').trim();
      const ref = rec.uid || rec.app_ref || rec.reference || 'Ref Pending';
      const appState = (rec.app_state || rec.status || 'Undecided').trim();
      const decision = (rec.decision || rec.decision_type || '').trim();

      const fullText = `${ref} ${address} ${description}`;
      if (this.parishFilter && !fullText.toLowerCase().includes(this.parishFilter.toLowerCase())) {
        continue;
      }

      let statusCategory = 'UPDATED';
      let decisionOutcome = null;
      let badgeClass = 'badge-progress';
      let statusLabel = appState || 'In Progress';

      if (decision || appState.toLowerCase().includes('decid') || appState.toLowerCase().includes('grant') || appState.toLowerCase().includes('refus') || appState.toLowerCase().includes('permit')) {
        statusCategory = 'DECIDED';
        decisionOutcome = decision || appState;
        if (decisionOutcome.toLowerCase().includes('refus')) {
          badgeClass = 'badge-refused';
          statusLabel = 'Refused';
        } else if (decisionOutcome.toLowerCase().includes('withdrawn')) {
          badgeClass = 'badge-other';
          statusLabel = 'Withdrawn';
        } else {
          badgeClass = 'badge-approved';
          statusLabel = 'Permitted / Approved';
        }
      } else if (rec.start_date) {
        const startDate = new Date(rec.start_date);
        const daysOld = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld <= 21) {
          statusCategory = 'NEW';
          badgeClass = 'badge-new';
          statusLabel = 'New Application';
        }
      }

      const cleanTitle = address ? `${address} – ${description}` : `${ref}: ${description}`;

      planningItems.push({
        id: `hdc-planning-${ref.replace(/[^a-zA-Z0-9]/g, '-')}`,
        title: cleanTitle.slice(0, 140),
        reference: ref,
        address: address || `${this.placeName}, Cambridgeshire`,
        proposal: description,
        content: `Planning Application ${ref}: ${description}. Location: ${address}. Current Status: ${statusLabel}.`,
        summary: description,
        url: src.url,
        sourceUrl: src.url,
        date: src.timestamp,
        timestamp: src.timestamp,
        status: statusLabel,
        statusCategory,
        badgeClass,
        decision: decisionOutcome,
        category: 'Planning Applications',
        sourceId: this.id,
        sourceName: this.name
      });
    }

    return {
      planning: planningItems
    };
  }
}

module.exports = HdcPlanningSource;
