const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config-loader');

function resolveCalendarPath(options = {}) {
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

  const currentExisting = existing.filter(isCurrentOrFuture);
  const currentNew = newEvents.filter(isCurrentOrFuture);

  const eventMap = new Map();

  for (const evt of currentExisting) {
    const key = evt.isRegular
      ? `regular:${(evt.title || '').trim().toLowerCase()}`
      : `${(evt.eventDate || '').trim()}:${(evt.title || '').trim().toLowerCase()}`;
    eventMap.set(key, evt);
  }

  for (const evt of currentNew) {
    const key = evt.isRegular
      ? `regular:${(evt.title || '').trim().toLowerCase()}`
      : `${(evt.eventDate || '').trim()}:${(evt.title || '').trim().toLowerCase()}`;
    
    if (eventMap.has(key)) {
      eventMap.set(key, { ...eventMap.get(key), ...evt });
    } else {
      eventMap.set(key, evt);
    }
  }

  const merged = Array.from(eventMap.values())
    .filter(isCurrentOrFuture)
    .sort((a, b) => {
      const da = new Date(a.eventDate || a.date || 0);
      const db = new Date(b.eventDate || b.date || 0);
      return da - db;
    });

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
