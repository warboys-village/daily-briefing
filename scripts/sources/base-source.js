const { loadConfig } = require('../utils/config-loader');

/**
 * Abstract Base Source interface for Village Daily modular extractors.
 * Supports declared requirements, two-stage discovery/analysis, and LLM access.
 */
class BaseSource {
  constructor(config = {}, context = null) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.config = config;

    // Fall back to active village config if context is omitted (e.g. in tests)
    this.context = context || {};
    if (!this.context.villageConfig) {
      try {
        this.context.villageConfig = loadConfig();
      } catch (e) {
        this.context.villageConfig = {};
      }
    }

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
   * Routine 2: Analyse sources.
   * Takes only uncached/updated sources, executes document download/parsing,
   * evaluates relevance with placeName/county and LLM, and produces categorized output.
   * @param {Array<Object>} sourcesToAnalyse
   * @param {Object} options
   * @returns {Promise<{events?: Array, news?: Array, governance?: Array, planning?: Array}>}
   */
  async analyseSources(sourcesToAnalyse = [], options = {}) {
    throw new Error(`analyseSources() must be implemented by subclass ${this.constructor.name}`);
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
