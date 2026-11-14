const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadGovernanceStore } = require('../../scripts/utils/content-stores');

module.exports = function() {
  const config = loadConfig();
  return loadGovernanceStore({ dataDir: config.dataDir }).filter(item => {
    if (item.relevance === 'school') return false;
    if (item.relevance === 'place' || item.isWholeVillage) return true;
    if (item.school || item.isSchoolSource) return false;
    return true;
  });
};
