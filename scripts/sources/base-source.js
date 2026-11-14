const { loadConfig } = require('../utils/config-loader');
const { createCapabilities } = require('../utils/capabilities');

/**
 * Abstract Base Source interface for Village Daily modular extractors.
 * Supports declared requirements, two-stage discovery/analysis, standard capabilities, and LLM access.
 */
class BaseSource {
  constructor(config = {}, context = null) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    // Support input parameters either at top-level or nested under config.params (YAML style)
    this.params = { ...(config.params || {}) };
    this.config = { ...this.params, ...config };

    // Fall back to active village config if context is omitted (e.g. in tests)
    this.context = context || {};
    if (!this.context.villageConfig) {
      try {
        this.context.villageConfig = loadConfig();
      } catch (e) {
        this.context.villageConfig = {};
      }
    }

    // Standard capabilities injected into every reusable collector module
    this.capabilities = this.context.capabilities || createCapabilities({
      llmClient: this.context.llmClient || null,
      placeConfig: this.context.villageConfig
    });

    this.validateRequirements();
  }

  /**
   * Declare required inputs for this module.
   * Subclasses override this: e.g. return ['placeName', 'county', 'url'];
   * @returns {Array<string>}
   */
  static get requiredInputs() {
    return [];
  }

  /**
   * Validates that all declared inputs exist in the module's config or global place configuration.
   * If any requirement is missing, throws an error to halt the build.
   */
  validateRequirements() {
    const required = this.constructor.requiredInputs || [];
    const villageCfg = (this.context && this.context.villageConfig) || {};
    const merged = {
      placeName: this.config.placeName || villageCfg.placeName || villageCfg.villageName,
      county: this.config.county || villageCfg.county,
      districtCouncil: this.config.districtCouncil || villageCfg.districtCouncil,
      parishCouncil: this.config.parishCouncil || villageCfg.parishCouncil,
      school: this.config.school || villageCfg.school,
      ...this.params,
      ...this.config
    };

    const missing = [];
    for (const req of required) {
      if (merged[req] === undefined || merged[req] === null || merged[req] === '') {
        missing.push(req);
      }
    }

    if (missing.length > 0) {
      throw new Error(`[ConfigurationError] Source '${this.id || this.name}' (${this.constructor.name}) missing required input(s): [${missing.join(', ')}]. Build halted.`);
    }
  }

  /**
   * Routine 1: Establish source list.
   * Discovers and enumerates available source items/URLs without heavy document parsing or LLM calls.
   * @param {Object} options
   * @returns {Promise<Array<{sourceUrl: string, sourceId?: string, timestamp?: string, metadata?: Object}>>}
   */
  async establishSources(options = {}) {
    throw new Error(`establishSources() must be implemented by subclass ${this.constructor.name}`);
  }

  /**
   * Routine 2: Analyse a single uncached source item through the 4-step pipeline:
   * 1. Gather content
   * 2. Extract text from relevant images (cached)
   * 3. Categorise & filter for place relevance
   * 4. Summarise with LLM / structured extraction
   * @param {Object} itemDescriptor
   * @param {Object} options
   * @returns {Promise<{events?: Array, news?: Array, governance?: Array, planning?: Array}>}
   */
  async processSingleItem(itemDescriptor, options = {}) {
    return { events: [], news: [], governance: [], planning: [] };
  }

  /**
   * Batch analysis helper: iterates over items calling processSingleItem,
   * aggregating results cleanly.
   * @param {Array<Object>} sourcesToAnalyse
   * @param {Object} options
   * @returns {Promise<{events?: Array, news?: Array, governance?: Array, planning?: Array}>}
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    const combined = { events: [], news: [], governance: [], planning: [] };
    for (const src of sourcesToAnalyse) {
      const res = await this.processSingleItem(src, options);
      if (res) {
        for (const cat of ['events', 'news', 'governance', 'meetingMinutes', 'planning']) {
          const targetCat = cat === 'meetingMinutes' ? 'governance' : cat;
          if (Array.isArray(res[cat])) {
            combined[targetCat].push(...res[cat]);
          }
        }
      }
    }
    return combined;
  }

  /**
   * Backward-compatibility fallback: runs establishSources then analyseSources, returning flat items array.
   */
  async extract(options = {}) {
    const sources = await this.establishSources(options);
    const categorized = await this.analyseSources(sources, options);
    const all = [
      ...(categorized.events || []),
      ...(categorized.news || []),
      ...(categorized.governance || []),
      ...(categorized.planning || [])
    ];
    return all;
  }

  /**
   * Standard capability helpers for reusable collector modules.
   * Modules can pass { modelFamily: 'flash' | 'hydrogen' | 'pro' | ... } to override the default model.
   */
  summarize(text, options = {}) {
    return this.capabilities.llm.summarize(text, options);
  }

  processImage(imageUrl, prompt, options = {}) {
    return this.capabilities.llm.processImage(imageUrl, prompt, options);
  }

  extractStructured(rawText, metadata = {}, options = {}) {
    return this.capabilities.llm.extractStructured(rawText, metadata, options);
  }

  computeHash(data) {
    return this.capabilities.hash(data);
  }

  /**
   * Access to LLM client passed via context.
   */
  get llm() {
    return this.context && this.context.llmClient;
  }

  /**
   * Place name helper from context.
   */
  get placeName() {
    const v = (this.context && this.context.villageConfig) || {};
    return this.config.placeName || v.placeName || v.villageName || 'Warboys';
  }

  /**
   * County helper from context.
   */
  get county() {
    const v = (this.context && this.context.villageConfig) || {};
    return this.config.county || v.county || 'Cambridgeshire';
  }
}

module.exports = BaseSource;
