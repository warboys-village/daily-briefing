const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./utils/config-loader');
const LlmClient = require('./agent/llm-client');
const { validateCategorizedOutput } = require('./utils/schemas');
const { getCachedSource, setCachedSource } = require('./utils/processed-doc-cache');

const RssSource = require('./sources/rss-source');
const HdcPlanningSource = require('./sources/hdc-planning-source');
const ParishCouncilSource = require('./sources/parish-council-source');
const EventsSource = require('./sources/events-source');
const VillageSceneSource = require('./sources/village-scene-source');
const FowlSource = require('./sources/fowl-source');
const CountyCouncilSource = require('./sources/county-council-source');
const WpaSource = require('./sources/wpa-source');
const TownCouncilSource = require('./sources/town-council-source');
const RamseyNewsletterSource = require('./sources/ramsey-newsletter-source');
const LibraryEventsSource = require('./sources/library-events-source');
const AbbeyCollegeSource = require('./sources/abbey-college-source');

const {
  updateNewsStore,
  updatePlanningStore,
  updateGovernanceStore,
  saveCalendar
} = require('./utils/content-stores');
const BriefingComposer = require('./agent/briefing-composer');

async function runIngest() {
  const isMock = process.argv.includes('--mock');
  const villageConfig = loadConfig();
  const placeName = villageConfig.placeName || villageConfig.villageName;
  const now = new Date();
  const isoDate = now.toISOString().split('T')[0];
  const formattedDateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`[Ingest Pipeline] Starting modular ingestion for ${placeName} (${isoDate})...`);
  console.log(` -> Active configuration: ${villageConfig._configPath || 'default'}`);

  const llmClient = new LlmClient(villageConfig.llmConfig || {});
  const moduleContext = {
    villageConfig,
    llmClient,
    isMock
  };

  // Map source types to classes
  const SOURCE_CLASSES = {
    'rss': RssSource,
    'hdc-planning': HdcPlanningSource,
    'parish-council': ParishCouncilSource,
    'events': EventsSource,
    'village-scene': VillageSceneSource,
    'fowl-library': FowlSource,
    'county-council': CountyCouncilSource,
    'wpa-school': WpaSource,
    'town-council': TownCouncilSource,
    'ramsey-council-newsletter': RamseyNewsletterSource,
    'library-events': LibraryEventsSource,
    'abbey-college': AbbeyCollegeSource
  };

  // Phase 1: Instantiate and validate requirements for all configured sources
  const sourceInstances = [];
  for (const srcCfg of villageConfig.sources || []) {
    if (!srcCfg.enabled) continue;
    const SourceClass = SOURCE_CLASSES[srcCfg.type];
    if (!SourceClass) {
      console.warn(`[Ingest Pipeline] Warning: Unknown source type '${srcCfg.type}' for ${srcCfg.name}. Skipping.`);
      continue;
    }

    try {
      const instance = new SourceClass(srcCfg, moduleContext);
      sourceInstances.push(instance);
    } catch (err) {
      console.error(`[Ingest Pipeline] Fatal requirement error for ${srcCfg.name}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(` -> Initialized and validated ${sourceInstances.length} data sources.`);

  const composer = new BriefingComposer(villageConfig);
  const cacheOptions = { dataDir: villageConfig.dataDir, place: placeName };
  const storeOptions = { dataDir: villageConfig.dataDir, place: placeName, nowDate: now };

  const allRawItems = [];
  const sourcesMetadata = [];

  // Phase 2: Execute two-stage extraction per source with platform-level caching
  for (const src of sourceInstances) {
    try {
      console.log(` -> Processing source: ${src.name} (${src.type})...`);

      // Routine 1: Establish source list
      const discoveredSources = await src.establishSources({
        maxDays: (villageConfig.llmConfig && villageConfig.llmConfig.preFilterDays) || 30,
        nowDate: now,
        includeMockFallback: isMock
      });

      const uncachedSources = [];
      const extractedCategorized = {
        events: [],
        news: [],
        governance: [],
        planning: []
      };

      // Platform cache check
      for (const disc of discoveredSources) {
        const cached = getCachedSource(disc.sourceUrl, disc.timestamp, cacheOptions);
        if (cached) {
          // Cache Hit: reuse cached categories
          for (const cat of ['events', 'news', 'governance', 'planning']) {
            if (Array.isArray(cached[cat])) {
              extractedCategorized[cat].push(...cached[cat]);
            }
          }
        } else {
          uncachedSources.push(disc);
        }
      }

      console.log(`    Discovered ${discoveredSources.length} item(s): ${discoveredSources.length - uncachedSources.length} cached, ${uncachedSources.length} to analyse.`);

      // Routine 2: Analyse only uncached sources
      if (uncachedSources.length > 0) {
        const newlyAnalysed = await src.analyseSources(uncachedSources, {
          maxDays: (villageConfig.llmConfig && villageConfig.llmConfig.preFilterDays) || 30,
          nowDate: now,
          includeMockFallback: isMock
        });

        // Cache newly analysed sources
        for (const un of uncachedSources) {
          setCachedSource(un.sourceUrl, un.timestamp, newlyAnalysed, un.metadata, cacheOptions);
        }

        for (const cat of ['events', 'news', 'governance', 'planning']) {
          if (Array.isArray(newlyAnalysed[cat])) {
            extractedCategorized[cat].push(...newlyAnalysed[cat]);
          }
        }
      }

      // Phase 3: Schema validation & Provenance Normalization
      const validated = validateCategorizedOutput(extractedCategorized, src);

      // School filtering if source is school module:
      // Internal school bulletins kept for school pages; only whole-village kept for main news
      if (src.type === 'wpa-school' || src.type === 'abbey-college') {
        validated.news = validated.news.filter(i => composer.isWholeVillageSchoolItem(i));
      }

      // Collect raw items for source audit report
      const allSrcItems = [
        ...validated.events,
        ...validated.news,
        ...validated.governance,
        ...validated.planning
      ];
      allRawItems.push(...allSrcItems);

      // Route validated items to domain stores
      if (validated.events.length > 0) {
        saveCalendar(validated.events, storeOptions);
      }
      if (validated.news.length > 0) {
        updateNewsStore(validated.news, { maxDays: 21, ...storeOptions });
      }
      if (validated.governance.length > 0) {
        updateGovernanceStore(validated.governance, { maxDays: 60, ...storeOptions });
      }
      if (validated.planning.length > 0) {
        updatePlanningStore(validated.planning, { maxActiveDays: 90, maxDecidedDays: 30, ...storeOptions });
      }

      sourcesMetadata.push({
        id: src.id,
        name: src.name,
        type: src.type,
        itemCount: allSrcItems.length,
        status: 'ok',
        url: src.config.url || 'N/A'
      });
    } catch (err) {
      console.warn(` -> Warning: Error processing ${src.name}: ${err.message}. Retaining cached content.`);
      sourcesMetadata.push({
        id: src.id,
        name: src.name,
        type: src.type,
        itemCount: 0,
        status: 'error',
        error: err.message,
        url: src.config.url || 'N/A'
      });
    }
  }

  // Phase 4: Compose daily briefing from active domain stores
  console.log(` -> Composing daily briefing from persistent cached domain stores...`);
  const { content: composedData, html: briefingBody } = await composer.generateBriefing({
    isoDate,
    maxNewsItems: 12,
    maxEventsDays: 30,
    maxPlanningPerCategory: 10,
    nowDate: now,
    dataDir: villageConfig.dataDir,
    place: placeName
  });

  const composedItems = [
    ...(composedData.events || []),
    ...(composedData.news || []),
    ...(composedData.governance || []),
    ...(composedData.planning || [])
  ];

  console.log(` -> Composed briefing: ${composedData.events?.length || 0} events, ${composedData.news?.length || 0} news, ${composedData.governance?.length || 0} governance, ${composedData.planning?.length || 0} planning.`);

  // Save source breakdown audit data for /archive/YYYY-MM-DD/sources/
  const resolvedDataDir = path.isAbsolute(villageConfig.dataDir || 'src/_data')
    ? villageConfig.dataDir
    : path.join(__dirname, '..', villageConfig.dataDir || 'src/_data');
  const sourcesDataDir = path.join(resolvedDataDir, 'daily_sources');
  fs.mkdirSync(sourcesDataDir, { recursive: true });

  const dailySourceData = {
    date: isoDate,
    villageName: placeName,
    sources: sourcesMetadata,
    processedItemCount: composedItems.length,
    rawItemCount: allRawItems.length,
    rawItems: allRawItems,
    items: composedItems
  };

  fs.writeFileSync(
    path.join(sourcesDataDir, `${isoDate}.json`),
    JSON.stringify(dailySourceData, null, 2)
  );

  // Format Frontmatter
  const title = `${placeName} Daily Briefing – ${formattedDateStr}`;
  const briefingMarkdown = `---
title: "${title}"
date: ${isoDate}
isoDate: "${isoDate}"
villageName: "${placeName}"
county: "${villageConfig.county}"
sourcesCount: ${sourcesMetadata.length}
itemsCount: ${composedItems.length}
layout: layouts/briefing.njk
permalink: "/archive/${isoDate}/index.html"
---

${briefingBody}
`;

  // Write briefing file to outputDir/YYYY-MM-DD.md
  const resolvedOutputDir = path.isAbsolute(villageConfig.outputDir || 'src/briefings')
    ? villageConfig.outputDir
    : path.join(__dirname, '..', villageConfig.outputDir || 'src/briefings');
  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  const outputFile = path.join(resolvedOutputDir, `${isoDate}.md`);
  fs.writeFileSync(outputFile, briefingMarkdown, 'utf-8');

  console.log(`[Ingest Pipeline] Successfully generated daily briefing for ${isoDate} at ${outputFile}`);
}

runIngest().catch(err => {
  console.error('[Ingest Pipeline] Fatal error:', err);
  process.exit(1);
});
