const crypto = require('crypto');
const docCache = require('./processed-doc-cache');

/**
 * Creates a standardized capabilities object passed to all reusable collector modules.
 * Provides LLM summarization, structured extraction, image processing (with modelFamily selection),
 * content hashing, caching, and HTTP fetch helpers.
 */
function createCapabilities({ llmClient = null, cacheOptions = {}, placeConfig = {} } = {}) {
  const hash = (input) => {
    const str = typeof input === 'string' ? input : JSON.stringify(input || '');
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  };

  const fetchText = async (url, options = {}) => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0',
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(options.timeoutMs || 8000)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return res.text();
  };

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0',
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(options.timeoutMs || 8000)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return res.json();
  };

  const llm = {
    isAvailable: () => Boolean(llmClient && typeof llmClient.isMockMode === 'function' && !llmClient.isMockMode()),
    resolveModel: (opts = {}) => (llmClient && typeof llmClient.resolveModel === 'function')
      ? llmClient.resolveModel(opts)
      : (opts.model || placeConfig?.llmConfig?.model || 'gemini-2.5-flash'),

    summarize: async (text, options = {}) => {
      if (!llmClient || typeof llmClient.summarizeText !== 'function') return null;
      return llmClient.summarizeText(text, options);
    },

    extractStructured: async (rawText, metadata = {}, options = {}) => {
      if (!llmClient || typeof llmClient.extractStructuredItems !== 'function') return null;
      return llmClient.extractStructuredItems(rawText, metadata, options);
    },

    processImage: async (imageUrl, prompt, options = {}) => {
      if (!llmClient || typeof llmClient.extractImageText !== 'function') return null;
      return llmClient.extractImageText(imageUrl, prompt, options);
    },

    runStep: async (messages, tools = [], options = {}) => {
      if (!llmClient || typeof llmClient.runAgentStep !== 'function') {
        return { role: 'assistant', content: null, mockBriefing: true };
      }
      return llmClient.runAgentStep(messages, tools, options);
    }
  };

  const cache = {
    getSource: (url, ts, opts = {}) => docCache.getCachedSource(url, ts, { ...cacheOptions, ...opts }),
    setSource: (url, ts, data, meta = {}, opts = {}) => docCache.setCachedSource(url, ts, data, meta, { ...cacheOptions, ...opts }),
    getItem: (url, ts, opts = {}) => docCache.getCachedItem(url, ts, { ...cacheOptions, ...opts }),
    setItem: (url, ts, data, meta = {}, opts = {}) => docCache.setCachedItem(url, ts, data, meta, { ...cacheOptions, ...opts }),
    getImageText: (imgKey, opts = {}) => docCache.getCachedImageText(imgKey, { ...cacheOptions, ...opts }),
    setImageText: (imgKey, text, meta = {}, opts = {}) => docCache.setCachedImageText(imgKey, text, meta, { ...cacheOptions, ...opts })
  };

  return {
    llm,
    hash,
    cache,
    fetchText,
    fetchJson
  };
}

module.exports = { createCapabilities };
