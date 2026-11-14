const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadSchoolCalendar } = require('../../scripts/utils/school-calendar-store');
const { loadSchoolAnnouncements } = require('../../scripts/utils/school-announcements-store');
const { loadNewsStore, loadGovernanceStore } = require('../../scripts/utils/content-stores');

module.exports = function() {
  const config = loadConfig();
  const allNews = loadNewsStore({ dataDir: config.dataDir });
  const allGovernance = loadGovernanceStore({ dataDir: config.dataDir });

  if (Array.isArray(config.schools)) {
    for (const sc of config.schools) {
      const slug = sc.slug || 'wpa';
      const cal = loadSchoolCalendar(slug, { includePast: true, dataDir: config.dataDir });
      if (cal && cal.length > 0) {
        sc.keyDates = cal.map(item => ({
          id: item.id,
          title: item.title,
          date: item.eventDate || item.date,
          time: item.dateDisplay ? (item.time && !item.dateDisplay.includes(item.time) ? `${item.dateDisplay} (${item.time})` : item.dateDisplay) : (item.time || item.eventDate),
          targetYears: item.targetYears || item.yearGroups || ['All Years'],
          yearGroups: item.yearGroups || item.targetYears || ['All Years'],
          details: item.notes || item.details || item.content || '',
          term: item.term || '',
          cancelled: item.cancelled || false,
          isNew: item.isNew || false,
          url: item.url || item.sourceUrl || '',
          relevance: item.relevance || 'school',
          expiresAt: item.expiresAt || null
        }));
      }

      const annStore = loadSchoolAnnouncements(slug, { dataDir: config.dataDir });
      if (annStore) {
        if (annStore.activeNewsletterUrl) sc.newsletterUrl = annStore.activeNewsletterUrl;
        if (annStore.newsletterTitle) sc.newsletterTitle = annStore.newsletterTitle;
        if (annStore.newsletterDate) sc.newsletterDate = annStore.newsletterDate;
        if (Array.isArray(annStore.announcements) && annStore.announcements.length > 0) {
          sc.announcements = annStore.announcements;
        }
      }

      // Collate school-specific news from news_store when dedicated announcements store is absent
      if (!sc.announcements || sc.announcements.length === 0) {
        const schoolNews = allNews.filter(n => n.school === slug || (sc.sourceId && n.sourceId === sc.sourceId));
        if (schoolNews.length > 0) {
          sc.announcements = schoolNews.map(n => ({
            id: n.id,
            title: n.title,
            date: (n.date || '').split('T')[0],
            content: n.summary || n.content || '',
            url: n.url || n.sourceUrl || '',
            targetYears: n.yearGroups || n.targetYears || ['All Years'],
            relevance: n.relevance || 'school'
          }));
        }
      }

      // Collate school-specific meeting minutes / governance items
      sc.meetingMinutes = allGovernance.filter(g => g.school === slug || (sc.sourceId && g.sourceId === sc.sourceId));
    }
  }
  return config;
};
