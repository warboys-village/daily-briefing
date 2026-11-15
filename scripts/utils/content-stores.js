const fs = require('fs');
const path = require('path');
const { isDeathNotice } = require('./pre-filter');
const { loadCalendar, saveCalendar } = require('./events-calendar-store');
const { loadConfig } = require('./config-loader');
const { isItemExpired } = require('./schemas');

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
    if (options.dataDir) {
      return path.join(targetDir, filename);
    }
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
    if (item.url && item.url.includes('fowl.org.uk/category/')) return false;
    const isSchool = Boolean(item.isSchoolSource) || Boolean(item.school) || (item.sourceId && item.sourceId.includes('wpa-'));
    if (isSchool && !item.isWholeVillage) return false;
    if (isItemExpired(item, nowDate)) return false;

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
    .replace(/Find, save and share Public Notices that affect you in the area\.\s*The Public Notice Portal carries statutory public notices published in local newspapers and is the fastest and most effective way of finding out what is happening in YOUR neighbourhood\.\s*/gi, '')
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

    // Skip archive / category listing pages
    if (raw.url && raw.url.includes('fowl.org.uk/category/')) {
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
        sourceUrl: raw.sourceUrl || existingEntry.sourceUrl,
        sourceHash: raw.sourceHash || existingEntry.sourceHash,
        expiresAt: raw.expiresAt || existingEntry.expiresAt,
        relevance: raw.relevance || existingEntry.relevance,
        yearGroups: Array.isArray(raw.yearGroups) ? raw.yearGroups : existingEntry.yearGroups,
        category: raw.category || existingEntry.category,
        isSchoolSource: raw.isSchoolSource !== undefined ? raw.isSchoolSource : existingEntry.isSchoolSource,
        school: raw.school || existingEntry.school,
        isWholeVillage: raw.isWholeVillage !== undefined ? raw.isWholeVillage : existingEntry.isWholeVillage
      });
    } else {
      // New item
      itemMap.set(normalizedUrl, {
        id: raw.id || `news-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: cleanTitle,
        content: cleanContent,
        summary: cleanSummary,
        url: normalizedUrl,
        sourceUrl: raw.sourceUrl || normalizedUrl,
        sourceHash: raw.sourceHash,
        expiresAt: raw.expiresAt,
        relevance: raw.relevance,
        yearGroups: Array.isArray(raw.yearGroups) ? raw.yearGroups : undefined,
        date: raw.date || new Date(nowDate).toISOString(),
        firstSeen: new Date(nowDate).toISOString(),
        lastSeen: new Date(nowDate).toISOString(),
        sourceName: raw.sourceName || 'Local News',
        sourceId: raw.sourceId || 'rss',
        category: raw.category || 'Village News',
        isSchoolSource: raw.isSchoolSource || Boolean(raw.school),
        school: raw.school,
        isWholeVillage: raw.isWholeVillage
      });
    }
  }

  // Filter against retention TTL
  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  const merged = Array.from(itemMap.values())
    .filter(item => {
      if (item.url && item.url.includes('fowl.org.uk/category/')) return false;
      const isSchool = Boolean(item.isSchoolSource) || Boolean(item.school) || (item.sourceId && item.sourceId.includes('wpa-'));
      if (isSchool && !item.isWholeVillage) return false;
      if (isItemExpired(item, nowDate)) return false;

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
    if (isItemExpired(item, nowDate)) return false;
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
        title: raw.title || existingEntry.title,
        status: raw.status || raw.statusLabel || existingEntry.status,
        statusLabel: raw.statusLabel || raw.status || existingEntry.statusLabel,
        statusCategory: raw.statusCategory || existingEntry.statusCategory || 'UPDATED',
        badgeClass: raw.badgeClass || existingEntry.badgeClass,
        decisionOutcome: raw.decisionOutcome || existingEntry.decisionOutcome,
        proposal: raw.proposal || existingEntry.proposal,
        address: raw.address || existingEntry.address,
        url: raw.url || existingEntry.url,
        sourceUrl: raw.sourceUrl || existingEntry.sourceUrl,
        sourceHash: raw.sourceHash || existingEntry.sourceHash,
        expiresAt: raw.expiresAt || existingEntry.expiresAt,
        lastUpdated: isStatusChange ? nowIso : existingEntry.lastUpdated,
        lastSeen: nowIso
      });
    } else {
      planMap.set(ref, {
        id: raw.id || `plan-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        reference: ref,
        title: raw.title || raw.proposal || '',
        address: (raw.address || '').trim(),
        proposal: (raw.proposal || '').trim(),
        status: (raw.status || raw.statusLabel || 'In Progress').trim(),
        statusLabel: (raw.statusLabel || raw.status || 'In Progress').trim(),
        statusCategory: (raw.statusCategory || 'NEW').trim(),
        badgeClass: raw.badgeClass || (raw.statusCategory === 'NEW' ? 'badge-new' : 'badge-progress'),
        decisionOutcome: raw.decisionOutcome || null,
        url: raw.url || '',
        sourceUrl: raw.sourceUrl || raw.url || '',
        sourceHash: raw.sourceHash,
        expiresAt: raw.expiresAt,
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
      if (isItemExpired(item, nowDate)) return false;
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
    if (isItemExpired(item, nowDate)) return false;
    const dStr = item.meetingDate || item.date;
    if (dStr && retainedMeetingDates.has(dStr)) return true;
    if (!dStr) return true;
    const d = new Date(dStr);
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}

function updateGovernanceStore(newItems = [], options = {}) {
  const { nowDate = new Date() } = options;
  const paths = resolveStorePaths(options);
  const existing = loadGovernanceStore({ minMeetings: 4, maxDays: 90, nowDate, ...options });

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
      sourceUrl: raw.sourceUrl || (existingEntry ? existingEntry.sourceUrl : (raw.url || '')),
      sourceHash: raw.sourceHash || (existingEntry ? existingEntry.sourceHash : undefined),
      expiresAt: raw.expiresAt || (existingEntry ? existingEntry.expiresAt : undefined),
      relevance: raw.relevance || (existingEntry ? existingEntry.relevance : undefined),
      yearGroups: Array.isArray(raw.yearGroups) ? raw.yearGroups : (existingEntry ? existingEntry.yearGroups : undefined),
      isSchoolSource: raw.isSchoolSource !== undefined ? raw.isSchoolSource : (existingEntry ? existingEntry.isSchoolSource : undefined),
      school: raw.school || (existingEntry ? existingEntry.school : undefined),
      schoolName: raw.schoolName || (existingEntry ? existingEntry.schoolName : undefined),
      isWholeVillage: raw.isWholeVillage !== undefined ? raw.isWholeVillage : (existingEntry ? existingEntry.isWholeVillage : undefined),
      sourceId: raw.sourceId || (existingEntry ? existingEntry.sourceId : undefined),
      priority: raw.priority || (existingEntry ? existingEntry.priority : 'STANDARD'),
      sourceName: raw.sourceName || (existingEntry ? existingEntry.sourceName : 'Parish Council Minutes'),
      date: raw.date || raw.meetingDate || (existingEntry ? existingEntry.date : new Date().toISOString()),
      lastSeen: new Date().toISOString()
    };
    if (raw.reference) merged.reference = raw.reference;
    seenMap.set(key, merged);
  }

  const combined = Array.from(seenMap.values())
    .filter(item => !isItemExpired(item, nowDate))
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
