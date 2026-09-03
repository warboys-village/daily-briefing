const fs = require('fs');
const path = require('path');

const CALENDAR_PATH = path.join(__dirname, '..', '..', 'src', '_data', 'events_calendar.json');

/**
 * Loads persistent events calendar from src/_data/events_calendar.json, filtering out past events.
 */
function loadCalendar(options = {}) {
  const { includePast = false, nowDate = new Date() } = options;
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
 * Saves and deduplicates events in src/_data/events_calendar.json, filtering out past events.
 * Newer occurrences of regular recurring events overwrite older ones.
 */
function saveCalendar(newEvents = [], options = {}) {
  const { nowDate = new Date() } = options;
  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);

  let existing = [];
  try {
    if (fs.existsSync(CALENDAR_PATH)) {
      const data = fs.readFileSync(CALENDAR_PATH, 'utf-8');
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

  const eventMap = new Map();

  const getDedupeKey = (evt) => {
    const normTitle = (evt.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (evt.isRegular) {
      return `regular_${normTitle.slice(0, 35)}`;
    }
    const isoDateStr = (evt.eventDate || evt.date || '').slice(0, 10);
    return `oneoff_${normTitle.slice(0, 35)}_${isoDateStr}`;
  };

  // Add existing valid events that are not in the past
  for (const item of existing) {
    if (isCurrentOrFuture(item)) {
      eventMap.set(getDedupeKey(item), item);
    }
  }

  // Overwrite/update with new events (incoming upcoming dates replace older recurring dates)
  for (const item of newEvents) {
    if (isCurrentOrFuture(item)) {
      const key = getDedupeKey(item);
      eventMap.set(key, {
        id: item.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: item.title.trim(),
        eventTime: item.eventTime || 'Upcoming',
        eventCategory: item.eventCategory || 'UPCOMING',
        isRegular: !!item.isRegular,
        venue: item.venue || 'Warboys Village Location',
        content: (item.content || item.title).trim(),
        url: item.url || 'https://fowl.org.uk/',
        date: item.date || nowDate.toISOString(),
        eventDate: item.eventDate || item.date || nowDate.toISOString(),
        category: 'Community Events',
        sourceId: item.sourceId || 'events',
        sourceName: item.sourceName || 'Community Source'
      });
    }
  }

  const combined = Array.from(eventMap.values())
    .sort((a, b) => new Date(a.eventDate || a.date || 0) - new Date(b.eventDate || b.date || 0));

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
