const { loadConfig } = require('../../scripts/utils/config-loader');
const fs = require('fs');
const path = require('path');

module.exports = function() {
  const config = loadConfig();
  const place = (config.placeName || config.villageName || 'warboys').toLowerCase();
  const resolvedOutputDir = path.isAbsolute(config.outputDir || `src/briefings/${place}`)
    ? config.outputDir
    : path.join(__dirname, '..', '..', config.outputDir || `src/briefings/${place}`);

  if (!fs.existsSync(resolvedOutputDir)) return [];

  const files = fs.readdirSync(resolvedOutputDir).filter(f => f.endsWith('.md'));
  const schools = config.schools || [];

  const entries = [];
  for (const f of files) {
    const isoDate = f.replace('.md', '');
    const d = new Date(isoDate);
    const formattedDate = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : isoDate;

    for (const school of schools) {
      entries.push({
        isoDate,
        formattedDate,
        school,
        slug: school.slug,
        schoolName: school.name,
        schoolShort: school.shortName
      });
    }
  }
  return entries;
};
