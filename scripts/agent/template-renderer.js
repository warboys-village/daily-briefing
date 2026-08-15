/**
 * Deterministic Template Renderer
 * Transforms structured briefing data into high-contrast HTML component cards.
 */

function getStraplineRightHtml(item) {
  if (item.reference && item.reference.trim() && !item.reference.startsWith('Ref Pending') && !item.reference.startsWith('EVT-') && !item.reference.startsWith('NEWS-')) {
    return `<div class="strapline-right"><span class="strapline-ref">Ref: ${item.reference}</span></div>`;
  }
  return ``;
}

function renderEventCard(item) {
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
}

function renderNewsCard(item) {
  const straplineRight = getStraplineRightHtml(item);
  const itemDateStr = item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Recent';

  return `<div class="news-card">
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

function renderGovernanceCard(item) {
  const specificDateBadge = item.itemSpecificDate ? `<div><span class="badge-status badge-other">${item.itemSpecificDate}</span></div>` : '';

  return `<div class="news-card" style="margin-bottom: 1rem;">
  <div class="news-card-header">
    <h5 class="news-title" style="color: var(--color-text-main); font-weight: 700;">${item.title}</h5>
    ${specificDateBadge}
  </div>
  <div class="news-summary" style="margin-bottom: 0;">
    <p>${item.content}</p>
  </div>
</div>\n\n`;
}

function renderPlanCard(item) {
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
}

function renderFullBriefingHtml(data, villageName, county) {
  let md = '';

  // 1. BLOCK 1: WHAT'S ON
  if (data.events && data.events.length > 0) {
    const sortedEvents = [...data.events].sort((a, b) => new Date(a.eventDate || a.date || 0) - new Date(b.eventDate || b.date || 0));
    md += `<div class="briefing-block">\n`;
    md += `  <div class="briefing-block-header">\n`;
    md += `    <h3 class="briefing-block-title">📅 What's On</h3>\n`;
    md += `  </div>\n`;
    md += `  <div class="briefing-block-content">\n\n`;
    for (const item of sortedEvents) md += renderEventCard(item);
    md += `  </div>\n`;
    md += `</div>\n\n`;
  }

  // 2. BLOCK 2: VILLAGE NEWS
  if (data.news && data.news.length > 0) {
    const sortedNews = [...data.news].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    md += `<div class="briefing-block">\n`;
    md += `  <div class="briefing-block-header">\n`;
    md += `    <h3 class="briefing-block-title">📰 Village News</h3>\n`;
    md += `  </div>\n`;
    md += `  <div class="briefing-block-content">\n\n`;
    for (const item of sortedNews) md += renderNewsCard(item);
    md += `  </div>\n`;
    md += `</div>\n\n`;
  }

  // 3. BLOCK 3: GOVERNANCE & PARISH COUNCIL
  if (data.governance && data.governance.length > 0) {
    // Group governance items by meeting session date
    const meetingsMap = new Map();
    for (const item of data.governance) {
      const meetingHeading = item.meetingTitle || (item.date ? `Warboys Parish Council Meeting – ${new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Warboys Parish Council Meeting');
      if (!meetingsMap.has(meetingHeading)) {
        meetingsMap.set(meetingHeading, []);
      }
      meetingsMap.get(meetingHeading).push(item);
    }

    md += `<div class="briefing-block">\n`;
    md += `  <div class="briefing-block-header">\n`;
    md += `    <h3 class="briefing-block-title">🏛️ Governance & Parish Council</h3>\n`;
    md += `  </div>\n`;
    md += `  <div class="briefing-block-content">\n\n`;
    md += `    <div class="governance-calendar-banner" style="background: var(--color-tag-bg); padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-weight: 600; font-size: 0.95rem;">📅 Official Parish Council Meetings & Agendas: <a href="https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list" target="_blank" rel="noopener">Warboys Parish Council Meeting Calendar &rarr;</a></div>\n\n`;

    for (const [meetingHeading, mItems] of meetingsMap.entries()) {
      const docUrl = mItems[0] ? mItems[0].url : 'https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list';
      md += `<h4 style="font-family: var(--font-serif); font-size: 1.25rem; font-weight: 700; margin-top: 1rem; margin-bottom: 1.25rem; color: var(--color-primary); border-bottom: 2px solid var(--color-border); padding-bottom: 0.4rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">\n`;
      md += `  <span>🏛️ ${meetingHeading}</span>\n`;
      md += `  <a href="${docUrl}" target="_blank" rel="noopener" class="button-link" style="font-size: 0.8rem; padding: 0.3rem 0.65rem;">📄 Full Meeting Minutes (DOCX) &rarr;</a>\n`;
      md += `</h4>\n\n`;

      for (const item of mItems) {
        md += renderGovernanceCard(item);
      }
    }

    md += `  </div>\n`;
    md += `</div>\n\n`;
  }

  // 4. BLOCK 4: PLANNING & DEVELOPMENT
  if (data.planning && data.planning.length > 0) {
    const newPlans = data.planning.filter(i => i.statusCategory === 'NEW');
    const updatedPlans = data.planning.filter(i => i.statusCategory === 'UPDATED');
    const decidedPlans = data.planning.filter(i => i.statusCategory === 'DECIDED');

    md += `<div class="briefing-block">\n`;
    md += `  <div class="briefing-block-header">\n`;
    md += `    <h3 class="briefing-block-title">🏗️ Planning & Development (Past 30 Days)</h3>\n`;
    md += `  </div>\n`;
    md += `  <div class="briefing-block-content">\n\n`;

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

module.exports = { renderFullBriefingHtml };
