const { loadConfig } = require('./utils/config-loader');
const villageConfig = loadConfig();

const RssSource = require('./sources/rss-source');
const HdcPlanningSource = require('./sources/hdc-planning-source');
const ParishCouncilSource = require('./sources/parish-council-source');
const EventsSource = require('./sources/events-source');
const VillageSceneSource = require('./sources/village-scene-source');
const FowlSource = require('./sources/fowl-source');
const CountyCouncilSource = require('./sources/county-council-source');
const WpaSource = require('./sources/wpa-source');

async function testSources() {
  console.log(`--- Testing Source Extractors for ${villageConfig.placeName || villageConfig.villageName} ---`);
  let totalItems = 0;
  const context = { villageConfig };

  for (const srcCfg of villageConfig.sources || []) {
    let instance = null;
    if (srcCfg.type === 'rss') instance = new RssSource(srcCfg, context);
    else if (srcCfg.type === 'hdc-planning') instance = new HdcPlanningSource(srcCfg, context);
    else if (srcCfg.type === 'parish-council') instance = new ParishCouncilSource(srcCfg, context);
    else if (srcCfg.type === 'events') instance = new EventsSource(srcCfg, context);
    else if (srcCfg.type === 'village-scene') instance = new VillageSceneSource(srcCfg, context);
    else if (srcCfg.type === 'fowl-library') instance = new FowlSource(srcCfg, context);
    else if (srcCfg.type === 'county-council') instance = new CountyCouncilSource(srcCfg, context);
    else if (srcCfg.type === 'wpa-school') instance = new WpaSource(srcCfg, context);

    if (instance) {
      console.log(`Testing ${instance.name} (${instance.type})...`);
      const items = await instance.extract({ maxDays: 7, includeMockFallback: true });
      console.log(`  -> Returned ${items.length} items.`);
      totalItems += items.length;
    }
  }

  console.log(`Total Extracted Items across sources: ${totalItems}`);
  console.log('--- Test Complete ---');
}

testSources().catch(console.error);
