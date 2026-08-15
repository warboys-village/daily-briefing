const villageConfig = require('../village.config.json');
const RssSource = require('./sources/rss-source');
const HdcPlanningSource = require('./sources/hdc-planning-source');
const ParishCouncilSource = require('./sources/parish-council-source');
const EventsSource = require('./sources/events-source');
const VillageSceneSource = require('./sources/village-scene-source');
const FowlSource = require('./sources/fowl-source');

async function testSources() {
  console.log('--- Testing Village Daily Source Extractors ---');
  let totalItems = 0;

  for (const srcCfg of villageConfig.sources || []) {
    let instance = null;
    if (srcCfg.type === 'rss') instance = new RssSource(srcCfg);
    else if (srcCfg.type === 'hdc-planning') instance = new HdcPlanningSource(srcCfg);
    else if (srcCfg.type === 'parish-council') instance = new ParishCouncilSource(srcCfg);
    else if (srcCfg.type === 'events') instance = new EventsSource(srcCfg);
    else if (srcCfg.type === 'village-scene') instance = new VillageSceneSource(srcCfg);
    else if (srcCfg.type === 'fowl-library') instance = new FowlSource(srcCfg);

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
