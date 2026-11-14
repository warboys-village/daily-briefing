const crypto = require('crypto');

/**
 * Schema definitions and validation for standard Village Daily categorized outputs.
 * Supported categories: events, news, governance (alias: meetingMinutes), planning.
 */

const REQUIRED_FIELDS = {
  events: ['id', 'title', 'eventDate', 'url'],
  news: ['id', 'title', 'url', 'date'],
  governance: ['id', 'title', 'meetingTitle', 'meetingDate', 'url'],
  meetingMinutes: ['id', 'title', 'meetingTitle', 'meetingDate', 'url'],
  planning: ['id', 'reference', 'address', 'proposal', 'status', 'url']
};

/**
 * Computes a deterministic SHA-256 hash for a source/item payload.
 */
function computeSourceHash(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input || '');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

/**
 * Computes default ISO expiry timestamp for an item based on its category and dates.
 */
function computeDefaultExpiresAt(category, item, nowDate = new Date()) {
  if (item.expiresAt) {
    const explicit = new Date(item.expiresAt);
    if (!isNaN(explicit.getTime())) return explicit.toISOString();
  }

  if (typeof item.ttlDays === 'number' && item.ttlDays > 0) {
    const base = new Date(item.date || item.timestamp || nowDate);
    const d = isNaN(base.getTime()) ? new Date(nowDate) : base;
    d.setDate(d.getDate() + item.ttlDays);
    return d.toISOString();
  }

  if (category === 'events') {
    const evtDate = new Date(item.eventDate || item.date || nowDate);
    if (!isNaN(evtDate.getTime())) {
      evtDate.setUTCHours(23, 59, 59, 999);
      return evtDate.toISOString();
    }
  }

  const base = new Date(item.date || item.meetingDate || item.timestamp || nowDate);
  const d = isNaN(base.getTime()) ? new Date(nowDate) : base;

  if (category === 'news') {
    d.setDate(d.getDate() + 21);
  } else if (category === 'governance' || category === 'meetingMinutes') {
    d.setDate(d.getDate() + 60);
  } else if (category === 'planning') {
    const days = item.statusCategory === 'DECIDED' ? 30 : 90;
    d.setDate(d.getDate() + days);
  } else {
    d.setDate(d.getDate() + 30);
  }
  return d.toISOString();
}

/**
 * Checks whether an item has passed its explicit expiresAt timestamp.
 */
function isItemExpired(item, nowDate = new Date()) {
  if (!item || !item.expiresAt) return false;
  const exp = new Date(item.expiresAt);
  if (isNaN(exp.getTime())) return false;
  return exp.getTime() < new Date(nowDate).getTime();
}

/**
 * Validates and normalizes a single item against its category schema.
 * Attaches source provenance, hash, expiry, timestamps, and school/yearGroup metadata.
 */
function validateSingleItem(category, item, sourceMeta = {}) {
  if (!item || typeof item !== 'object') {
    throw new Error(`[SchemaValidator] Invalid item in category '${category}': item must be an object`);
  }

  const canonicalCategory = category === 'meetingMinutes' ? 'governance' : category;
  const required = REQUIRED_FIELDS[canonicalCategory];
  if (!required) {
    throw new Error(`[SchemaValidator] Unknown category '${category}'`);
  }

  // Normalize provenance & deterministic ID before required-field validation
  const normalized = { ...item };
  normalized.sourceId = normalized.sourceId || sourceMeta.id || 'source';
  normalized.sourceName = normalized.sourceName || sourceMeta.name || 'Local Source';
  normalized.url = normalized.url || normalized.sourceUrl || sourceMeta.url || '';
  normalized.sourceUrl = normalized.sourceUrl || normalized.url || sourceMeta.url || '';

  if (!normalized.id) {
    const idSeed = {
      category: canonicalCategory,
      sourceId: normalized.sourceId,
      url: normalized.url || normalized.sourceUrl || '',
      reference: normalized.reference || '',
      date: normalized.eventDate || normalized.meetingDate || normalized.date || '',
      title: (normalized.title || normalized.proposal || '').trim().toLowerCase()
    };
    normalized.id = `${canonicalCategory}-${computeSourceHash(idSeed).slice(0, 12)}`;
  }

  for (const field of required) {
    if (!normalized[field]) {
      throw new Error(`[SchemaValidator] Item in category '${category}' missing required field '${field}': ${JSON.stringify(item)}`);
    }
  }

  // Attach deterministic sourceHash for deduplication & skip-reprocessing
  normalized.sourceHash = normalized.sourceHash || computeSourceHash({
    sourceUrl: normalized.sourceUrl,
    url: normalized.url,
    title: normalized.title,
    content: normalized.content || normalized.summary || normalized.proposal || '',
    reference: normalized.reference || '',
    eventDate: normalized.eventDate || '',
    meetingDate: normalized.meetingDate || ''
  });

  // Normalize timestamp & expiry
  const rawDate = normalized.timestamp || normalized.date || normalized.meetingDate || normalized.eventDate || new Date().toISOString();
  normalized.timestamp = new Date(rawDate).toISOString();
  normalized.expiresAt = computeDefaultExpiresAt(canonicalCategory, normalized);

  // Attach school and school years metadata if present or from school module
  const isSchool = Boolean(
    normalized.isSchoolSource ||
    normalized.school ||
    sourceMeta.schoolSlug ||
    (sourceMeta.type && sourceMeta.type.includes('school')) ||
    (sourceMeta.id && (sourceMeta.id.includes('school') || sourceMeta.id.includes('wpa') || sourceMeta.id.includes('college')))
  );

  if (isSchool) {
    normalized.isSchoolSource = true;
    normalized.school = normalized.school || sourceMeta.schoolSlug || 'wpa';
    normalized.schoolName = normalized.schoolName || sourceMeta.schoolName || sourceMeta.name || 'School';
    normalized.yearGroups = Array.isArray(normalized.yearGroups) && normalized.yearGroups.length > 0
      ? normalized.yearGroups
      : ['All Years'];
    const placeRelevant = Boolean(
      normalized.relevance === 'place' ||
      normalized.isWholeVillage ||
      normalized.wholePlaceRelevance ||
      normalized.wholeVillage
    );
    normalized.isWholeVillage = placeRelevant;
    normalized.relevance = placeRelevant ? 'place' : 'school';
    if (normalized.wholePlaceReason) {
      normalized.wholePlaceReason = String(normalized.wholePlaceReason).trim();
    }
  } else {
    normalized.isSchoolSource = false;
    normalized.isWholeVillage = true;
    normalized.relevance = 'place';
  }

  // Category specific normalizations
  if (canonicalCategory === 'events') {
    normalized.isRegular = Boolean(normalized.isRegular);
    normalized.eventTime = normalized.eventTime || 'Upcoming';
    normalized.category = normalized.category || 'Community Events';
  } else if (canonicalCategory === 'news') {
    normalized.summary = (normalized.summary || normalized.content || normalized.title).trim();
    normalized.category = normalized.category || 'Village News';
  } else if (canonicalCategory === 'governance') {
    normalized.summary = (normalized.summary || normalized.content || normalized.title).trim();
    normalized.priority = normalized.priority || 'STANDARD';
    normalized.category = normalized.category || 'Village News & Governance';
  } else if (canonicalCategory === 'planning') {
    normalized.statusCategory = normalized.statusCategory || 'UPDATED';
    normalized.category = normalized.category || 'Planning Applications';
  }

  return normalized;
}

/**
 * Validates a complete categorized output object:
 * { events: [], news: [], governance: [], meetingMinutes: [], planning: [] }
 * Returns clean, validated categorized lists (merging meetingMinutes into governance).
 */
function validateCategorizedOutput(categorized = {}, sourceMeta = {}) {
  const result = {
    events: [],
    news: [],
    governance: [],
    planning: []
  };

  for (const cat of ['events', 'news', 'governance', 'meetingMinutes', 'planning']) {
    const targetCat = cat === 'meetingMinutes' ? 'governance' : cat;
    const list = categorized[cat];
    if (Array.isArray(list)) {
      for (const rawItem of list) {
        try {
          const validated = validateSingleItem(targetCat, rawItem, sourceMeta);
          result[targetCat].push(validated);
        } catch (err) {
          console.warn(`[SchemaValidator] Warning: Dropping invalid ${cat} item from ${sourceMeta.name || 'source'}: ${err.message}`);
        }
      }
    }
  }

  return result;
}

module.exports = {
  REQUIRED_FIELDS,
  computeSourceHash,
  computeDefaultExpiresAt,
  isItemExpired,
  validateSingleItem,
  validateCategorizedOutput
};
