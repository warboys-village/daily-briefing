const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadCalendar } = require('../../scripts/utils/events-calendar-store');

module.exports = function() {
  const config = loadConfig();
  return loadCalendar({ dataDir: config.dataDir });
};
