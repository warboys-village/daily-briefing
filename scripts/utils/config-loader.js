const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT_DIR = path.join(__dirname, '..', '..');

/**
 * Parses a YAML or JSON configuration file.
 */
function parseConfigFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    const parsed = yaml.load(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  }
  return JSON.parse(raw);
}

/**
 * Finds the first existing config file for a given place slug,
 * preferring YAML (`places/<place>.yaml`, `<place>.config.yaml`) before JSON (`<place>.config.json`).
 */
function findPlaceConfigCandidate(place) {
  if (!place) return null;
  const slug = String(place).trim().toLowerCase();
  const candidates = [
    path.join(ROOT_DIR, 'places', `${slug}.yaml`),
    path.join(ROOT_DIR, 'places', `${slug}.yml`),
    path.join(ROOT_DIR, `${slug}.config.yaml`),
    path.join(ROOT_DIR, `${slug}.config.yml`),
    path.join(ROOT_DIR, `${slug}.config.json`)
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

/**
 * Parses CLI arguments and environment variables to determine the target place/configuration.
 */
function resolveConfigPath(options = {}) {
  // 1. Explicit option passed in code
  if (options.configPath && fs.existsSync(options.configPath)) {
    return path.resolve(options.configPath);
  }
  if (options.place) {
    const candidate = findPlaceConfigCandidate(options.place);
    if (candidate) return candidate;
  }

  // 2. CLI arguments: --config <path> or -c <path>
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) {
      const p = path.resolve(args[i + 1]);
      if (fs.existsSync(p)) return p;
    }
    if ((args[i] === '--place' || args[i] === '-p') && args[i + 1]) {
      const candidate = findPlaceConfigCandidate(args[i + 1]);
      if (candidate) return candidate;
    }
  }

  // Positional argument if it looks like a place name (e.g. `node scripts/ingest.js warboys`)
  if (args[0] && !args[0].startsWith('-') && !args[0].endsWith('.js')) {
    const candidate = findPlaceConfigCandidate(args[0]);
    if (candidate) return candidate;
  }

  // 3. Environment variables: VILLAGE_CONFIG or VILLAGE_PLACE
  if (process.env.VILLAGE_CONFIG && fs.existsSync(process.env.VILLAGE_CONFIG)) {
    return path.resolve(process.env.VILLAGE_CONFIG);
  }
  if (process.env.VILLAGE_PLACE) {
    const candidate = findPlaceConfigCandidate(process.env.VILLAGE_PLACE);
    if (candidate) return candidate;
  }

  // 4. Default: warboys or village config (YAML preferred, then JSON)
  const defaultWarboys = findPlaceConfigCandidate('warboys');
  if (defaultWarboys) return defaultWarboys;

  const defaultVillage = findPlaceConfigCandidate('village');
  if (defaultVillage) return defaultVillage;

  throw new Error(`[ConfigLoader] Unable to locate configuration file. Looked for places/warboys.yaml, warboys.config.yaml, warboys.config.json, or village.config.json in ${ROOT_DIR}`);
}

/**
 * Resolves a school entry, loading from `schools/<slug>.yaml` or an explicit `config`/`configPath`
 * and merging any inline overrides.
 */
function resolveSchoolEntry(entry) {
  if (!entry) return null;
  let refPath = null;
  let overrides = {};

  if (typeof entry === 'string') {
    const slug = entry.trim().toLowerCase();
    const candidates = [
      path.isAbsolute(entry) ? entry : path.join(ROOT_DIR, entry),
      path.join(ROOT_DIR, 'schools', `${slug}.yaml`),
      path.join(ROOT_DIR, 'schools', `${slug}.yml`),
      path.join(ROOT_DIR, 'schools', `${slug}.json`)
    ];
    refPath = candidates.find(p => fs.existsSync(p)) || null;
  } else if (typeof entry === 'object') {
    overrides = entry;
    const explicitRef = entry.configPath || entry.config;
    if (explicitRef) {
      const resolved = path.isAbsolute(explicitRef) ? explicitRef : path.join(ROOT_DIR, explicitRef);
      if (fs.existsSync(resolved)) refPath = resolved;
    } else if (entry.slug) {
      const slug = String(entry.slug).trim().toLowerCase();
      const candidates = [
        path.join(ROOT_DIR, 'schools', `${slug}.yaml`),
        path.join(ROOT_DIR, 'schools', `${slug}.yml`)
      ];
      refPath = candidates.find(p => fs.existsSync(p)) || null;
    }
  }

  let loaded = {};
  if (refPath) {
    loaded = parseConfigFile(refPath);
  }

  const merged = { ...loaded, ...overrides };
  if (refPath) merged._configPath = refPath;
  if (merged.theme || merged.colorScheme) {
    merged.theme = merged.theme || merged.colorScheme;
    merged.colorScheme = merged.colorScheme || merged.theme;
  }
  return merged;
}

/**
 * Loads the active village/place configuration object (YAML or JSON).
 */
function loadConfig(options = {}) {
  const configPath = resolveConfigPath(options);
  try {
    const config = parseConfigFile(configPath);

    // Ensure placeName alias is synchronized with villageName
    config.placeName = config.placeName || config.villageName;
    config.villageName = config.villageName || config.placeName;

    // Normalize theme / colorScheme aliases
    if (config.theme || config.colorScheme) {
      config.theme = config.theme || config.colorScheme;
      config.colorScheme = config.colorScheme || config.theme;
    }

    // Attach resolved path
    config._configPath = configPath;

    // Resolve and normalize schools array and multi-school metadata
    if (Array.isArray(config.schools) && config.schools.length > 0) {
      config.schools = config.schools.map(resolveSchoolEntry).filter(Boolean);
      config.school = config.schools[0];
    } else if (config.school) {
      const resolvedSchool = resolveSchoolEntry(config.school);
      config.schools = resolvedSchool ? [resolvedSchool] : [];
      config.school = config.schools[0];
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
  getPlaceName,
  parseConfigFile,
  resolveSchoolEntry
};
