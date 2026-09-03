const fs = require('fs');
const path = require('path');
const { isDeathNotice } = require('./pre-filter');
const { loadCalendar, saveCalendar } = require('./events-calendar-store');
const { loadConfig } = require('./config-loader');

function resolveStorePaths(options = {}) {
  let targetDir;
  if (options.dataDir) {
    targetDir = path.isAbsolute(options.dataDir) ? options.dataDir : path.join(__dirname, '..', '..', options.dataDir);
  } else {
    try {
      const config = loadConfig(options);
      if (config.dataDir) {
        targetDir = path.isAbsolute(config.dataDir) ? config.dataDir : path.join(__dirname, '..', '..', config.dataDir);
      } else {
        const place = (config.placeName || config.villageName || 'warboys').toLowerCase();
        targetDir = path.join(__dirname, '..', '..', 'src', '_data', place);
      }
    } catch {
      targetDir = path.join(__dirname, '..', '..', 'src', '_data');
    }
  }

  const legacyDir = path.join(__dirname, '..', '..', 'src', '_data');

  function getPath(filename) {
    const candidate = path.join(targetDir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const legacy = path.join(legacyDir, filename);
    if (fs.existsSync(legacy)) return legacy;
    return candidate;
  }

  return {
    dir: targetDir,
    news: getPath('news_store.json'),
    planning: getPath('planning_store.json'),
    governance: getPath('governance_store.json')
  };
}

const DATA_DIR = path.join(__dirname, '..', '..', 'src', '_data');
const NEWS_STORE_PATH = path.join(DATA_DIR, 'news_store.json');
const PLANNING_STORE_PATH = path.join(DATA_DIR, 'planning_store.json');
const GOVERNANCE_STORE_PATH = path.join(DATA_DIR, 'governance_store.json');

function ensureDataDir(dir) {
  const target = dir || DATA_DIR;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
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

function writeJsonFile(filePath, data, targetDir) {
  try {
    ensureDataDir(targetDir || path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[ContentStores] Error writing ${path.basename(filePath)}:`, err.message);
  }
}

// ----------------- NEWS STORE -----------------

function loadNewsStore(options = {}) {
  const { maxDays = 21, nowDate = new Date() } = options;
  const paths = resolveStorePaths(options);
  const items = readJsonFile(paths.news, []);
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
    .replace(/\d+(?:\.\d+)?\s*(?:kb|mb|gb)\b/gi, '')
    .trim();
}

function updateNewsStore(newItems = [], options = {}) {
  const { maxDays = 21, nowDate = new Date() } = options;
  const paths = resolveStorePaths(options);
  const existing = loadNewsStore({ maxDays, nowDate, ...options });

  const itemMap = new Map();

  // Load existing valid items
  for (const item of existing) {
    if (!item || !item.url) continue;
    const normalizedUrl = item.url.split('?')[0].trim();
    itemMap.set(normalizedUrl, item);
  }

  // Merge newly ingested items
  for (const raw of newItems) {
    if (!raw || !raw.url) continue;

    // Hygiene: skip death notices
    if (isDeathNotice(raw.title, raw.content || raw.summary)) {
      continue;
    }

    const normalizedUrl = raw.url.split('?')[0].trim();
    const cleanTitle = cleanNewsSnippet(raw.title || '')
      .replace(/\s*-\s*[a-z0-9.-]+\.(?:co\.uk|com|org|net|gov\.uk)$/i, '')
      .replace(/\s*-\s*(?:The Hunts Post|The Hunts Post News|Cambs Times|Google News)$/i, '')
      .trim();
    const cleanContent = cleanNewsSnippet(raw.content || raw.summary || '');
    const cleanSummary = cleanNewsSnippet(raw.summary || raw.content || '');

    const existingEntry = itemMap.get(normalizedUrl);
    if (existingEntry) {
      // Update entry with latest seen timestamp and preserved high-signal metadata
      itemMap.set(normalizedUrl, {
        ...existingEntry,
        title: cleanTitle || existingEntry.title,
        content: cleanContent || existingEntry.content,
        summary: cleanSummary || existingEntry.summary,
        lastSeen: new Date(nowDate).toISOString(),
        sourceName: raw.sourceName || existingEntry.sourceName,
        sourceId: raw.sourceId || existingEntry.sourceId,
        category: raw.category || existingEntry.category
      });
    } else {
      // New item
      itemMap.set(normalizedUrl, {
        id: raw.id || `news-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: cleanTitle,
        content: cleanContent,
        summary: cleanSummary,
        url: normalizedUrl,
        date: raw.date || new Date(nowDate).toISOString(),
        firstSeen: new Date(nowDate).toISOString(),
        lastSeen: new Date(nowDate).toISOString(),
        sourceName: raw.sourceName || 'Local News',
        sourceId: raw.sourceId || 'rss',
        category: raw.category || 'Village News'
      });
    }
  }

  // Filter against retention TTL
  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  const merged = Array.from(itemMap.values())
    .filter(item => {
      const itemDateStr = item.date || item.lastSeen;
      if (!itemDateStr) return true;
      const d = new Date(itemDateStr);
      return isNaN(d.getTime()) || d >= cutoff;
    })
    .sort((a, b) => new Date(b.date || b.lastSeen || 0) - new Date(a.date || a.lastSeen || 0));

  writeJsonFile(paths.news, merged, paths.dir);
  return merged;
}

// ----------------- PLANNING STORE -----------------

function loadPlanningStore(options = {}) {
  const { maxDays = 90, nowDate = new Date() } = options;
  const paths = resolveStorePaths(options);
  const items = readJsonFile(paths.planning, []);
  if (!maxDays) return items;

  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  return items.filter(item => {
    const itemDateStr = item.lastUpdated || item.registeredDate || item.date;
    if (!itemDateStr) return true;
    const d = new Date(itemDateStr);
    return isNaN(d.getTime()) || d >= cutoff;
  });
}

function updatePlanningStore(newItems = [], options = {}) {
  const { maxDays = 90, nowDate = new Date() } = options;
  const paths = resolveStorePaths(options);
  const existing = loadPlanningStore({ maxDays, nowDate, ...options });

  const planMap = new Map();

  for (const item of existing) {
    if (!item || !item.reference) continue;
    planMap.set(item.reference.trim(), item);
  }

  for (const raw of newItems) {
    if (!raw || !raw.reference) continue;
    const ref = raw.reference.trim();
    const existingEntry = planMap.get(ref);

    const nowIso = new Date(nowDate).toISOString();

    if (existingEntry) {
      const isStatusChange = (raw.status && raw.status !== existingEntry.status) ||
                             (raw.statusCategory && raw.statusCategory !== existingEntry.statusCategory);

      planMap.set(ref, {
        ...existingEntry,
        status: raw.status || existingEntry.status,
        statusCategory: raw.statusCategory || existingEntry.statusCategory || 'UPDATED',
        proposal: raw.proposal || existingEntry.proposal,
        address: raw.address || existingEntry.address,
        url: raw.url || existingEntry.url,
        lastUpdated: isStatusChange ? nowIso : existingEntry.lastUpdated,
        lastSeen: nowIso
      });
    } else {
      planMap.set(ref, {
        id: raw.id || `plan-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        reference: ref,
        address: (raw.address || '').trim(),
        proposal: (raw.proposal || '').trim(),
        status: (raw.status || 'In Progress').trim(),
        statusCategory: (raw.statusCategory || 'NEW').trim(),
        url: raw.url || '',
        registeredDate: raw.registeredDate || raw.date || nowIso,
        lastUpdated: nowIso,
        lastSeen: nowIso,
        sourceName: raw.sourceName || 'Huntingdonshire District Council Planning'
      });
    }
  }

  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  const merged = Array.from(planMap.values())
    .filter(item => {
      const itemDateStr = item.lastUpdated || item.registeredDate || item.date;
      if (!itemDateStr) return true;
      const d = new Date(itemDateStr);
      return isNaN(d.getTime()) || d >= cutoff;
    })
    .sort((a, b) => new Date(b.lastUpdated || b.registeredDate || 0) - new Date(a.lastUpdated || a.registeredDate || 0));

  writeJsonFile(paths.planning, merged, paths.dir);
  return merged;
}

// ----------------- GOVERNANCE STORE -----------------

function loadGovernanceStore(options = {}) {
  const { minMeetings = 2, maxDays = 60, nowDate = new Date() } = options;
  const paths = resolveStorePaths(options);
  const items = readJsonFile(paths.governance, []);
  if (!items.length) return [];

  // Group items by meeting title / date
  const meetingDates = Array.from(new Set(items.map(i => i.meetingDate || i.date).filter(Boolean)))
    .sort((a, b) => new Date(b) - new Date(a));

  const retainedMeetingDates = new Set(meetingDates.slice(0, minMeetings));

  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  return items.filter(item => {
    const dStr = item.meetingDate || item.date;
    if (dStr && retainedMeetingDates.has(dStr)) return true;
    if (!dStr) return true;
    const d = new Date(dStr);
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}

function updateGovernanceStore(newItems = [], options = {}) {
  const paths = resolveStorePaths(options);
  const existing = loadGovernanceStore({ minMeetings: 4, maxDays: 90, ...options });

  const seenMap = new Map();

  for (const item of existing) {
    const key = `${(item.title || '').trim().toLowerCase()}:${item.meetingDate || item.date || ''}`;
    seenMap.set(key, item);
  }

  for (const raw of newItems) {
    if (!raw || !raw.title) continue;
    const key = `${(raw.title || '').trim().toLowerCase()}:${raw.meetingDate || raw.date || ''}`;
    const existingEntry = seenMap.get(key);

    const merged = {
      id: raw.id || (existingEntry ? existingEntry.id : `gov-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`),
      title: (raw.title || '').trim(),
      meetingTitle: raw.meetingTitle || (existingEntry ? existingEntry.meetingTitle : 'Parish Council Meeting'),
      meetingDate: raw.meetingDate || raw.date || (existingEntry ? existingEntry.meetingDate : new Date().toISOString().split('T')[0]),
      content: raw.content || (existingEntry ? existingEntry.content : ''),
      summary: (raw.summary || raw.content || (existingEntry ? existingEntry.summary : '')).trim(),
      url: raw.url || (existingEntry ? existingEntry.url : ''),
      priority: raw.priority || (existingEntry ? existingEntry.priority : 'STANDARD'),
      sourceName: raw.sourceName || (existingEntry ? existingEntry.sourceName : 'Parish Council Minutes'),
      date: raw.date || raw.meetingDate || (existingEntry ? existingEntry.date : new Date().toISOString()),
      lastSeen: new Date().toISOString()
    };
    if (raw.reference) merged.reference = raw.reference;
    seenMap.set(key, merged);
  }

  const combined = Array.from(seenMap.values())
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  writeJsonFile(paths.governance, combined, paths.dir);
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
  resolveStorePaths,
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
