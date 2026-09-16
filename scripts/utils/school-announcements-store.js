const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config-loader');

/**
 * Resolves the path to the persistent school announcements store file.
 */
function resolveSchoolAnnouncementsPath(schoolSlug = 'wpa', options = {}) {
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

  return path.join(targetDir, `${schoolSlug}_announcements.json`);
}

/**
 * Loads the active school announcements.
 */
function loadSchoolAnnouncements(schoolSlug = 'wpa', options = {}) {
  const annPath = resolveSchoolAnnouncementsPath(schoolSlug, options);
  const fallbackLegacy = path.join(__dirname, '..', '..', 'src', '_data', `${schoolSlug}_announcements.json`);

  const candidate = fs.existsSync(annPath) ? annPath : (fs.existsSync(fallbackLegacy) ? fallbackLegacy : null);

  if (candidate) {
    try {
      const data = fs.readFileSync(candidate, 'utf-8');
      return JSON.parse(data) || null;
    } catch (err) {
      console.warn(`[SchoolAnnouncementsStore] Error loading announcements for ${schoolSlug}:`, err.message);
    }
  }

  return null;
}

/**
 * Saves school announcements and active newsletter metadata to persistent store.
 */
function saveSchoolAnnouncements(schoolSlug = 'wpa', data = {}, options = {}) {
  const annPath = resolveSchoolAnnouncementsPath(schoolSlug, options);
  const rootPath = path.join(__dirname, '..', '..', 'src', '_data', `${schoolSlug}_announcements.json`);

  const payload = {
    schoolSlug,
    activeNewsletterUrl: data.activeNewsletterUrl || data.newsletterUrl || '',
    newsletterTitle: data.newsletterTitle || data.title || '',
    newsletterDate: data.newsletterDate || data.date || '',
    updatedAt: new Date().toISOString(),
    announcements: Array.isArray(data.announcements) ? data.announcements : []
  };

  const paths = options.dataDir ? [annPath] : [annPath, rootPath];
  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[SchoolAnnouncementsStore] Error saving announcements to ${p}:`, err.message);
    }
  }

  return payload;
}

module.exports = {
  resolveSchoolAnnouncementsPath,
  loadSchoolAnnouncements,
  saveSchoolAnnouncements
};
