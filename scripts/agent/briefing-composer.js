const {
  loadAllStores,
  loadNewsStore,
  loadPlanningStore,
  loadGovernanceStore,
  loadCalendar
} = require('../utils/content-stores');
const { renderFullBriefingHtml } = require('./template-renderer');
const LlmClient = require('./llm-client');

class BriefingComposer {
  constructor(config = {}) {
    this.villageConfig = config;
    this.villageName = config.villageName || 'Warboys';
    this.county = config.county || 'Cambridgeshire';
    this.llmConfig = config.llmConfig || {};
    this.client = new LlmClient(this.llmConfig);
  }

  isWholeVillageSchoolItem(item) {
    const srcId = (item.sourceId || '').toLowerCase();
    const srcName = (item.sourceName || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    const content = (item.content || '').toLowerCase();
    const combinedText = `${title} ${content}`;

    const isSchool = srcId.includes('school') || 
                     srcId.includes('college') || 
                     srcId.includes('academy') ||
                     srcId.includes('wpa') ||
                     cat.includes('school') ||
                     srcName.includes('school') || 
                     srcName.includes('college') || 
                     srcName.includes('academy');
    
    if (!isSchool) return true;
    if (item.isWholeVillage) return true;

    const internalPhrases = [
      'whole school', 'family update', 'headteacher', 'bulletin', 'sixth form',
      'term date', 'newsletter', 'weekly update', 'student', 'pupil', 'assembly',
      'parent forum', 'governor', 'open evening', 'curriculum', 'donated', 'programme'
    ];
    if (internalPhrases.some(p => combinedText.includes(p))) {
      return false;
    }

    const externalKeywords = [
      'whole village', 'village-wide', 'community', 'public', 'open to all',
      'fete', 'fayre', 'fair', 'car boot sale', 'road safety', 'traffic', 'parking',
      'crossing patrol', 'floodlit', 'village hall', 'fundraiser for village'
    ];
    return externalKeywords.some(kw => combinedText.includes(kw));
  }

  /**
   * Compose structured briefing data directly from cached persistent domain stores.
   */
  composeContent(options = {}) {
    const {
      maxNewsItems = 12,
      maxEventsDays = 30,
      maxPlanningPerCategory = 10,
      nowDate = new Date()
    } = options;

    const allStores = loadAllStores({ nowDate });

    // 1. WHAT'S ON (Upcoming events within maxEventsDays; exclude any events in the past)
    const todayStart = new Date(nowDate);
    todayStart.setHours(0, 0, 0, 0);

    const eventCutoff = new Date(nowDate);
    eventCutoff.setDate(eventCutoff.getDate() + maxEventsDays);

    const events = (allStores.events || []).filter(evt => {
      const d = new Date(evt.eventDate || evt.date);
      if (isNaN(d.getTime())) return false;
      return d >= todayStart && d <= eventCutoff;
    }).sort((a, b) => new Date(a.eventDate || a.date || 0) - new Date(b.eventDate || b.date || 0));

    // 2. LOCAL VILLAGE NEWS (Fresh news items up to maxNewsItems)
    const news = (allStores.news || [])
      .filter(item => this.isWholeVillageSchoolItem(item))
      .slice(0, maxNewsItems);

    // 3. GOVERNANCE & COUNCIL (Latest meetings & county decisions)
    const governance = allStores.governance || [];

    // 4. PLANNING & DEVELOPMENT (Categorized and capped per status)
    const allPlanning = allStores.planning || [];
    const newPlans = allPlanning.filter(p => p.statusCategory === 'NEW').slice(0, maxPlanningPerCategory);
    const updatedPlans = allPlanning.filter(p => p.statusCategory === 'UPDATED').slice(0, maxPlanningPerCategory);
    const decidedPlans = allPlanning.filter(p => p.statusCategory === 'DECIDED').slice(0, maxPlanningPerCategory);

    const planning = [...newPlans, ...updatedPlans, ...decidedPlans];

    return {
      events,
      news,
      governance,
      planning
    };
  }

  /**
   * Optionally generate a short editorial overview using LLM if available.
   */
  async generateEditorOverview(briefingData, isoDate) {
    if (!process.env.LLM_API_KEY) {
      return '';
    }

    const headlines = [];
    if (briefingData.news && briefingData.news[0]) headlines.push(`News: ${briefingData.news[0].title}`);
    if (briefingData.events && briefingData.events[0]) headlines.push(`Next Event: ${briefingData.events[0].title}`);
    if (briefingData.governance && briefingData.governance[0]) headlines.push(`Council: ${briefingData.governance[0].title}`);
    if (briefingData.planning && briefingData.planning[0]) headlines.push(`Planning: ${briefingData.planning[0].title}`);

    if (headlines.length === 0) return '';

    try {
      const messages = [
        {
          role: 'system',
          content: `You are the local daily news editor for ${this.villageName}, ${this.county}, UK.
In 2 concise, engaging British English sentences, write a morning daily briefing welcome overview for village residents summarizing today's key highlights. Do not include markdown headers or bullet points.`
        },
        {
          role: 'user',
          content: `Today is ${isoDate}. Key items:\n${headlines.join('\n')}`
        }
      ];

      const response = await this.client.runAgentStep(messages, []);
      if (response && response.content && !response.mockBriefing) {
        return `<div class="editor-overview-banner" style="background: var(--color-surface); border-left: 4px solid var(--color-primary); padding: 1rem 1.25rem; margin-bottom: 1.5rem; border-radius: 4px; font-size: 1.05rem; line-height: 1.6; color: var(--color-text-main);">
  <p style="margin: 0;">${response.content.trim()}</p>
</div>\n\n`;
      }
    } catch (err) {
      console.warn('[BriefingComposer] Note: Optional LLM editor overview skipped:', err.message);
    }

    return '';
  }

  /**
   * Generate the full briefing HTML markdown for a given date.
   */
  async generateBriefing(options = {}) {
    const { isoDate = new Date().toISOString().split('T')[0] } = options;
    const content = this.composeContent(options);

    const hasAnyContent = (content.events && content.events.length > 0) ||
                          (content.news && content.news.length > 0) ||
                          (content.governance && content.governance.length > 0) ||
                          (content.planning && content.planning.length > 0);

    if (!hasAnyContent) {
      return {
        content,
        html: this.generateZeroItemsBriefing(isoDate)
      };
    }

    const editorOverviewHtml = await this.generateEditorOverview(content, isoDate);
    const bodyHtml = renderFullBriefingHtml(content, this.villageName, this.county, this.villageConfig);

    return {
      content,
      html: `${editorOverviewHtml}${bodyHtml}`
    };
  }

  generateZeroItemsBriefing(isoDate) {
    return `<div class="briefing-block">
  <div class="briefing-block-header">
    <h3 class="briefing-block-title">Daily Overview</h3>
  </div>
  <div class="briefing-block-content">
    <p>No new local news, events, or planning updates were published for ${this.villageName} today.</p>
    <p style="margin-top: 1rem;"><strong>Local Information:</strong></p>
    <ul>
      <li><strong>District Council:</strong> ${this.villageConfig.districtCouncil || 'Huntingdonshire District Council'}</li>
      <li><strong>Parish Council:</strong> ${this.villageConfig.parishCouncil || (this.villageName + ' Parish Council')}</li>
      <li><strong>County:</strong> ${this.county}</li>
    </ul>
    <p style="margin-top: 1rem; color: var(--color-text-muted);"><em>Check back tomorrow for fresh updates or explore past entries in the <a href="/archive/">Archive</a>.</em></p>
  </div>
</div>`;
  }
}

module.exports = BriefingComposer;
