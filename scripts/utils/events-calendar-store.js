const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config-loader');
const { deduplicateEventsSync } = require('./events-deduper');

function resolveCalendarPath(options = {}) {
  let targetDir;
  if (options.dataDir) {
    targetDir = path.isAbsolute(options.dataDir) ? options.dataDir : path.join(__dirname, '..', '..', options.dataDir);
    return path.join(targetDir, 'events_calendar.json');
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

  const candidate = path.join(targetDir, 'events_calendar.json');
  if (fs.existsSync(candidate)) return candidate;

  const legacyPath = path.join(__dirname, '..', '..', 'src', '_data', 'events_calendar.json');
  if (fs.existsSync(legacyPath)) return legacyPath;

  return candidate;
}

/**
 * Loads persistent events calendar from events_calendar.json, filtering out past events.
 */
function loadCalendar(options = {}) {
  const { includePast = false, nowDate = new Date() } = options;
  const calendarPath = resolveCalendarPath(options);
  let items = [];

  try {
    if (fs.existsSync(calendarPath)) {
      const data = fs.readFileSync(calendarPath, 'utf-8');
      items = JSON.parse(data) || [];
    }
  } catch (err) {
    console.warn('[EventsCalendarStore] Error loading calendar store:', err.message);
  }

  if (includePast) return items;

  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);

  return items.filter(evt => {
    const evtDateStr = evt.eventDate || evt.date;
    if (!evtDateStr) return false;
    const d = new Date(evtDateStr);
    return !isNaN(d.getTime()) && d >= todayStart;
  });
}

/**
 * Saves and deduplicates events in events_calendar.json, filtering out past events.
 * Newer occurrences of regular recurring events overwrite older ones.
 */
function saveCalendar(newEvents = [], options = {}) {
  const { nowDate = new Date() } = options;
  const calendarPath = resolveCalendarPath(options);
  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);

  let existing = [];
  try {
    if (fs.existsSync(calendarPath)) {
      const data = fs.readFileSync(calendarPath, 'utf-8');
      existing = JSON.parse(data) || [];
    }
  } catch (err) {
    console.warn('[EventsCalendarStore] Error loading calendar store:', err.message);
  }

  const isCurrentOrFuture = (evt) => {
    if (!evt || !evt.title) return false;
    const evtDateStr = evt.eventDate || evt.date;
    if (!evtDateStr) return false;
    const d = new Date(evtDateStr);
    return !isNaN(d.getTime()) && d >= todayStart;
  };

  const isVillageEvent = (evt) => {
    if (!evt || !evt.title) return false;
    if (evt.isWholeVillage) return true;
    if (evt.category === 'School Diary') return false;
    if (evt.school && !evt.isWholeVillage) return false;
    return true;
  };

  const currentExisting = existing.filter(isCurrentOrFuture).filter(isVillageEvent);
  const currentNew = newEvents.filter(isCurrentOrFuture).filter(isVillageEvent);

  const candidateList = [...currentExisting, ...currentNew];
  const merged = deduplicateEventsSync(candidateList)
    .filter(isCurrentOrFuture);

  try {
    const dir = path.dirname(calendarPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(calendarPath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[EventsCalendarStore] Error saving calendar store:', err.message);
  }

  return merged;
}

module.exports = {
  resolveCalendarPath,
  loadCalendar,
  saveCalendar
};
