const fs = require('fs');
const path = require('path');

const CALENDAR_PATH = path.join(__dirname, '..', '..', 'src', '_data', 'events_calendar.json');

/**
 * Loads persistent events calendar from src/_data/events_calendar.json, filtering out past events.
 */
function loadCalendar(options = {}) {
  const { includePast = false } = options;
  let items = [];

  try {
    if (fs.existsSync(CALENDAR_PATH)) {
      const data = fs.readFileSync(CALENDAR_PATH, 'utf-8');
      items = JSON.parse(data) || [];
    }
  } catch (err) {
    console.warn('[EventsCalendarStore] Error loading calendar store:', err.message);
  }

  if (includePast) return items;

  // Filter out past events (keep current/today and future events, or regular recurring events)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return items.filter(evt => {
    if (evt.isRegular) return true;
    const evtDateStr = evt.eventDate || evt.date;
    if (!evtDateStr) return false;
    const d = new Date(evtDateStr);
    return !isNaN(d.getTime()) && d >= todayStart;
  });
}

/**
 * Saves and deduplicates events in src/_data/events_calendar.json, filtering out past events.
 */
function saveCalendar(newEvents = []) {
  const existing = loadCalendar({ includePast: false });
  const seen = new Set();
  const combined = [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const addEvent = (evt) => {
    if (!evt || !evt.title) return;
    if (!evt.isRegular) {
      const evtDateStr = evt.eventDate || evt.date;
      if (evtDateStr) {
        const d = new Date(evtDateStr);
        if (!isNaN(d.getTime()) && d < todayStart) return; // Skip past event
      }
    }

    const key = `${evt.title.trim().toLowerCase()}_${evt.eventDate || evt.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(evt);
    }
  };

  for (const item of existing) addEvent(item);
  for (const item of newEvents) addEvent(item);

  // Sort events by eventDate ascending
  combined.sort((a, b) => new Date(a.eventDate || a.date || 0) - new Date(b.eventDate || b.date || 0));

  try {
    fs.mkdirSync(path.dirname(CALENDAR_PATH), { recursive: true });
    fs.writeFileSync(CALENDAR_PATH, JSON.stringify(combined, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[EventsCalendarStore] Error saving calendar store:', err.message);
  }

  return combined;
}

module.exports = {
  loadCalendar,
  saveCalendar,
  CALENDAR_PATH
};
