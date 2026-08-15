const LlmClient = require('./llm-client');
const { tools } = require('./tools');

class BriefingAgent {
  constructor(config = {}) {
    this.villageConfig = config;
    this.client = new LlmClient(config.llmConfig || {});
    this.maxTurns = (config.llmConfig && config.llmConfig.maxTurns) || 2;
  }

  /**
   * Run agentic briefing synthesis over pre-filtered source items.
   */
  async generateBriefing(items, isoDate) {
    const villageName = this.villageConfig.villageName || 'Warboys';
    const county = this.villageConfig.county || 'Cambridgeshire';

    if (!items || items.length === 0) {
      return this.generateZeroItemsBriefing(isoDate, villageName, county);
    }

    const systemPrompt = `You are the local daily news editor for ${villageName}, ${county}, UK.
Synthesize raw pre-filtered local news, council meeting minutes, events, and planning applications into an appealing Daily Briefing in Markdown/HTML.

UNIFIED CARD DESIGN RULES FOR ALL SECTIONS:
Every item across all sections MUST be formatted with:
1. TOP RIGHT OF CARD:
   - For Events: Event Date & Time badge in top-right (e.g., <span class="badge-status badge-upcoming">Thursday 20 August • 10:30 AM</span>). If regular, include <span class="badge-status badge-regular">Regular Event</span>.
   - For Planning: Stage Status badge in top-right (e.g., <span class="badge-status badge-new">New Application</span>).
   - For News & Governance: Publication or meeting date tag ONLY in top-right (e.g., <span class="badge-status badge-other">10 Aug</span>).
2. BOTTOM STRAPLINE ROW AT THE BOTTOM OF EVERY CARD:
   <div class="card-strapline">
     <div class="strapline-left">
       <span class="strapline-source">Source: <a href="[URL]" target="_blank" rel="noopener">[Source Name]</a></span>
       <span class="strapline-sep">•</span>
       <a href="[URL]" target="_blank" rel="noopener" class="strapline-report-link">Full Report &rarr;</a>
     </div>
     <!-- ONLY include strapline-right if there is a REAL official reference number (e.g. planning ref 26/00142/OUT). DO NOT invent artificial references for news or events! -->
     <div class="strapline-right">
       <span class="strapline-ref">Ref: [Real Reference Number]</span>
     </div>
   </div>

SECTION BLOCK ORDER (MUST BE SEPARATED AS FOLLOWS):
1. BLOCK 1 (FIRST): <div class="briefing-block"><div class="briefing-block-header"><h3 class="briefing-block-title">📅 What's On</h3></div><div class="briefing-block-content">...</div></div>
   - Events in What's On MUST be ordered strictly by event occurrence date ASCENDING (earliest upcoming date first).
   - Today's Events FIRST (with class "event-card event-card-today"), followed by Upcoming Events.

2. BLOCK 2 (SECOND): <div class="briefing-block"><div class="briefing-block-header"><h3 class="briefing-block-title">📰 Village News</h3></div><div class="briefing-block-content">...</div></div>
   - General local news stories (Google News, Hunts Post, Village Scene Magazine) formatted as .news-card elements.

3. BLOCK 3 (THIRD): <div class="briefing-block"><div class="briefing-block-header"><h3 class="briefing-block-title">🏛️ Governance & Parish Council</h3></div><div class="briefing-block-content">...</div></div>
   - MUST INCLUDE LINK BANNER AT THE TOP OF THE SECTION CONTENT:
     <div class="governance-calendar-banner" style="background: var(--color-tag-bg); padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-weight: 600; font-size: 0.95rem;">📅 Official Parish Council Meetings & Agendas: <a href="https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list" target="_blank" rel="noopener">Warboys Parish Council Meeting Calendar &rarr;</a></div>
   - Below the link banner, render all interesting items extracted from the latest meeting minutes and agendas as governance cards.

4. BLOCK 4 (FOURTH): <div class="briefing-block"><div class="briefing-block-header"><h3 class="briefing-block-title">🏗️ Planning & Development (Past 30 Days)</h3></div><div class="briefing-block-content">...</div></div>
   - Sub-grouped under New Applications, Updates & In Progress, Decided Applications with bottom straplines.

DO NOT use '###' markdown headers inside raw HTML blocks. Always use <div class="briefing-block-header"><h3 class="briefing-block-title">...</h3></div>.`;

    const contextSummary = items.map((item, idx) => `
Item #${idx + 1}:
- Title: ${item.title}
- Reference: ${item.reference || ''}
- Source: [${item.sourceName}](${item.url})
- Date: ${item.date}
- Category: ${item.category}
- Source ID: ${item.sourceId || ''}
- Event Category: ${item.eventCategory || 'N/A'}
- Is Regular Event: ${item.isRegular ? 'YES' : 'NO'}
- Event Time/Date: ${item.eventTime || 'N/A'}
- Event Date String: ${item.eventDate || item.date || 'N/A'}
- Venue: ${item.venue || 'N/A'}
- Status Category: ${item.statusCategory || 'N/A'}
- Status Label: ${item.statusLabel || 'In Progress'}
- Badge Class: ${item.badgeClass || 'badge-progress'}
- Decision Outcome: ${item.decisionOutcome || 'N/A'}
- Address: ${item.address || 'N/A'}
- Map URL: ${item.mapUrl || '#'}
- Clean Summary: ${item.content}
`).join('\n---\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here are today's pre-filtered items for ${villageName} (${isoDate}):\n\n${contextSummary}\n\nPlease generate today's daily briefing.` }
    ];

    let currentTurn = 0;
    let finalMarkdown = null;

    while (currentTurn < this.maxTurns) {
      currentTurn++;
      const response = await this.client.runAgentStep(messages, tools);

      if (response.mockBriefing || !response.content && !response.tool_calls) {
        finalMarkdown = this.generateFallbackBriefing(items, isoDate, villageName, county);
        break;
      }

      messages.push(response);

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const toolCall of response.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          const targetTool = tools.find(t => t.name === fnName);
          let toolResult = `Tool ${fnName} not found.`;
          if (targetTool) {
            toolResult = await targetTool.execute(fnArgs);
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: String(toolResult)
          });
        }
      } else if (response.content) {
        finalMarkdown = response.content;
        break;
      }
    }

    if (!finalMarkdown) {
      finalMarkdown = this.generateFallbackBriefing(items, isoDate, villageName, county);
    }

    return finalMarkdown;
  }

  generateZeroItemsBriefing(isoDate, villageName, county) {
    return `<div class="briefing-block">
  <div class="briefing-block-header">
    <h3 class="briefing-block-title">📅 Daily Overview</h3>
  </div>
  <div class="briefing-block-content">
    <p>No new local news, events, or planning updates were published for ${villageName} today.</p>
    <p style="margin-top: 1rem;"><strong>Local Information:</strong></p>
    <ul>
      <li><strong>District Council:</strong> ${this.villageConfig.districtCouncil || 'Huntingdonshire District Council'}</li>
      <li><strong>Parish Council:</strong> ${this.villageConfig.parishCouncil || 'Warboys Parish Council'}</li>
      <li><strong>County:</strong> ${county}</li>
    </ul>
    <p style="margin-top: 1rem; color: var(--color-text-muted);"><em>Check back tomorrow for fresh updates or explore past entries in the <a href="/archive/">Archive</a>.</em></p>
  </div>
</div>`;
  }

  generateFallbackBriefing(items, isoDate, villageName, county) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const eventItems = items.filter(i => {
      if (!i.category.toLowerCase().includes('event')) return false;
      if (i.isRegular) return true;
      const d = new Date(i.eventDate || i.date);
      return !isNaN(d.getTime()) && d >= todayStart;
    });

    // Sort event items strictly by eventDate ascending (earliest event first)
    eventItems.sort((a, b) => {
      const dA = new Date(a.eventDate || a.date || 0);
      const dB = new Date(b.eventDate || b.date || 0);
      return dA - dB;
    });

    const planningItems = items.filter(i => i.sourceId === 'hdc-planning' || (i.category && i.category.toLowerCase() === 'planning'));
    
    // Separate Village News from Governance & Parish Council
    const governanceItems = items.filter(i => !eventItems.includes(i) && !planningItems.includes(i) && (i.sourceId === 'warboys-parish' || (i.sourceName && i.sourceName.toLowerCase().includes('parish council')) || (i.category && i.category.toLowerCase().includes('governance'))));
    const generalNewsItems = items.filter(i => !eventItems.includes(i) && !planningItems.includes(i) && !governanceItems.includes(i));

    generalNewsItems.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    governanceItems.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    let md = `Welcome to today's daily briefing for **${villageName}**, ${county}.\n\n`;

    const getStraplineRightHtml = (item) => {
      if (item.reference && item.reference.trim() && !item.reference.startsWith('Ref Pending') && !item.reference.startsWith('EVT-') && !item.reference.startsWith('NEWS-')) {
        return `<div class="strapline-right"><span class="strapline-ref">Ref: ${item.reference}</span></div>`;
      }
      return ``;
    };

    // 1. BLOCK 1: WHAT'S ON
    if (eventItems.length > 0) {
      const todayEvents = eventItems.filter(i => i.eventCategory === 'TODAY' || (i.eventTime && i.eventTime.toLowerCase().includes('today')));
      const upcomingEvents = eventItems.filter(i => !todayEvents.includes(i));

      md += `<div class="briefing-block">\n`;
      md += `  <div class="briefing-block-header">\n`;
      md += `    <h3 class="briefing-block-title">📅 What's On</h3>\n`;
      md += `  </div>\n`;
      md += `  <div class="briefing-block-content">\n\n`;

      const renderEventCard = (item) => {
        const isToday = item.eventCategory === 'TODAY' || (item.eventTime && item.eventTime.toLowerCase().includes('today'));
        const cardClass = isToday ? 'event-card event-card-today' : 'event-card';
        const badgeCls = isToday ? 'badge-today' : 'badge-upcoming';
        const badgeLabel = isToday ? 'TODAY' : (item.eventTime || 'Upcoming');
        const venueStr = item.venue || 'Warboys Village Centre';
        const regularBadge = item.isRegular ? ` <span class="badge-status badge-regular">Regular Event</span>` : '';
        const straplineRight = getStraplineRightHtml(item);

        return `<div class="${cardClass}">
  <div class="event-header">
    <h5 class="event-title">${item.title}</h5>
    <div>
      <span class="badge-status ${badgeCls}">${badgeLabel}</span>${regularBadge}
    </div>
  </div>
  <div class="event-meta">📍 ${venueStr}</div>
  <p class="event-desc">${item.content}</p>
  <div class="card-strapline">
    <div class="strapline-left">
      <span class="strapline-source">Source: <a href="${item.url}" target="_blank" rel="noopener">${item.sourceName}</a></span>
      <span class="strapline-sep">•</span>
      <a href="${item.url}" target="_blank" rel="noopener" class="strapline-report-link">Full Event Link &rarr;</a>
    </div>
    ${straplineRight}
  </div>
</div>\n\n`;
      };

      for (const item of todayEvents) md += renderEventCard(item);
      for (const item of upcomingEvents) md += renderEventCard(item);

      md += `  </div>\n`;
      md += `</div>\n\n`;
    }

    // 2. BLOCK 2: VILLAGE NEWS (General news only)
    if (generalNewsItems.length > 0) {
      md += `<div class="briefing-block">\n`;
      md += `  <div class="briefing-block-header">\n`;
      md += `    <h3 class="briefing-block-title">📰 Village News</h3>\n`;
      md += `  </div>\n`;
      md += `  <div class="briefing-block-content">\n\n`;

      for (const item of generalNewsItems) {
        const straplineRight = getStraplineRightHtml(item);
        const itemDateStr = item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Recent';

        md += `<div class="news-card">
  <div class="news-card-header">
    <h5 class="news-title"><a href="${item.url}" target="_blank" rel="noopener">${item.title}</a></h5>
    <div>
      <span class="badge-status badge-other">${itemDateStr}</span>
    </div>
  </div>
  <div class="news-summary">
    <p>${item.content}</p>
  </div>
  <div class="card-strapline">
    <div class="strapline-left">
      <span class="strapline-source">Source: <a href="${item.url}" target="_blank" rel="noopener">${item.sourceName}</a></span>
      <span class="strapline-sep">•</span>
      <a href="${item.url}" target="_blank" rel="noopener" class="strapline-report-link">Full Story &rarr;</a>
    </div>
    ${straplineRight}
  </div>
</div>\n\n`;
      }

      md += `  </div>\n`;
      md += `</div>\n\n`;
    }

    // 3. BLOCK 3: GOVERNANCE & PARISH COUNCIL (Dedicated block with top link banner)
    if (governanceItems.length > 0) {
      md += `<div class="briefing-block">\n`;
      md += `  <div class="briefing-block-header">\n`;
      md += `    <h3 class="briefing-block-title">🏛️ Governance & Parish Council</h3>\n`;
      md += `  </div>\n`;
      md += `  <div class="briefing-block-content">\n\n`;
      md += `    <div class="governance-calendar-banner" style="background: var(--color-tag-bg); padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-weight: 600; font-size: 0.95rem;">📅 Official Parish Council Meetings & Agendas: <a href="https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list" target="_blank" rel="noopener">Warboys Parish Council Meeting Calendar &rarr;</a></div>\n\n`;

      for (const item of governanceItems) {
        const straplineRight = getStraplineRightHtml(item);
        const itemDateStr = item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Recent';

        md += `<div class="news-card">
  <div class="news-card-header">
    <h5 class="news-title"><a href="${item.url}" target="_blank" rel="noopener">${item.title}</a></h5>
    <div>
      <span class="badge-status badge-other">${itemDateStr}</span>
    </div>
  </div>
  <div class="news-summary">
    <p>${item.content}</p>
  </div>
  <div class="card-strapline">
    <div class="strapline-left">
      <span class="strapline-source">Source: <a href="${item.url}" target="_blank" rel="noopener">${item.sourceName}</a></span>
      <span class="strapline-sep">•</span>
      <a href="${item.url}" target="_blank" rel="noopener" class="strapline-report-link">Full Document &rarr;</a>
    </div>
    ${straplineRight}
  </div>
</div>\n\n`;
      }

      md += `  </div>\n`;
      md += `</div>\n\n`;
    }

    // 4. BLOCK 4: PLANNING & DEVELOPMENT
    if (planningItems.length > 0) {
      const newPlans = planningItems.filter(i => i.statusCategory === 'NEW');
      const updatedPlans = planningItems.filter(i => i.statusCategory === 'UPDATED');
      const decidedPlans = planningItems.filter(i => i.statusCategory === 'DECIDED');

      md += `<div class="briefing-block">\n`;
      md += `  <div class="briefing-block-header">\n`;
      md += `    <h3 class="briefing-block-title">🏗️ Planning & Development (Past 30 Days)</h3>\n`;
      md += `  </div>\n`;
      md += `  <div class="briefing-block-content">\n\n`;

      const renderPlanCard = (item) => {
        const titleText = item.proposal || item.title;
        const badgeCls = item.badgeClass || (item.statusCategory === 'DECIDED' ? 'badge-approved' : 'badge-new');
        const badgeLabel = item.statusLabel || (item.statusCategory === 'DECIDED' ? 'Decided' : 'New Application');
        const mapLink = item.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((item.address || '') + ', UK')}`;
        const straplineRight = getStraplineRightHtml(item);

        let cardHtml = `<div class="planning-card">
  <div class="planning-card-header">
    <h5 class="planning-title">${titleText}</h5>
    <span class="badge-status ${badgeCls}">${badgeLabel}</span>
  </div>
  <div class="planning-meta-row">
    <span class="planning-address">📍 ${item.address || 'Warboys'} (<a href="${mapLink}" target="_blank" rel="noopener" class="map-link">View on Map</a>)</span>
  </div>
  <p class="planning-summary">${item.content}</p>`;

        if (item.decisionOutcome) {
          cardHtml += `
  <div class="planning-decision-box">
    <strong>Decision Statement:</strong> ${item.decisionOutcome}
  </div>`;
        }

        cardHtml += `
  <div class="card-strapline">
    <div class="strapline-left">
      <span class="strapline-source">Source: <a href="${item.url}" target="_blank" rel="noopener">${item.sourceName}</a></span>
      <span class="strapline-sep">•</span>
      <a href="${item.url}" target="_blank" rel="noopener" class="strapline-report-link">Full Application &rarr;</a>
    </div>
    ${straplineRight}
  </div>
</div>\n\n`;
        return cardHtml;
      };

      if (newPlans.length > 0) {
        md += `#### 🆕 New Applications\n`;
        for (const item of newPlans) md += renderPlanCard(item);
      }

      if (updatedPlans.length > 0) {
        md += `#### 🔄 In Progress & Updates\n`;
        for (const item of updatedPlans) md += renderPlanCard(item);
      }

      if (decidedPlans.length > 0) {
        md += `#### 🏁 Decided Applications\n`;
        for (const item of decidedPlans) md += renderPlanCard(item);
      }

      md += `  </div>\n`;
      md += `</div>\n\n`;
    }

    return md;
  }
}

module.exports = BriefingAgent;
