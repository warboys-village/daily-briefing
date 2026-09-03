const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config-loader');

function resolveCachePath(options = {}) {
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

  const candidate = path.join(targetDir, 'processed_documents_cache.json');
  if (fs.existsSync(candidate)) return candidate;

  // Fallback to legacy root cache if specific doesn't exist yet
  const legacyPath = path.join(__dirname, '..', '..', 'src', '_data', 'processed_documents_cache.json');
  if (fs.existsSync(legacyPath)) return legacyPath;

  return candidate;
}

function loadCache(options = {}) {
  const cachePath = resolveCachePath(options);
  try {
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[DocCache] Error reading cache file from ${cachePath}:`, err.message);
  }
  return {};
}

function saveCache(cacheData, options = {}) {
  const cachePath = resolveCachePath(options);
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Automatic Cache Pruning: Keep entries < 180 days old, cap at 500 entries
    const cutoffMs = Date.now() - (180 * 24 * 60 * 60 * 1000);
    const maxEntries = 500;

    const entries = Object.keys(cacheData).map(k => ({
      key: k,
      val: cacheData[k],
      time: new Date(cacheData[k]?.processedAt || 0).getTime()
    }));

    const validEntries = entries
      .filter(e => e.time === 0 || e.time >= cutoffMs)
      .sort((a, b) => b.time - a.time)
      .slice(0, maxEntries);

    const prunedCache = {};
    for (const e of validEntries) {
      prunedCache[e.key] = e.val;
    }

    fs.writeFileSync(cachePath, JSON.stringify(prunedCache, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[DocCache] Error saving cache file to ${cachePath}:`, err.message);
  }
}

/**
 * Retrieves cached extracted categorized items for a source URL if the timestamp matches.
 */
function getCachedSource(sourceUrl, timestamp = null, options = {}) {
  if (!sourceUrl) return null;
  const cache = loadCache(options);
  const entry = cache[sourceUrl];
  if (!entry) return null;

  // If timestamp provided and entry has timestamp, verify it hasn't changed
  if (timestamp && entry.timestamp) {
    const cachedTime = new Date(entry.timestamp).getTime();
    const targetTime = new Date(timestamp).getTime();
    if (!isNaN(cachedTime) && !isNaN(targetTime) && cachedTime !== targetTime) {
      return null; // Timestamp changed -> stale cache
    }
  }

  if (entry.extractedCategories && typeof entry.extractedCategories === 'object') {
    return entry.extractedCategories;
  }
  if (Array.isArray(entry.extractedItems)) {
    return { general: entry.extractedItems };
  }
  return null;
}

/**
 * Saves extracted categorized items for a source URL and document timestamp.
 */
function setCachedSource(sourceUrl, timestamp, extractedCategories, metadata = {}, options = {}) {
  if (!sourceUrl || !extractedCategories) return;
  const cache = loadCache(options);
  const existing = cache[sourceUrl] || {};
  cache[sourceUrl] = {
    ...existing,
    sourceUrl,
    timestamp: timestamp ? new Date(timestamp).toISOString() : (existing.timestamp || null),
    processedAt: new Date().toISOString(),
    extractedCategories,
    metadata: { ...(existing.metadata || {}), ...metadata }
  };
  saveCache(cache, options);
}

// ----------------- Legacy Compatibility Helpers -----------------

function getCachedDocument(docUrl, options = {}) {
  if (!docUrl) return null;
  const cache = loadCache(options);
  const entry = cache[docUrl];
  if (!entry) return null;

  if (entry.extractedItems !== undefined) {
    return entry.extractedItems;
  }
  return null;
}

function setCachedDocument(docUrl, extractedItems, options = {}) {
  if (!docUrl || !extractedItems) return;
  const cache = loadCache(options);
  const existing = cache[docUrl] || {};
  cache[docUrl] = {
    ...existing,
    processedAt: new Date().toISOString(),
    extractedItems
  };
  saveCache(cache, options);
}

function getCachedArticleSummary(itemKey, options = {}) {
  if (!itemKey) return null;
  const cache = loadCache(options);
  const entry = cache[`summary:${itemKey}`];
  if (entry && entry.cleanTitle && entry.cleanSummary) {
    return { cleanTitle: entry.cleanTitle, cleanSummary: entry.cleanSummary };
  }
  return null;
}

function setCachedArticleSummary(itemKey, cleanTitle, cleanSummary, options = {}) {
  if (!itemKey || !cleanSummary) return;
  const cache = loadCache(options);
  cache[`summary:${itemKey}`] = {
    processedAt: new Date().toISOString(),
    cleanTitle,
    cleanSummary
  };
  saveCache(cache, options);
}

module.exports = {
  resolveCachePath,
  loadCache,
  saveCache,
  getCachedSource,
  setCachedSource,
  getCachedDocument,
  setCachedDocument,
  getCachedArticleSummary,
  setCachedArticleSummary
};
