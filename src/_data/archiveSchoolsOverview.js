const { loadConfig } = require('../../scripts/utils/config-loader');
const fs = require('fs');
const path = require('path');

module.exports = function() {
  const config = loadConfig();
  if (!config.isMultiSchool) return [];

  const place = (config.placeName || config.villageName || 'warboys').toLowerCase();
  const resolvedOutputDir = path.isAbsolute(config.outputDir || `src/briefings/${place}`)
    ? config.outputDir
    : path.join(__dirname, '..', '..', config.outputDir || `src/briefings/${place}`);

  if (!fs.existsSync(resolvedOutputDir)) return [];

  const files = fs.readdirSync(resolvedOutputDir).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const isoDate = f.replace('.md', '');
    const d = new Date(isoDate);
    const formattedDate = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : isoDate;
    return {
      isoDate,
      formattedDate,
      schools: config.schools
    };
  });
};
