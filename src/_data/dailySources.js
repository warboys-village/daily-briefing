const { loadConfig } = require('../../scripts/utils/config-loader');
const fs = require('fs');
const path = require('path');

module.exports = function() {
  const config = loadConfig();
  const resolvedDataDir = path.isAbsolute(config.dataDir || 'src/_data')
    ? config.dataDir
    : path.join(__dirname, '..', '..', config.dataDir || 'src/_data');
  const dir = path.join(resolvedDataDir, 'daily_sources');
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const list = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      list.push(JSON.parse(content));
    } catch (err) {
      console.warn(`[dailySources] Error loading ${f}:`, err.message);
    }
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
};
