const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadGovernanceStore } = require('../../scripts/utils/content-stores');

module.exports = function() {
  const config = loadConfig();
  return loadGovernanceStore({ dataDir: config.dataDir });
};
