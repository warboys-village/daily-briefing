/**
 * Event Deduplication Engine for Village Daily.
 * Normalizes event listings across sources, clusters by date,
 * and performs token similarity + LLM-assisted deduplication before publishing.
 */

function normalizeTitle(title = '') {
  return (title || '')
    .toLowerCase()
    .replace(/\s*\([^)]*(?:announced in|council minutes|wddc|fpc|wpa|source|diary)[^)]*\)/gi, '')
    .replace(/\s*-\s*[a-z0-9.-]+\.(?:co\.uk|com|org)$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokens(str = '') {
  const stopWords = new Set(['the', 'and', 'at', 'in', 'on', 'for', 'of', 'to', 'a', 'an', 'annual', 'village', 'community', 'event', '2026', '2027']);
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !stopWords.has(t));
}

function computeJaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function areDatesClose(dateStrA, dateStrB, maxDaysDiff = 1) {
  if (!dateStrA || !dateStrB) return false;
  const da = new Date(dateStrA.split('T')[0]);
  const db = new Date(dateStrB.split('T')[0]);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  const diffDays = Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= maxDaysDiff;
}

/**
 * Merges two duplicate events into a canonical event record.
 */
function mergeEventRecords(primary, secondary) {
  const cleanTitle = (primary.title.length <= secondary.title.length && !primary.title.includes('('))
    ? primary.title
    : secondary.title.replace(/\s*\([^)]*(?:announced in|council minutes|wddc)[^)]*\)/gi, '').trim();

  const longerContent = (primary.content || '').length >= (secondary.content || '').length
    ? primary.content
    : secondary.content;

  const bestVenue = primary.venue && primary.venue !== 'Warboys, PE28'
    ? primary.venue
    : (secondary.venue || primary.venue || 'Community Venue');

  const mergedSources = Array.from(new Set([
    ...(primary.mergedSources || [primary.sourceUrl || primary.url].filter(Boolean)),
    ...(secondary.mergedSources || [secondary.sourceUrl || secondary.url].filter(Boolean))
  ]));

  return {
    ...primary,
    title: cleanTitle || primary.title,
    venue: bestVenue,
    content: longerContent || primary.content,
    eventTime: primary.eventTime || secondary.eventTime || 'Upcoming',
    url: primary.url || secondary.url,
    sourceUrl: primary.sourceUrl || secondary.sourceUrl,
    isWholeVillage: Boolean(primary.isWholeVillage || secondary.isWholeVillage),
    mergedSources
  };
}

/**
 * Synchronous core deduplication using token overlap matching and recurrence updating.
 */
function deduplicateEventsSync(events = []) {
  if (!Array.isArray(events) || events.length === 0) return [];

  // 1. Separate regular recurring events from single scheduled events
  const regularEventsMap = new Map();
  const scheduledEvents = [];

  for (const evt of events) {
    if (!evt || !evt.title) continue;
    if (evt.isRegular) {
      const regKey = normalizeTitle(evt.title);
      const existing = regularEventsMap.get(regKey);
      if (!existing) {
        regularEventsMap.set(regKey, evt);
      } else {
        const dExisting = new Date(existing.eventDate || existing.date || 0);
        const dNew = new Date(evt.eventDate || evt.date || 0);
        if (dNew >= dExisting) {
          regularEventsMap.set(regKey, { ...existing, ...evt });
        }
      }
    } else {
      scheduledEvents.push(evt);
    }
  }

  // 2. Cluster scheduled events by date
  const dateBuckets = new Map();
  for (const evt of scheduledEvents) {
    const dStr = (evt.eventDate || evt.date || '').split('T')[0] || 'undated';
    if (!dateBuckets.has(dStr)) dateBuckets.set(dStr, []);
    dateBuckets.get(dStr).push(evt);
  }

  const deduplicatedScheduled = [];

  for (const [dateStr, bucket] of dateBuckets.entries()) {
    if (bucket.length <= 1) {
      deduplicatedScheduled.push(...bucket);
      continue;
    }

    const processed = [];
    for (let i = 0; i < bucket.length; i++) {
      const current = bucket[i];
      let merged = false;

      for (let j = 0; j < processed.length; j++) {
        const candidate = processed[j];
        const tokensA = getTokens(normalizeTitle(current.title));
        const tokensB = getTokens(normalizeTitle(candidate.title));
        const sim = computeJaccardSimilarity(tokensA, tokensB);

        // High-confidence match: auto-merge
        if (sim >= 0.50) {
          processed[j] = mergeEventRecords(candidate, current);
          merged = true;
          break;
        }
      }

      if (!merged) {
        processed.push(current);
      }
    }

    deduplicatedScheduled.push(...processed);
  }

  const allMerged = [
    ...Array.from(regularEventsMap.values()),
    ...deduplicatedScheduled
  ];

  return allMerged.sort((a, b) => {
    const da = new Date(a.eventDate || a.date || 0);
    const db = new Date(b.eventDate || b.date || 0);
    return da - db;
  });
}

/**
 * Full deduplication pipeline with optional LLM disambiguation for ambiguous matches.
 */
async function deduplicateEvents(events = [], options = {}) {
  const { llmClient = null } = options;
  if (!Array.isArray(events) || events.length === 0) return [];

  // First pass: token matching
  const baseMerged = deduplicateEventsSync(events);
  if (!llmClient || typeof llmClient.assessDuplicateEvents !== 'function') {
    return baseMerged;
  }

  // Second pass: assess remaining same-date pairs that have partial similarity (0.20 to 0.50) or matching venue
  const dateBuckets = new Map();
  for (const evt of baseMerged) {
    if (evt.isRegular) continue;
    const dStr = (evt.eventDate || evt.date || '').split('T')[0] || 'undated';
    if (!dateBuckets.has(dStr)) dateBuckets.set(dStr, []);
    dateBuckets.get(dStr).push(evt);
  }

  const finalScheduled = [];

  for (const [dateStr, bucket] of dateBuckets.entries()) {
    if (bucket.length <= 1) {
      finalScheduled.push(...bucket);
      continue;
    }

    const processed = [];
    for (let i = 0; i < bucket.length; i++) {
      const current = bucket[i];
      let merged = false;

      for (let j = 0; j < processed.length; j++) {
        const candidate = processed[j];
        const tokensA = getTokens(normalizeTitle(current.title));
        const tokensB = getTokens(normalizeTitle(candidate.title));
        const sim = computeJaccardSimilarity(tokensA, tokensB);

        const venueTokensA = getTokens(normalizeTitle(current.venue || ''));
        const venueTokensB = getTokens(normalizeTitle(candidate.venue || ''));
        const venueSim = computeJaccardSimilarity(venueTokensA, venueTokensB);

        const isAmbiguousCandidate = (sim >= 0.20 && sim < 0.50) || (venueSim >= 0.40);

        if (isAmbiguousCandidate) {
          try {
            const assessment = await llmClient.assessDuplicateEvents(candidate, current);
            if (assessment && assessment.isDuplicate) {
              processed[j] = {
                ...mergeEventRecords(candidate, current),
                title: assessment.canonicalTitle || candidate.title,
                venue: assessment.venue || candidate.venue,
                content: assessment.content || candidate.content
              };
              merged = true;
              break;
            }
          } catch (err) {
            console.warn('[EventsDeduper] LLM assessment error:', err.message);
          }
        }
      }

      if (!merged) {
        processed.push(current);
      }
    }

    finalScheduled.push(...processed);
  }

  const regularEvents = baseMerged.filter(e => e.isRegular);
  const result = [...regularEvents, ...finalScheduled];

  return result.sort((a, b) => {
    const da = new Date(a.eventDate || a.date || 0);
    const db = new Date(b.eventDate || b.date || 0);
    return da - db;
  });
}

module.exports = {
  normalizeTitle,
  computeJaccardSimilarity,
  computeTokenSimilarity: computeJaccardSimilarity,
  getTokens,
  extractTokens: getTokens,
  areDatesClose,
  mergeEventRecords,
  deduplicateEventsSync,
  deduplicateEvents
};
