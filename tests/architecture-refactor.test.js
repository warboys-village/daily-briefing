const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  computeSourceHash,
  computeDefaultExpiresAt,
  isItemExpired,
  validateSingleItem,
  validateCategorizedOutput
} = require('../scripts/utils/schemas');
const LlmClient = require('../scripts/agent/llm-client');
const { createCapabilities } = require('../scripts/utils/capabilities');
const BaseSource = require('../scripts/sources/base-source');
const { getCachedSource, setCachedSource } = require('../scripts/utils/processed-doc-cache');
const {
  updateNewsStore,
  loadNewsStore,
  updateGovernanceStore,
  loadGovernanceStore,
  updatePlanningStore,
  loadPlanningStore,
  saveCalendar,
  loadCalendar
} = require('../scripts/utils/content-stores');
const { loadConfig, resolveConfigPath } = require('../scripts/utils/config-loader');

describe('Architecture Refactor: Schemas, Capabilities, Cache, Expiry & YAML Config', () => {
  it('validates categorized output including meetingMinutes alias, sourceHash, expiresAt, relevance, and yearGroups', () => {
    const raw = {
      news: [
        {
          id: 'wpa-news-1',
          title: 'School Summer Fair',
          summary: 'Open to the whole village on Saturday.',
          url: 'https://www.wpa.education/news/fair',
          date: '2026-06-10',
          relevance: 'place',
          yearGroups: ['R', 'Y1', 'Y2'],
          ttlDays: 14
        },
        {
          id: 'wpa-news-2',
          title: 'Year 6 Homework Club',
          summary: 'Internal school reminder.',
          url: 'https://www.wpa.education/news/hw',
          date: '2026-06-10',
          relevance: 'school',
          yearGroups: ['Y6'],
          expiresAt: '2026-06-20T00:00:00.000Z'
        }
      ],
      events: [
        {
          id: 'evt-1',
          title: 'Village Fete',
          eventDate: '2026-07-01',
          url: 'https://example.com/fete'
        }
      ],
      meetingMinutes: [
        {
          id: 'gov-1',
          title: 'Parent Forum Minutes',
          meetingTitle: 'WPA Parent Forum',
          meetingDate: '2026-06-05',
          summary: 'Discussed uniform and lunches.',
          url: 'https://www.wpa.education/forum.pdf',
          relevance: 'school'
        }
      ],
      planning: [
        {
          id: 'plan-1',
          reference: '26/00123/FUL',
          address: '10 High Street, Warboys',
          proposal: 'Single storey extension',
          status: 'Pending',
          url: 'https://publicaccess.huntingdonshire.gov.uk/123'
        }
      ]
    };

    const sourceMeta = {
      id: 'wpa-school',
      name: 'Warboys Primary Academy',
      url: 'https://www.wpa.education/parents/letters-newsletters',
      school: 'wpa',
      sourceHash: computeSourceHash('newsletter-v1')
    };

    const validated = validateCategorizedOutput(raw, sourceMeta);

    assert.strictEqual(validated.news.length, 2);
    assert.strictEqual(validated.events.length, 1);
    assert.strictEqual(validated.governance.length, 1);
    assert.strictEqual(validated.planning.length, 1);

    // Relevance & isWholeVillage synchronization
    assert.strictEqual(validated.news[0].relevance, 'place');
    assert.strictEqual(validated.news[0].isWholeVillage, true);
    assert.deepStrictEqual(validated.news[0].yearGroups, ['R', 'Y1', 'Y2']);
    assert.ok(validated.news[0].expiresAt);

    assert.strictEqual(validated.news[1].relevance, 'school');
    assert.strictEqual(validated.news[1].isWholeVillage, false);
    assert.strictEqual(validated.news[1].expiresAt, '2026-06-20T00:00:00.000Z');

    // Provenance & deterministic SHA-256 hash
    assert.strictEqual(validated.news[0].sourceId, 'wpa-school');
    assert.strictEqual(validated.news[0].sourceUrl, 'https://www.wpa.education/news/fair');
    assert.match(validated.news[0].sourceHash, /^[a-f0-9]{16}$/);
    assert.strictEqual(validated.events[0].expiresAt.startsWith('2026-07-01'), true);
    assert.strictEqual(validated.governance[0].relevance, 'school');
    assert.strictEqual(validated.governance[0].isWholeVillage, false);

    // isItemExpired helper
    assert.strictEqual(isItemExpired({ expiresAt: '2026-06-01T00:00:00.000Z' }, new Date('2026-06-10T00:00:00.000Z')), true);
    assert.strictEqual(isItemExpired({ expiresAt: '2026-06-20T00:00:00.000Z' }, new Date('2026-06-10T00:00:00.000Z')), false);
    assert.ok(computeDefaultExpiresAt('planning', { date: '2026-06-01' }));
    assert.ok(validateSingleItem('news', { id: 't-1', title: 'Test', url: 'https://x.test', date: '2026-06-10' }, sourceMeta).sourceHash);
  });

  it('resolves model families via LlmClient and injects capabilities & params into BaseSource', () => {
    const llm = new LlmClient({ model: 'gemini-2.5-flash' });
    assert.strictEqual(llm.resolveModel(), llm.model);
    assert.strictEqual(llm.resolveModel({ modelFamily: 'hydrogen' }), llm.modelFamilies.hydrogen);
    assert.strictEqual(llm.resolveModel({ modelFamily: 'flash' }), llm.modelFamilies.flash);
    assert.strictEqual(llm.resolveModel({ modelFamily: 'pro' }), llm.modelFamilies.pro);
    assert.strictEqual(llm.resolveModel({ model: 'custom-model-v1' }), 'custom-model-v1');

    const capabilities = createCapabilities({ llmClient: llm });
    assert.strictEqual(capabilities.llm.resolveModel({ modelFamily: 'hydrogen' }), llm.modelFamilies.hydrogen);
    assert.strictEqual(capabilities.hash('abc'), computeSourceHash('abc'));

    const src = new BaseSource(
      {
        id: 'test-src',
        type: 'rss',
        name: 'Test Source',
        url: 'https://example.com/rss',
        params: { placeFilter: 'Warboys', imageModelFamily: 'hydrogen' }
      },
      { capabilities, llmClient: llm }
    );

    assert.strictEqual(src.capabilities, capabilities);
    assert.strictEqual(src.params.placeFilter, 'Warboys');
    assert.strictEqual(src.params.imageModelFamily, 'hydrogen');
    assert.strictEqual(src.computeHash('hello'), computeSourceHash('hello'));
  });

  it('skips reprocessing unchanged sources using sourceHash and invalidates on hash change', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-cache-hash-'));
    const cacheFile = path.join(tmpDir, 'cache.json');
    const sourceUrl = 'https://example.com/newsletter';
    const hashV1 = computeSourceHash('version-1');
    const hashV2 = computeSourceHash('version-2');
    const payload = { news: [{ title: 'Item 1', url: sourceUrl }] };

    setCachedSource(sourceUrl, '2026-06-01T00:00:00.000Z', payload, { sourceHash: hashV1 }, { cacheFile, sourceHash: hashV1 });

    // Same hash hits cache even if timestamp is a different day
    const hit = getCachedSource(sourceUrl, '2026-06-02T00:00:00.000Z', { cacheFile, sourceHash: hashV1 });
    assert.deepStrictEqual(hit, payload);

    // Different hash misses cache
    const miss = getCachedSource(sourceUrl, '2026-06-01T00:00:00.000Z', { cacheFile, sourceHash: hashV2 });
    assert.strictEqual(miss, null);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('filters expired items across news, planning, governance, and events stores', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-expiry-stores-'));
    const nowDate = new Date('2026-06-15T12:00:00.000Z');
    const pastExpiry = '2026-06-10T00:00:00.000Z';
    const futureExpiry = '2026-06-25T00:00:00.000Z';

    const news = updateNewsStore([
      { title: 'Expired News', url: 'https://example.com/n1', date: '2026-06-14', expiresAt: pastExpiry },
      { title: 'Active News', url: 'https://example.com/n2', date: '2026-06-14', expiresAt: futureExpiry }
    ], { dataDir: tmpDir, nowDate });
    assert.strictEqual(news.length, 1);
    assert.strictEqual(news[0].title, 'Active News');
    assert.strictEqual(loadNewsStore({ dataDir: tmpDir, nowDate }).length, 1);

    const planning = updatePlanningStore([
      { reference: '26/00001/FUL', proposal: 'Expired plan', registeredDate: '2026-06-01', expiresAt: pastExpiry },
      { reference: '26/00002/FUL', proposal: 'Active plan', registeredDate: '2026-06-01', expiresAt: futureExpiry }
    ], { dataDir: tmpDir, nowDate });
    assert.strictEqual(planning.length, 1);
    assert.strictEqual(planning[0].reference, '26/00002/FUL');
    assert.strictEqual(loadPlanningStore({ dataDir: tmpDir, nowDate }).length, 1);

    const governance = updateGovernanceStore([
      { title: 'Expired Minute', meetingDate: '2026-06-01', expiresAt: pastExpiry },
      { title: 'Active Minute', meetingDate: '2026-06-01', expiresAt: futureExpiry }
    ], { dataDir: tmpDir, nowDate });
    assert.strictEqual(governance.length, 1);
    assert.strictEqual(governance[0].title, 'Active Minute');
    assert.strictEqual(loadGovernanceStore({ dataDir: tmpDir, nowDate }).length, 1);

    const events = saveCalendar([
      { title: 'Expired Event', eventDate: '2026-06-20', expiresAt: pastExpiry },
      { title: 'Active Event', eventDate: '2026-06-20', expiresAt: futureExpiry }
    ], { dataDir: tmpDir, nowDate });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].title, 'Active Event');
    assert.strictEqual(loadCalendar({ dataDir: tmpDir, nowDate }).length, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads YAML place and school configs with theme and source params', () => {
    const warboysPath = resolveConfigPath({ place: 'warboys' });
    assert.ok(warboysPath.endsWith(path.join('places', 'warboys.yaml')));

    const warboys = loadConfig({ place: 'warboys' });
    assert.strictEqual(warboys.placeName, 'Warboys');
    assert.strictEqual(warboys.theme.primary, '#034f32');
    assert.strictEqual(warboys.school.slug, 'wpa');
    assert.strictEqual(warboys.school.name, 'Warboys Primary Academy');
    assert.strictEqual(warboys.school.yearGroups.length, 7);

    const huntsPost = warboys.sources.find(s => s.id === 'hunts-post');
    assert.strictEqual(huntsPost.params.filterKeyword, 'Warboys');

    const ramsey = loadConfig({ place: 'ramsey' });
    assert.strictEqual(ramsey.placeName, 'Ramsey');
    assert.strictEqual(ramsey.theme.primary, '#4e3c8a');
    assert.strictEqual(ramsey.school.slug, 'abbey');
    assert.strictEqual(ramsey.school.name, 'Abbey College, Ramsey');
  });
});
