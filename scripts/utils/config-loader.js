const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');

/**
 * Parses CLI arguments and environment variables to determine the target place/configuration.
 */
function resolveConfigPath(options = {}) {
  // 1. Explicit option passed in code
  if (options.configPath && fs.existsSync(options.configPath)) {
    return path.resolve(options.configPath);
  }
  if (options.place) {
    const candidate = path.join(ROOT_DIR, `${options.place.toLowerCase()}.config.json`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 2. CLI arguments: --config <path> or -c <path>
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) {
      const p = path.resolve(args[i + 1]);
      if (fs.existsSync(p)) return p;
    }
    if ((args[i] === '--place' || args[i] === '-p') && args[i + 1]) {
      const candidate = path.join(ROOT_DIR, `${args[i + 1].toLowerCase()}.config.json`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // Positional argument if it looks like a place name (e.g. `node scripts/ingest.js warboys`)
  if (args[0] && !args[0].startsWith('-') && !args[0].endsWith('.js')) {
    const candidate = path.join(ROOT_DIR, `${args[0].toLowerCase()}.config.json`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 3. Environment variables: VILLAGE_CONFIG or VILLAGE_PLACE
  if (process.env.VILLAGE_CONFIG && fs.existsSync(process.env.VILLAGE_CONFIG)) {
    return path.resolve(process.env.VILLAGE_CONFIG);
  }
  if (process.env.VILLAGE_PLACE) {
    const candidate = path.join(ROOT_DIR, `${process.env.VILLAGE_PLACE.toLowerCase()}.config.json`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 4. Default: warboys.config.json or village.config.json
  const warboysPath = path.join(ROOT_DIR, 'warboys.config.json');
  if (fs.existsSync(warboysPath)) return warboysPath;

  const defaultVillagePath = path.join(ROOT_DIR, 'village.config.json');
  if (fs.existsSync(defaultVillagePath)) return defaultVillagePath;

  throw new Error(`[ConfigLoader] Unable to locate configuration file. Looked for warboys.config.json or village.config.json in ${ROOT_DIR}`);
}

/**
 * Loads the active village/place configuration object.
 */
function loadConfig(options = {}) {
  const configPath = resolveConfigPath(options);
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    
    // Ensure placeName alias is synchronized with villageName
    config.placeName = config.placeName || config.villageName;
    config.villageName = config.villageName || config.placeName;

    // Attach resolved path
    config._configPath = configPath;

    // Normalize schools array and multi-school metadata
    if (Array.isArray(config.schools) && config.schools.length > 0) {
      config.school = config.schools[0];
    } else if (config.school) {
      config.schools = [config.school];
    } else {
      config.schools = [];
      config.school = {
        enabled: false,
        name: `${config.placeName} School`,
        shortName: 'School',
        slug: 'school',
        navLabel: 'School'
      };
    }

    config.isMultiSchool = config.schools.length > 1;
    if (config.schools.length > 0) {
      config.schoolNavUrl = config.isMultiSchool ? '/schools/' : `/${config.schools[0].slug}/`;
      config.schoolNavLabel = config.isMultiSchool ? 'Schools' : (config.schools[0].navLabel || config.schools[0].shortName || 'School');
    }

    return config;
  } catch (err) {
    throw new Error(`[ConfigLoader] Failed to load configuration from ${configPath}: ${err.message}`);
  }
}

/**
 * Returns the place name of the currently active configuration.
 */
function getPlaceName(options = {}) {
  const cfg = loadConfig(options);
  return cfg.placeName || cfg.villageName;
}

module.exports = {
  loadConfig,
  resolveConfigPath,
  getPlaceName
};
