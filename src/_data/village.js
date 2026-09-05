const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadSchoolCalendar } = require('../../scripts/utils/school-calendar-store');

module.exports = function() {
  const config = loadConfig();
  if (Array.isArray(config.schools)) {
    for (const sc of config.schools) {
      const cal = loadSchoolCalendar(sc.slug || 'wpa', { includePast: true });
      if (cal && cal.length > 0) {
        sc.keyDates = cal.map(item => ({
          id: item.id,
          title: item.title,
          date: item.eventDate || item.date,
          time: item.dateDisplay ? (item.time && !item.dateDisplay.includes(item.time) ? `${item.dateDisplay} (${item.time})` : item.dateDisplay) : (item.time || item.eventDate),
          targetYears: item.targetYears || item.yearGroups || ['All Years'],
          details: item.notes || item.details || item.content || '',
          term: item.term || '',
          cancelled: item.cancelled || false
        }));
      }
    }
  }
  return config;
};
