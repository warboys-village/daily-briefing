const fs = require('fs');
const path = require('path');
const villageConfig = require('../village.config.json');

const RssSource = require('./sources/rss-source');
const HdcPlanningSource = require('./sources/hdc-planning-source');
const ParishCouncilSource = require('./sources/parish-council-source');
const EventsSource = require('./sources/events-source');
const VillageSceneSource = require('./sources/village-scene-source');
const FowlSource = require('./sources/fowl-source');
const CountyCouncilSource = require('./sources/county-council-source');
const WpaSource = require('./sources/wpa-source');

const {
  updateNewsStore,
  updatePlanningStore,
  updateGovernanceStore,
  saveCalendar
} = require('./utils/content-stores');
const BriefingComposer = require('./agent/briefing-composer');

async function runIngest() {
  const isMock = process.argv.includes('--mock');
  const now = new Date();
  const isoDate = now.toISOString().split('T')[0]; // e.g. "2026-08-14"
  const formattedDateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`[Ingest Pipeline] Starting decoupled ingestion for ${villageConfig.villageName} (${isoDate})...`);

  // Map source types to classes
  const sourceInstances = [];
  for (const srcCfg of villageConfig.sources || []) {
    if (!srcCfg.enabled) continue;
    if (srcCfg.type === 'rss') {
      sourceInstances.push(new RssSource(srcCfg));
    } else if (srcCfg.type === 'hdc-planning') {
      sourceInstances.push(new HdcPlanningSource(srcCfg));
    } else if (srcCfg.type === 'parish-council') {
      sourceInstances.push(new ParishCouncilSource(srcCfg));
    } else if (srcCfg.type === 'events') {
      sourceInstances.push(new EventsSource(srcCfg));
    } else if (srcCfg.type === 'village-scene') {
      sourceInstances.push(new VillageSceneSource(srcCfg));
    } else if (srcCfg.type === 'fowl-library') {
      sourceInstances.push(new FowlSource(srcCfg));
    } else if (srcCfg.type === 'county-council') {
      sourceInstances.push(new CountyCouncilSource(srcCfg));
    } else if (srcCfg.type === 'wpa-school') {
      sourceInstances.push(new WpaSource(srcCfg));
    }
  }

  const composer = new BriefingComposer(villageConfig);
  const allRawItems = [];
  const sourcesMetadata = [];

  // Ingest each data source independently into domain stores
  for (const src of sourceInstances) {
    try {
      console.log(` -> Ingesting source: ${src.name} (${src.type})...`);
      const items = await src.extract({
        maxDays: (villageConfig.llmConfig && villageConfig.llmConfig.preFilterDays) || 30,
        includeMockFallback: isMock
      });

      allRawItems.push(...items);

      // Route extracted items to respective domain stores
      if (src.type === 'rss' || src.type === 'village-scene') {
        const evtItems = items.filter(i => (i.category || '').toLowerCase().includes('event') || i.eventDate);
        const newsItems = items.filter(i => !evtItems.includes(i));
        if (evtItems.length > 0) saveCalendar(evtItems);
        if (newsItems.length > 0) updateNewsStore(newsItems, { maxDays: 21, nowDate: now });
      } else if (src.type === 'fowl-library') {
        const evtItems = items.filter(i => (i.category || '').toLowerCase().includes('event') || i.eventDate);
        const newsItems = items.filter(i => !evtItems.includes(i));
        if (evtItems.length > 0) saveCalendar(evtItems);
        if (newsItems.length > 0) updateNewsStore(newsItems, { maxDays: 21, nowDate: now });
      } else if (src.type === 'hdc-planning') {
        updatePlanningStore(items, { maxActiveDays: 90, maxDecidedDays: 30, nowDate: now });
      } else if (src.type === 'parish-council') {
        const evtItems = items.filter(i => (i.category || '').toLowerCase().includes('event') || i.eventDate);
        const govItems = items.filter(i => !evtItems.includes(i));
        if (evtItems.length > 0) saveCalendar(evtItems);
        if (govItems.length > 0) updateGovernanceStore(govItems, { maxDays: 60, nowDate: now });
      } else if (src.type === 'county-council') {
        updateGovernanceStore(items, { maxDays: 60, nowDate: now });
      } else if (src.type === 'events') {
        saveCalendar(items);
      } else if (src.type === 'wpa-school') {
        const wholeVillage = items.filter(i => composer.isWholeVillageSchoolItem(i));
        const wvEvents = wholeVillage.filter(i => (i.category || '').toLowerCase().includes('event') || i.eventDate);
        const wvNews = wholeVillage.filter(i => !wvEvents.includes(i));
        if (wvEvents.length > 0) saveCalendar(wvEvents);
        if (wvNews.length > 0) updateNewsStore(wvNews, { maxDays: 21, nowDate: now });
      }

      sourcesMetadata.push({
        id: src.id,
        name: src.name,
        type: src.type,
        itemCount: items.length,
        status: 'ok',
        url: src.config.url || 'N/A'
      });
    } catch (err) {
      console.warn(` -> Warning: Error extracting from ${src.name}: ${err.message}. Retaining cached content.`);
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

  // Compose briefing from active domain stores
  console.log(` -> Composing daily briefing from persistent cached domain stores...`);
  const { content: composedData, html: briefingBody } = await composer.generateBriefing({
    isoDate,
    maxNewsItems: 12,
    maxEventsDays: 30,
    maxPlanningPerCategory: 10,
    nowDate: now
  });

  const composedItems = [
    ...(composedData.events || []),
    ...(composedData.news || []),
    ...(composedData.governance || []),
    ...(composedData.planning || [])
  ];

  console.log(` -> Composed briefing: ${composedData.events?.length || 0} events, ${composedData.news?.length || 0} news, ${composedData.governance?.length || 0} governance, ${composedData.planning?.length || 0} planning.`);

  // Save source breakdown audit data for /archive/YYYY-MM-DD/sources/
  const dataDir = path.join(__dirname, '..', villageConfig.dataDir || 'src/_data');
  const sourcesDataDir = path.join(dataDir, 'daily_sources');
  fs.mkdirSync(sourcesDataDir, { recursive: true });

  const dailySourceData = {
    date: isoDate,
    villageName: villageConfig.villageName,
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
  const title = `${villageConfig.villageName} Daily Briefing – ${formattedDateStr}`;
  const briefingMarkdown = `---
title: "${title}"
date: ${isoDate}
isoDate: "${isoDate}"
villageName: "${villageConfig.villageName}"
county: "${villageConfig.county}"
sourcesCount: ${sourcesMetadata.length}
itemsCount: ${composedItems.length}
layout: layouts/briefing.njk
permalink: "/archive/${isoDate}/index.html"
---

${briefingBody}
`;

  // Write briefing file to src/briefings/YYYY-MM-DD.md
  const outputDir = path.join(__dirname, '..', villageConfig.outputDir || 'src/briefings');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `${isoDate}.md`);
  fs.writeFileSync(outputFile, briefingMarkdown, 'utf-8');

  console.log(`[Ingest Pipeline] Successfully generated daily briefing for ${isoDate} at ${outputFile}`);
}

runIngest().catch(err => {
  console.error('[Ingest Pipeline] Fatal error:', err);
  process.exit(1);
});
