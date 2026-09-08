const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadCalendar } = require('../../scripts/utils/events-calendar-store');

module.exports = function() {
  const config = loadConfig();
  const allEvents = loadCalendar({ dataDir: config.dataDir });
  return allEvents.filter(e => {
    if (e.isWholeVillage) return true;
    if (e.category === 'School Diary') return false;
    if (e.school) return false;
    return true;
  });
};
