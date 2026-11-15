const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadNewsStore } = require('../../scripts/utils/content-stores');

module.exports = function() {
  const config = loadConfig();
  const items = loadNewsStore({ dataDir: config.dataDir });
  return items.filter(n => {
    if (n.relevance === 'school') return false;
    if ((n.isSchoolSource || n.school) && !n.isWholeVillage && n.relevance !== 'place') return false;
    return true;
  });
};
