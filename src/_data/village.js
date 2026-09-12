const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadSchoolCalendar } = require('../../scripts/utils/school-calendar-store');
const { loadSchoolAnnouncements } = require('../../scripts/utils/school-announcements-store');

module.exports = function() {
  const config = loadConfig();
  if (Array.isArray(config.schools)) {
    for (const sc of config.schools) {
      const cal = loadSchoolCalendar(sc.slug || 'wpa', { includePast: true, dataDir: config.dataDir });
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

      const annStore = loadSchoolAnnouncements(sc.slug || 'wpa', { dataDir: config.dataDir });
      if (annStore) {
        if (annStore.activeNewsletterUrl) sc.newsletterUrl = annStore.activeNewsletterUrl;
        if (annStore.newsletterTitle) sc.newsletterTitle = annStore.newsletterTitle;
        if (annStore.newsletterDate) sc.newsletterDate = annStore.newsletterDate;
        if (Array.isArray(annStore.announcements) && annStore.announcements.length > 0) {
          sc.announcements = annStore.announcements;
        }
      }
    }
  }
  return config;
};
