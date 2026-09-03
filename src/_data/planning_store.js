const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadPlanningStore } = require('../../scripts/utils/content-stores');

module.exports = function() {
  const config = loadConfig();
  return loadPlanningStore({ dataDir: config.dataDir });
};
