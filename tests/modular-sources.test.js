const { describe, test } = require('node:test');
const assert = require('node:assert');

const BaseSource = require('../scripts/sources/base-source');
const RssSource = require('../scripts/sources/rss-source');
const ParishCouncilSource = require('../scripts/sources/parish-council-source');
const HdcPlanningSource = require('../scripts/sources/hdc-planning-source');
const CountyCouncilSource = require('../scripts/sources/county-council-source');
const FowlSource = require('../scripts/sources/fowl-source');
const EventsSource = require('../scripts/sources/events-source');
const WpaSource = require('../scripts/sources/wpa-source');
const VillageSceneSource = require('../scripts/sources/village-scene-source');

const { loadConfig, getPlaceName } = require('../scripts/utils/config-loader');
const { validateSingleItem, validateCategorizedOutput } = require('../scripts/utils/schemas');
const { getCachedSource, setCachedSource } = require('../scripts/utils/processed-doc-cache');

describe('Modular Data Sources & Multi-Village Architecture', () => {

  describe('1. Declared Requirements & Build-Time Validation', () => {
    test('throws ConfigurationError when a source is missing required inputs', () => {
      // RssSource requires ['url', 'placeName', 'county']
      assert.throws(
        () => {
          new RssSource({ id: 'test-rss' }, { villageConfig: {} });
        },
        /ConfigurationError.*missing required input\(s\)/i
      );
    });

    test('passes validation when required inputs are provided in village config or module config', () => {
      const src = new RssSource(
        { id: 'test-rss', url: 'https://news.google.com/rss' },
        { villageConfig: { placeName: 'Warboys', county: 'Cambridgeshire' } }
      );
      assert.strictEqual(src.id, 'test-rss');
      assert.strictEqual(src.placeName, 'Warboys');
      assert.strictEqual(src.county, 'Cambridgeshire');
    });

    test('HdcPlanningSource validates placeName and districtCouncil', () => {
      assert.throws(
        () => {
          new HdcPlanningSource({ id: 'test-hdc' }, { villageConfig: { placeName: 'Warboys' } });
        },
        /ConfigurationError.*districtCouncil/
      );

      const validSrc = new HdcPlanningSource(
        { id: 'test-hdc' },
        { villageConfig: { placeName: 'Warboys', districtCouncil: 'Huntingdonshire District Council' } }
      );
      assert.strictEqual(validSrc.id, 'test-hdc');
    });
  });

  describe('2. Two-Stage Lifecycle: establishSources & analyseSources', () => {
    test('ParishCouncilSource implements establishSources and returns source descriptors', async () => {
      const src = new ParishCouncilSource(
        { id: 'warboys-parish', name: 'Warboys Parish Council', url: 'https://www.warboysparishcouncil.gov.uk/' },
        { villageConfig: { placeName: 'Warboys' } }
      );

      const sources = await src.establishSources();
      assert.ok(Array.isArray(sources), 'establishSources must return an array');
      if (sources.length > 0) {
        assert.ok(sources[0].sourceUrl, 'source descriptor must contain sourceUrl');
        assert.ok(sources[0].timestamp, 'source descriptor must contain timestamp');
      }
    });

    test('FowlSource establishes regular sessions and local history talks', async () => {
      const src = new FowlSource(
        { id: 'fowl-library', name: 'Friends of Warboys Library', url: 'https://fowl.org.uk/' },
        { villageConfig: { placeName: 'Warboys' } }
      );

      const sources = await src.establishSources();
      assert.ok(sources.length >= 3, 'Must establish at least 3 regular sessions');
      const rhymetime = sources.find(s => s.sourceId === 'fowl-regular-rhymetime');
      assert.ok(rhymetime, 'Rhymetime descriptor must exist');

      const analysed = await src.analyseSources(sources, { nowDate: new Date('2026-09-03') });
      assert.ok(Array.isArray(analysed.events), 'analyseSources must return categorized events');
      assert.ok(analysed.events.some(e => e.title.includes('Storytime')), 'Must extract Storytime event');
    });
  });

  describe('3. Platform Caching by Source Provenance and Timestamp', () => {
    test('stores and retrieves cached categorized results', () => {
      const testUrl = 'https://example.com/minutes/test-meeting-2026.docx';
      const testTimestamp = '2026-09-03T19:00:00.000Z';
      const categories = {
        governance: [
          {
            id: 'test-item-gov',
            title: 'Parish Allotment Maintenance Plan',
            meetingTitle: 'Warboys Parish Council',
            meetingDate: '2026-09-03',
            url: testUrl,
            summary: 'Plan approved.'
          }
        ],
        events: []
      };

      setCachedSource(testUrl, testTimestamp, categories, { format: 'docx' });
      const cached = getCachedSource(testUrl, testTimestamp);

      assert.ok(cached, 'Cache hit must return stored categories');
      assert.strictEqual(cached.governance.length, 1);
      assert.strictEqual(cached.governance[0].title, 'Parish Allotment Maintenance Plan');

      // Stale check: different timestamp returns null
      const stale = getCachedSource(testUrl, '2026-10-01T19:00:00.000Z');
      assert.strictEqual(stale, null, 'Different timestamp must indicate cache miss');
    });
  });

  describe('4. Categorized Output Schemas & Validation', () => {
    test('validates and normalizes single event item with provenance', () => {
      const rawEvent = {
        id: 'evt-1',
        title: 'Warboys Craft Fair',
        eventDate: '2026-09-12',
        url: 'https://fowl.org.uk/events/craft'
      };

      const validated = validateSingleItem('events', rawEvent, { id: 'fowl', name: 'FOWL' });
      assert.strictEqual(validated.id, 'evt-1');
      assert.strictEqual(validated.sourceId, 'fowl');
      assert.strictEqual(validated.sourceName, 'FOWL');
      assert.strictEqual(validated.sourceUrl, 'https://fowl.org.uk/events/craft');
      assert.ok(validated.timestamp, 'timestamp must be set');
    });

    test('validates complete categorized output and attaches timestamps', () => {
      const rawOutput = {
        news: [
          {
            id: 'news-1',
            title: 'Village Hall Refurbishment Completed',
            url: 'https://news.example.com/1',
            date: '2026-09-02',
            summary: 'Works finished.'
          }
        ],
        governance: [
          {
            id: 'gov-1',
            title: 'Precept Discussion',
            meetingTitle: 'Warboys Parish Council',
            meetingDate: '2026-09-01',
            url: 'https://parish.example.com/min',
            summary: 'Precept discussed.'
          }
        ]
      };

      const validated = validateCategorizedOutput(rawOutput, { id: 'source-1', name: 'Local Source' });
      assert.strictEqual(validated.news.length, 1);
      assert.strictEqual(validated.governance.length, 1);
      assert.strictEqual(validated.news[0].sourceName, 'Local Source');
      assert.strictEqual(validated.governance[0].sourceName, 'Local Source');
    });
  });

  describe('5. Multi-Village Configuration Loading', () => {
    test('loads Warboys configuration with single school navigation', () => {
      const config = loadConfig({ place: 'warboys' });
      assert.strictEqual(config.placeName, 'Warboys');
      assert.strictEqual(config.county, 'Cambridgeshire');
      assert.ok(config.sources.some(s => s.id === 'warboys-parish'));
      assert.strictEqual(config.isMultiSchool, false);
      assert.strictEqual(config.schoolNavUrl, '/wpa/');
      assert.strictEqual(config.schoolNavLabel, 'Primary Academy');
      assert.strictEqual(config.schools.length, 1);
      assert.strictEqual(config.schools[0].slug, 'wpa');
    });

    test('loads Ramsey configuration with multi-school navigation & 2-column layout setup', () => {
      const config = loadConfig({ place: 'ramsey' });
      assert.strictEqual(config.placeName, 'Ramsey');
      assert.ok(config.sources.some(s => s.id === 'ramsey-town' || s.id === 'ramsey-town-council'));
      assert.strictEqual(config.isMultiSchool, true);
      assert.strictEqual(config.schoolNavUrl, '/schools/');
      assert.strictEqual(config.schoolNavLabel, 'Schools');
      assert.strictEqual(config.schools.length, 4);
      assert.strictEqual(config.schools[0].slug, 'abbey');
      assert.strictEqual(config.schools[1].slug, 'spinning');
      // Must not contain Warboys specific parish council
      assert.strictEqual(config.sources.some(s => s.id === 'warboys-parish'), false);
    });
  });

  describe('6. School Subpage Modularisation, Metadata & Targeted Year Groups', () => {
    test('WpaSource outputs school identifier and targeted school years', async () => {
      const warboysConfig = loadConfig({ place: 'warboys' });
      const src = new WpaSource(
        { id: 'wpa-school', name: 'Warboys Primary Academy', url: 'https://www.wpa.education/parents/letters-newsletters' },
        { villageConfig: warboysConfig }
      );

      const sources = await src.establishSources();
      assert.ok(sources.length > 0, 'WpaSource must discover newsletters');

      const extracted = await src.analyseSources(sources);
      assert.ok(Array.isArray(extracted.events), 'Events must be an array');

      // Verify that school events are tagged with school and yearGroups
      const bikeability = extracted.events.find(e => e.title && e.title.includes('Bikeability'));
      assert.ok(bikeability, 'Must extract Bikeability event');
      assert.strictEqual(bikeability.school, 'wpa', 'Must output school slug');
      assert.strictEqual(bikeability.schoolName, 'Warboys Primary Academy', 'Must output school name');
      assert.deepStrictEqual(bikeability.yearGroups, ['Y5', 'Y6'], 'Must output targeted school years [Y5, Y6]');

      // Verify school news announcements
      assert.ok(Array.isArray(extracted.news), 'News must be an array');
      const announcement = extracted.news[0];
      assert.ok(announcement, 'Must extract school announcement');
      assert.strictEqual(announcement.school, 'wpa', 'Announcement must have school tag');
      assert.ok(Array.isArray(announcement.yearGroups), 'Announcement must have yearGroups array');
    });
  });

});
