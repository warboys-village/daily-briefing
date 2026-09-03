function isDeathNotice(itemOrTitle, contentArg = '', urlArg = '') {
  if (!itemOrTitle) return false;

  let rawTitle = '';
  let content = '';
  let rawUrl = '';

  if (typeof itemOrTitle === 'object') {
    rawTitle = (itemOrTitle.title || '').trim();
    content = (itemOrTitle.content || itemOrTitle.summary || '').trim();
    rawUrl = (itemOrTitle.url || '').toLowerCase();
  } else {
    rawTitle = String(itemOrTitle).trim();
    content = String(contentArg || '').trim();
    rawUrl = String(urlArg || '').toLowerCase();
  }

  const combined = `${rawTitle} ${content}`.toLowerCase();

  // Layer 1: URL domain & path pattern check
  const deathUrlPatterns = [
    '/announcements/', '/obituaries/', '/in-memoriam/',
    '/family-notices/', '/notices/death/', 'familynotices.co.uk',
    'funeral-notices.co.uk', 'bmms.co.uk', 'remembering-'
  ];
  if (deathUrlPatterns.some(p => rawUrl.includes(p))) {
    return true;
  }

  // Layer 2: Dynamic suffix cleaning (strips any trailing source suffix like "- huntspost.co.uk", "- The Hunts Post", etc.)
  const cleanTitle = rawTitle
    .replace(/\s*-\s*[a-z0-9.-]+\.(?:co\.uk|com|org|net|gov\.uk)$/i, '')
    .replace(/\s*-\s*(?:The Hunts Post|The Hunts Post News|Cambs Times|Google News)$/i, '')
    .trim();

  // Layer 3: Expanded death notice & obituary keyword/phrase dictionary
  const deathKeywords = [
    'death notice', 'death notices', 'obituary', 'obituaries',
    'funeral notice', 'funeral notices', 'in memoriam',
    'passed away', 'beloved wife', 'beloved husband',
    'beloved mother', 'beloved father', 'beloved son', 'beloved daughter',
     'beloved sister', 'beloved brother', 'beloved grandmother', 'beloved grandfather',
    'in loving memory', 'peacefully on', 'crematorium',
    'funeral service', 'family flowers only', 'donations in lieu',
    'late of', 'deeply missed', 'sadly passed', 'dearly loved'
  ];
  if (deathKeywords.some(kw => combined.includes(kw))) {
    return true;
  }

  // Layer 4: Structural Name + Age Pattern & ALL-CAPS Name Detection
  // Matches "NAME, Age", "NAME (Age)", "NAME - aged Age", "SURNAME, Firstname (Age)"
  const nameAgePattern = /^[A-Z\s',-]+(?:,\s*\d{1,3}|\s*\(\d{1,3}\)|\s*-\s*aged\s+\d{1,3})/i;
  if (nameAgePattern.test(cleanTitle)) {
    return true;
  }

  const lettersOnly = cleanTitle.replace(/[^A-Za-z]/g, '');
  if (lettersOnly.length > 5 && lettersOnly === lettersOnly.toUpperCase()) {
    const isSpecialCaps = cleanTitle.includes('WARBOYS') || cleanTitle.includes('COUNCIL') || cleanTitle.includes('NOTICE') || cleanTitle.includes('PLANNING') || cleanTitle.includes('PARISH') || cleanTitle.includes('ROAD') || cleanTitle.includes('CLOSURE') || cleanTitle.includes('MEETING') || cleanTitle.includes('POLICE') || cleanTitle.includes('SCHOOL');
    if (!isSpecialCaps) {
      return true;
    }
  }

  return false;
}

function preFilterItems(rawItems, config = {}, nowDate = new Date()) {
  const { maxDays = 30, maxItemSnippetLength = 800, maxTotalItems = 80 } = config;

  const seenTitles = new Set();
  const filtered = [];

  // Group items into distinct categories so general news is guaranteed slots
  const generalNews = [];
  const schoolNews = [];
  const governanceAndPlanning = [];
  const events = [];

  for (const item of rawItems) {
    if (!item || !item.title || !item.url) continue;
    if (isDeathNotice(item)) continue;

    const catStr = (item.category || '').toLowerCase();
    const srcStr = (item.sourceName || '').toLowerCase();
    const srcIdStr = (item.sourceId || '').toLowerCase();

    const isSchool = srcIdStr.includes('school') || srcIdStr.includes('college') || srcIdStr.includes('academy') || srcIdStr.includes('wpa') || catStr.includes('school') || srcStr.includes('school') || srcStr.includes('academy');
    const isGovOrPlan = catStr.includes('governance') || catStr.includes('plan') || srcStr.includes('council') || srcIdStr === 'warboys-parish' || srcIdStr === 'cambs-county' || srcIdStr === 'hdc-planning';
    const isEvent = catStr.includes('event') || srcIdStr.includes('event');

    if (isSchool) {
      schoolNews.push(item);
    } else if (isGovOrPlan) {
      governanceAndPlanning.push(item);
    } else if (isEvent) {
      events.push(item);
    } else {
      generalNews.push(item);
    }
  }

  // Sort each group by date descending
  generalNews.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  governanceAndPlanning.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  schoolNews.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Combine with general news & governance first, capping internal school items to 3 max
  const combinedRaw = [
    ...generalNews,
    ...governanceAndPlanning,
    ...events,
    ...schoolNews.slice(0, 3)
  ];

  for (const item of combinedRaw) {
    // Clean title by removing source prefixes/suffixes and filesize noise
    let cleanTitle = item.title.trim()
      .replace(/^FOWL Blog:\s*/i, '')
      .replace(/^Warboys Parish Council:\s*/i, '')
      .replace(/^Village Scene Magazine:\s*/i, '')
      .replace(/\s*-\s*The Hunts Post$/i, '')
      .replace(/\s*-\s*The Hunts Post News$/i, '')
      .replace(/\d+\s*(?:KB|MB)\b/gi, '')
      .trim();

    // Check date cutoff (allow up to 60 days for governance items so latest monthly meeting minutes are preserved)
    if (item.date) {
      const d = new Date(item.date);
      const isGov = (item.sourceId === 'warboys-parish' || item.sourceId === 'cambs-county') || (item.category || '').toLowerCase().includes('governance');
      const itemMaxDays = isGov ? 60 : maxDays;
      const itemCutoff = new Date(nowDate);
      itemCutoff.setDate(itemCutoff.getDate() - itemMaxDays);
      if (!isNaN(d.getTime()) && d < itemCutoff) continue;
    }

    // Deduplicate by normalized title + date key
    const normalizedTitle = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dateKey = (item.eventDate || item.date || '').slice(0, 10);
    const dedupeKey = `${normalizedTitle}_${dateKey}`;
    if (seenTitles.has(dedupeKey)) continue;

    seenTitles.add(dedupeKey);

    // Clean text snippet and strip social sharing UI fluff like "Share Share" & file sizes
    let cleanedContent = (item.content || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^(?:(?:share|facebook|twitter|whatsapp|email|messenger|reddit|linkedin|pinterest|copy link)\s*)+/i, '')
      .replace(/\d+\s*(?:KB|MB)\b/gi, '')
      .trim();

    if (cleanedContent.length > maxItemSnippetLength) {
      cleanedContent = cleanedContent.slice(0, maxItemSnippetLength) + '...';
    }

    filtered.push({
      ...item,
      title: cleanTitle,
      content: cleanedContent
    });

    if (filtered.length >= maxTotalItems) break;
  }

  return filtered;
}

module.exports = { preFilterItems, isDeathNotice };
