const { loadConfig } = require('../../scripts/utils/config-loader');
const { loadNewsStore } = require('../../scripts/utils/content-stores');

module.exports = function() {
  const config = loadConfig();
  return loadNewsStore({ dataDir: config.dataDir });
};
