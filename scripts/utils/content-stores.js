const fs = require('fs');
const path = require('path');
const { isDeathNotice } = require('./pre-filter');
const { loadCalendar, saveCalendar } = require('./events-calendar-store');

const DATA_DIR = path.join(__dirname, '..', '..', 'src', '_data');
const NEWS_STORE_PATH = path.join(DATA_DIR, 'news_store.json');
const PLANNING_STORE_PATH = path.join(DATA_DIR, 'planning_store.json');
const GOVERNANCE_STORE_PATH = path.join(DATA_DIR, 'governance_store.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) || defaultVal;
    }
  } catch (err) {
    console.warn(`[ContentStores] Error reading ${path.basename(filePath)}:`, err.message);
  }
  return defaultVal;
}

function writeJsonFile(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[ContentStores] Error writing ${path.basename(filePath)}:`, err.message);
  }
}

// ----------------- NEWS STORE -----------------

function loadNewsStore(options = {}) {
  const { maxDays = 21, nowDate = new Date() } = options;
  const items = readJsonFile(NEWS_STORE_PATH, []);
  if (!maxDays) return items;

  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  return items.filter(item => {
    const itemDateStr = item.date || item.lastSeen;
    if (!itemDateStr) return true;
    const d = new Date(itemDateStr);
    return isNaN(d.getTime()) || d >= cutoff;
  });
}

function cleanNewsSnippet(text = '') {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:(?:share|facebook|twitter|whatsapp|email|messenger|reddit|linkedin|pinterest|copy link)\s*)+/i, '')
    .replace(/\d+\s*(?:KB|MB)\b/gi, '')
    .trim();
}

function cleanNewsTitle(title = '') {
  return title
    .replace(/^FOWL Blog:\s*/i, '')
    .replace(/^Warboys Parish Council:\s*/i, '')
    .replace(/^Village Scene Magazine:\s*/i, '')
    .replace(/\s*-\s*The Hunts Post$/i, '')
    .replace(/\s*-\s*The Hunts Post News$/i, '')
    .replace(/\d+\s*(?:KB|MB)\b/gi, '')
    .trim();
}

function updateNewsStore(incomingItems = [], options = {}) {
  const { maxDays = 21, nowDate = new Date() } = options;
  const existing = loadNewsStore({ maxDays, nowDate });
  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  const seenMap = new Map();

  const getDedupeKey = (item) => {
    if (item.url && !item.url.includes('example.com')) {
      const cleanUrl = item.url.split('?')[0].replace(/\/+$/, '').toLowerCase();
      if (cleanUrl.length > 10) return `url_${cleanUrl}`;
    }
    const cleanTitleNorm = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `title_${cleanTitleNorm.slice(0, 45)}`;
  };

  // Add existing items that are not expired
  for (const item of existing) {
    const key = getDedupeKey(item);
    seenMap.set(key, item);
  }

  // Merge incoming items
  for (const raw of incomingItems) {
    if (!raw || !raw.title) continue;
    if (isDeathNotice(raw)) continue;

    const itemDateStr = raw.date || nowDate.toISOString();
    const d = new Date(itemDateStr);
    if (!isNaN(d.getTime()) && d < cutoff) continue;

    const key = getDedupeKey(raw);
    const existingItem = seenMap.get(key);

    const cleanTitle = cleanNewsTitle(raw.title);
    const cleanContent = cleanNewsSnippet(raw.content || raw.title);

    const mergedItem = {
      id: raw.id || (existingItem && existingItem.id) || `news-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      content: cleanContent,
      url: raw.url || (existingItem && existingItem.url) || '#',
      date: raw.date || (existingItem && existingItem.date) || nowDate.toISOString(),
      category: raw.category || (existingItem && existingItem.category) || 'Local News',
      sourceId: raw.sourceId || (existingItem && existingItem.sourceId) || 'news',
      sourceName: raw.sourceName || (existingItem && existingItem.sourceName) || 'Local News',
      lastSeen: nowDate.toISOString()
    };

    if (raw.reference) mergedItem.reference = raw.reference;
    seenMap.set(key, mergedItem);
  }

  const combined = Array.from(seenMap.values())
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  writeJsonFile(NEWS_STORE_PATH, combined);
  return combined;
}

// ----------------- PLANNING STORE -----------------

function loadPlanningStore(options = {}) {
  const { maxActiveDays = 90, maxDecidedDays = 30, nowDate = new Date() } = options;
  const items = readJsonFile(PLANNING_STORE_PATH, []);

  const activeCutoff = new Date(nowDate);
  activeCutoff.setDate(activeCutoff.getDate() - maxActiveDays);

  const decidedCutoff = new Date(nowDate);
  decidedCutoff.setDate(decidedCutoff.getDate() - maxDecidedDays);

  return items.filter(item => {
    const isDecided = item.statusCategory === 'DECIDED';
    const cutoff = isDecided ? decidedCutoff : activeCutoff;
    const itemDateStr = item.decisionDate || item.date || item.lastSeen;
    if (!itemDateStr) return true;
    const d = new Date(itemDateStr);
    return isNaN(d.getTime()) || d >= cutoff;
  });
}

function updatePlanningStore(incomingItems = [], options = {}) {
  const { maxActiveDays = 90, maxDecidedDays = 30, nowDate = new Date() } = options;
  const existing = loadPlanningStore({ maxActiveDays, maxDecidedDays, nowDate });

  const seenMap = new Map();

  const getDedupeKey = (item) => {
    if (item.reference && item.reference.trim() && !item.reference.startsWith('Ref Pending')) {
      return `ref_${item.reference.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    }
    if (item.url && !item.url.includes('example.com')) {
      return `url_${item.url.split('?')[0].replace(/\/+$/, '').toLowerCase()}`;
    }
    const cleanNorm = `${item.address || ''}_${item.title || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `plan_${cleanNorm.slice(0, 50)}`;
  };

  for (const item of existing) {
    seenMap.set(getDedupeKey(item), item);
  }

  for (const raw of incomingItems) {
    if (!raw || (!raw.title && !raw.proposal)) continue;

    const key = getDedupeKey(raw);
    const prev = seenMap.get(key);

    const isDecided = raw.statusCategory === 'DECIDED' || (prev && prev.statusCategory === 'DECIDED');
    const decisionOutcome = raw.decisionOutcome || (prev && prev.decisionOutcome) || null;
    const statusCategory = isDecided ? 'DECIDED' : (raw.statusCategory || (prev && prev.statusCategory) || 'NEW');
    const statusLabel = raw.statusLabel || (isDecided ? (decisionOutcome || 'Decided') : (prev && prev.statusLabel) || 'New Application');
    const badgeClass = raw.badgeClass || (isDecided ? (statusLabel.toLowerCase().includes('refus') ? 'badge-refused' : 'badge-approved') : (prev && prev.badgeClass) || 'badge-new');

    const merged = {
      id: raw.id || (prev && prev.id) || `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reference: raw.reference || (prev && prev.reference) || '',
      title: raw.title || raw.proposal || (prev && prev.title) || 'Planning Application',
      proposal: raw.proposal || raw.title || (prev && prev.proposal) || '',
      address: raw.address || (prev && prev.address) || 'Warboys',
      content: raw.content || (prev && prev.content) || raw.proposal || '',
      url: raw.url || (prev && prev.url) || '#',
      mapUrl: raw.mapUrl || (prev && prev.mapUrl) || '#',
      date: raw.date || (prev && prev.date) || nowDate.toISOString(),
      decisionDate: raw.decisionDate || (raw.statusCategory === 'DECIDED' ? nowDate.toISOString() : (prev && prev.decisionDate)),
      statusCategory,
      statusLabel,
      badgeClass,
      decisionOutcome,
      category: 'Planning',
      sourceId: raw.sourceId || (prev && prev.sourceId) || 'hdc-planning',
      sourceName: raw.sourceName || (prev && prev.sourceName) || 'Huntingdonshire District Council Planning',
      lastSeen: nowDate.toISOString()
    };

    seenMap.set(key, merged);
  }

  const combined = Array.from(seenMap.values())
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  writeJsonFile(PLANNING_STORE_PATH, combined);
  return combined;
}

// ----------------- GOVERNANCE STORE -----------------

function loadGovernanceStore(options = {}) {
  const { maxDays = 60, nowDate = new Date() } = options;
  const items = readJsonFile(GOVERNANCE_STORE_PATH, []);
  if (!maxDays) return items;

  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  // Group by meeting title to ensure we keep all items from at least the 2 latest meetings
  const meetingsMap = new Map();
  for (const item of items) {
    const meetingKey = item.meetingTitle || 'Parish Council Meeting';
    if (!meetingsMap.has(meetingKey)) {
      meetingsMap.set(meetingKey, {
        date: new Date(item.date || 0),
        items: []
      });
    }
    meetingsMap.get(meetingKey).items.push(item);
  }

  const sortedMeetings = Array.from(meetingsMap.values())
    .sort((a, b) => b.date - a.date);

  const retained = [];
  const latest2Meetings = new Set(sortedMeetings.slice(0, 2).map(m => m.items).flat());

  for (const item of items) {
    const itemDate = new Date(item.date || 0);
    // Retain if within maxDays OR if it belongs to one of the 2 latest meetings
    if (itemDate >= cutoff || latest2Meetings.has(item)) {
      retained.push(item);
    }
  }

  return retained;
}

function updateGovernanceStore(incomingItems = [], options = {}) {
  const { maxDays = 60, nowDate = new Date() } = options;
  const existing = loadGovernanceStore({ maxDays, nowDate });

  const seenMap = new Map();

  const getDedupeKey = (item) => {
    const mTitle = (item.meetingTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const iTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `gov_${mTitle.slice(0, 30)}_${iTitle.slice(0, 40)}`;
  };

  for (const item of existing) {
    seenMap.set(getDedupeKey(item), item);
  }

  for (const raw of incomingItems) {
    if (!raw || !raw.title) continue;

    const key = getDedupeKey(raw);
    const prev = seenMap.get(key);

    const merged = {
      id: raw.id || (prev && prev.id) || `gov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: raw.title.trim(),
      content: (raw.content || raw.title).trim(),
      url: raw.url || (prev && prev.url) || '#',
      documentUrl: raw.documentUrl || raw.url || (prev && prev.documentUrl) || '#',
      meetingTitle: raw.meetingTitle || (prev && prev.meetingTitle) || 'Parish Council Meeting',
      date: raw.date || (prev && prev.date) || nowDate.toISOString(),
      itemSpecificDate: raw.itemSpecificDate || (prev && prev.itemSpecificDate) || '',
      category: 'Governance',
      sourceId: raw.sourceId || (prev && prev.sourceId) || 'warboys-parish',
      sourceName: raw.sourceName || (prev && prev.sourceName) || 'Parish Council',
      lastSeen: nowDate.toISOString()
    };

    if (raw.reference) merged.reference = raw.reference;
    seenMap.set(key, merged);
  }

  const combined = Array.from(seenMap.values())
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  writeJsonFile(GOVERNANCE_STORE_PATH, combined);
  return combined;
}

// ----------------- UNIFIED STORE AGGREGATOR -----------------

function loadAllStores(options = {}) {
  const events = loadCalendar(options);
  const news = loadNewsStore(options);
  const governance = loadGovernanceStore(options);
  const planning = loadPlanningStore(options);

  return {
    events,
    news,
    governance,
    planning
  };
}

module.exports = {
  DATA_DIR,
  NEWS_STORE_PATH,
  PLANNING_STORE_PATH,
  GOVERNANCE_STORE_PATH,
  loadNewsStore,
  updateNewsStore,
  loadPlanningStore,
  updatePlanningStore,
  loadGovernanceStore,
  updateGovernanceStore,
  loadCalendar,
  saveCalendar,
  loadAllStores
};
