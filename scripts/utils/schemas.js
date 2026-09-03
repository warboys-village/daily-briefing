/**
 * Schema definitions and validation for standard Village Daily categorized outputs.
 * Supported categories: events, news, governance, planning.
 */

const REQUIRED_FIELDS = {
  events: ['id', 'title', 'eventDate', 'url'],
  news: ['id', 'title', 'url', 'date'],
  governance: ['id', 'title', 'meetingTitle', 'meetingDate', 'url'],
  planning: ['id', 'reference', 'address', 'proposal', 'status', 'url']
};

/**
 * Validates and normalizes a single item against its category schema.
 * Attaches source provenance, timestamps, and school/yearGroup metadata when relevant.
 */
function validateSingleItem(category, item, sourceMeta = {}) {
  if (!item || typeof item !== 'object') {
    throw new Error(`[SchemaValidator] Invalid item in category '${category}': item must be an object`);
  }

  const required = REQUIRED_FIELDS[category];
  if (!required) {
    throw new Error(`[SchemaValidator] Unknown category '${category}'`);
  }

  for (const field of required) {
    if (!item[field]) {
      throw new Error(`[SchemaValidator] Item in category '${category}' missing required field '${field}': ${JSON.stringify(item)}`);
    }
  }

  // Normalize provenance & timestamps
  const normalized = { ...item };
  normalized.sourceId = normalized.sourceId || sourceMeta.id || 'source';
  normalized.sourceName = normalized.sourceName || sourceMeta.name || 'Local Source';
  normalized.sourceUrl = normalized.sourceUrl || normalized.url || sourceMeta.url || '';
  
  // Normalize timestamp
  const rawDate = normalized.timestamp || normalized.date || normalized.meetingDate || normalized.eventDate || new Date().toISOString();
  normalized.timestamp = new Date(rawDate).toISOString();

  // Attach school and school years metadata if present or from school module
  if (normalized.school || sourceMeta.schoolSlug || (sourceMeta.type && sourceMeta.type.includes('school'))) {
    normalized.school = normalized.school || sourceMeta.schoolSlug || 'wpa';
    normalized.schoolName = normalized.schoolName || sourceMeta.schoolName || sourceMeta.name || 'School';
    normalized.yearGroups = Array.isArray(normalized.yearGroups) && normalized.yearGroups.length > 0
      ? normalized.yearGroups
      : ['All Years'];
  }

  // Category specific normalizations
  if (category === 'events') {
    normalized.isRegular = Boolean(normalized.isRegular);
    normalized.eventTime = normalized.eventTime || 'Upcoming';
    normalized.category = normalized.category || 'Community Events';
  } else if (category === 'news') {
    normalized.summary = (normalized.summary || normalized.content || normalized.title).trim();
    normalized.category = normalized.category || 'Village News';
  } else if (category === 'governance') {
    normalized.summary = (normalized.summary || normalized.content || normalized.title).trim();
    normalized.priority = normalized.priority || 'STANDARD';
    normalized.category = normalized.category || 'Village News & Governance';
  } else if (category === 'planning') {
    normalized.statusCategory = normalized.statusCategory || 'UPDATED';
    normalized.category = normalized.category || 'Planning Applications';
  }

  return normalized;
}

/**
 * Validates a complete categorized output object: { events: [], news: [], governance: [], planning: [] }
 * Returns clean, validated categorized lists.
 */
function validateCategorizedOutput(categorized = {}, sourceMeta = {}) {
  const result = {
    events: [],
    news: [],
    governance: [],
    planning: []
  };

  for (const cat of ['events', 'news', 'governance', 'planning']) {
    const list = categorized[cat];
    if (Array.isArray(list)) {
      for (const rawItem of list) {
        try {
          const validated = validateSingleItem(cat, rawItem, sourceMeta);
          result[cat].push(validated);
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
  validateSingleItem,
  validateCategorizedOutput
};
