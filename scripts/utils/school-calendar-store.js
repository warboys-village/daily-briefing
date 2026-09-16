const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config-loader');

/**
 * Resolves the path to the persistent school calendar store file.
 */
function resolveSchoolCalendarPath(schoolSlug = 'wpa', options = {}) {
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

  const primary = path.join(targetDir, `${schoolSlug}_calendar.json`);
  return primary;
}

/**
 * Loads the active school calendar, optionally filtering out past events.
 */
function loadSchoolCalendar(schoolSlug = 'wpa', options = {}) {
  const { includePast = true, nowDate = new Date() } = options;
  const calPath = resolveSchoolCalendarPath(schoolSlug, options);
  const fallbackLegacy = path.join(__dirname, '..', '..', 'src', '_data', `${schoolSlug}_calendar.json`);

  let items = [];
  const candidate = fs.existsSync(calPath) ? calPath : (fs.existsSync(fallbackLegacy) ? fallbackLegacy : null);

  if (candidate) {
    try {
      const data = fs.readFileSync(candidate, 'utf-8');
      items = JSON.parse(data) || [];
    } catch (err) {
      console.warn(`[SchoolCalendarStore] Error loading calendar for ${schoolSlug}:`, err.message);
    }
  }

  if (includePast) return items;

  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);

  return items.filter(evt => {
    const dStr = evt.eventDate || evt.date;
    if (!dStr) return true;
    const d = new Date(dStr);
    return isNaN(d.getTime()) || d >= todayStart;
  });
}

/**
 * Normalizes title for deduplication matching.
 */
function normalizeEventTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether text or announcements declare an event cancelled.
 * Requires cancellation keywords to co-occur within the same sentence or clause as the distinctive event title.
 */
function isEventCancelled(eventTitle, notices = []) {
  if (!notices || notices.length === 0 || !eventTitle) return false;
  const normTitle = normalizeEventTitle(eventTitle);
  if (!normTitle) return false;

  const cancelKeywords = [
    'cancel', 'cancelled', 'canceled', 'cancellation',
    'postpone', 'postponed', 'called off',
    'will not take place', 'will not be taking place', 'rescheduled'
  ];

  const COMMON_SCHOOL_WORDS = new Set([
    'meet', 'meeting', 'meetings', 'the', 'and', 'for', 'with', 'session', 'sessions',
    'year', 'years', 'class', 'classes', 'afternoon', 'evening', 'morning',
    'day', 'days', 'term', 'school', 'academy', 'pupils', 'pupil', 'children', 'child',
    'parents', 'parent', 'carers', 'carer', 'teacher', 'teachers', 'staff',
    'autumn', 'spring', 'summer', 'update', 'updates',
    'information', 'reminder', 'reminders', 'notice', 'notices', 'important',
    'all', 'return', 'begins', 'ends', 'half', 'full', 'week', 'weeks',
    'time', 'times', 'date', 'dates', 'event', 'events',
    'booking', 'bookings', 'meal', 'meals', 'lunch', 'dinners', 'dinner', 'office', 'hall',
    'reception', 'eyfs', 'ks1', 'ks2'
  ]);

  const allTitleWords = normTitle.split(' ').filter(w => w.length > 2);
  const distinctTitleWords = allTitleWords.filter(w => !COMMON_SCHOOL_WORDS.has(w));

  // Build core key phrase excluding year markers (e.g. "meet the teacher - years 5 & 6" -> "meet the teacher")
  const phraseCandidate = normTitle
    .replace(/\b(?:years?|y[1-6]|eyfs|reception|ks[12]|\d+)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const text of notices) {
    if (!text || typeof text !== 'string') continue;
    // Split into sentences / clauses
    const sentences = text.split(/[.!?\n;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);

    for (const sentence of sentences) {
      const hasCancelWord = cancelKeywords.some(kw => sentence.includes(kw));
      if (!hasCancelWord) continue;

      // 1. If title has distinct non-common words (e.g. "bikeability", "caythorpe", "grafham"), match in sentence
      if (distinctTitleWords.length > 0) {
        const hasDistinctMatch = distinctTitleWords.some(w => sentence.includes(w));
        if (hasDistinctMatch) return true;
      }

      // 2. Compound key phrase match (e.g. "meet the teacher", "class photographs")
      if (phraseCandidate.length >= 8 && sentence.includes(phraseCandidate)) {
        return true;
      }

      // 3. Full normalized title in sentence
      if (sentence.includes(normTitle)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Merges incoming events from a newsletter into the persistent calendar.
 * - Updates existing events matching by (eventDate, title).
 * - Preserves future events from previous newsletters that have not been cancelled.
 * - Detects cancellations from notices.
 */
function saveSchoolCalendar(schoolSlug = 'wpa', incomingEvents = [], options = {}) {
  const {
    nowDate = new Date(),
    cancellationNotices = [],
    includePast = true
  } = options;

  const existing = loadSchoolCalendar(schoolSlug, { includePast: true, ...options });
  const eventMap = new Map();

  // 1. Index existing events
  for (const evt of existing) {
    const key = `${(evt.eventDate || '').trim()}:${normalizeEventTitle(evt.title)}`;
    eventMap.set(key, { ...evt });
  }

  // 2. Process incoming events
  for (const inc of incomingEvents) {
    const key = `${(inc.eventDate || '').trim()}:${normalizeEventTitle(inc.title)}`;
    if (eventMap.has(key)) {
      const prev = eventMap.get(key);
      const isExplicitlyCancelled = inc.cancelled === true;
      const mergedEvt = {
        ...prev,
        ...inc,
        yearGroups: inc.yearGroups || inc.targetYears || prev.yearGroups,
        targetYears: inc.targetYears || inc.yearGroups || prev.targetYears,
        cancelled: isExplicitlyCancelled
      };
      if (!isExplicitlyCancelled && mergedEvt.status === 'CANCELLED') {
        delete mergedEvt.status;
      }
      eventMap.set(key, mergedEvt);
    } else {
      eventMap.set(key, {
        ...inc,
        yearGroups: inc.yearGroups || inc.targetYears || ['All Years'],
        targetYears: inc.targetYears || inc.yearGroups || ['All Years'],
        cancelled: inc.cancelled || false
      });
    }
  }

  // 3. Check for cancellations on all retained events
  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);

  const merged = Array.from(eventMap.values()).map(evt => {
    const isCancelledByNotice = isEventCancelled(evt.title, cancellationNotices);
    const titleIndicatesCancelled = (evt.title || '').toLowerCase().includes('cancelled');
    const isCancelled = isCancelledByNotice || titleIndicatesCancelled || (evt.cancelled && cancellationNotices.length === 0);

    if (isCancelled) {
      const notes = evt.notes || '';
      return {
        ...evt,
        cancelled: true,
        status: 'CANCELLED',
        notes: notes.startsWith('[CANCELLED]') ? notes : `[CANCELLED] ${notes}`.trim()
      };
    } else {
      const cleanedNotes = (evt.notes || '').replace(/^\[CANCELLED\]\s*/i, '').trim();
      const cleaned = {
        ...evt,
        cancelled: false,
        notes: cleanedNotes
      };
      if (cleaned.status === 'CANCELLED') {
        delete cleaned.status;
      }
      return cleaned;
    }
  });

  // 4. Sort chronologically
  merged.sort((a, b) => {
    const da = new Date(a.eventDate || a.date || 0);
    const db = new Date(b.eventDate || b.date || 0);
    return da - db;
  });

  // 5. Persist to place directory and root _data/wpa_calendar.json
  const calPath = resolveSchoolCalendarPath(schoolSlug, options);
  const rootPath = path.join(__dirname, '..', '..', 'src', '_data', `${schoolSlug}_calendar.json`);

  const paths = options.dataDir ? [calPath] : [calPath, rootPath];
  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[SchoolCalendarStore] Error saving calendar to ${p}:`, err.message);
    }
  }

  return merged;
}

module.exports = {
  resolveSchoolCalendarPath,
  loadSchoolCalendar,
  saveSchoolCalendar,
  isEventCancelled,
  normalizeEventTitle
};
