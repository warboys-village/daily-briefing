const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  deduplicateEventsSync,
  deduplicateEvents,
  extractTokens,
  computeTokenSimilarity,
  areDatesClose
} = require('../scripts/utils/events-deduper');

const {
  getCachedItem,
  setCachedItem,
  getCachedImageText,
  setCachedImageText,
  pruneMockEntries
} = require('../scripts/utils/processed-doc-cache');

const { validateSingleItem, validateCategorizedOutput } = require('../scripts/utils/schemas');
const BriefingComposer = require('../scripts/agent/briefing-composer');
const { parsePdfFromBuffer } = require('../scripts/utils/pdf-parser');

describe('Pipeline Quality, Granular Caching & Event Deduplication', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'village-daily-pipeline-test-'));
  });

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('1. Event Deduplication Engine (events-deduper.js)', () => {
    test('computes token Jaccard similarity and extracts meaningful tokens', () => {
      const tokensA = extractTokens('Warboys Annual May Day Fete & Community Dog Show');
      const tokensB = extractTokens('May Day Fete and Village Dog Show at Warboys');
      const sim = computeTokenSimilarity(tokensA, tokensB);

      assert.ok(sim >= 0.65, `Token similarity (${sim}) should be >= 0.65 for same event`);
      assert.ok(tokensA.includes('fete'));
      assert.ok(tokensA.includes('dog'));
      assert.ok(!tokensA.includes('and'), 'Stopwords should be filtered out');
    });

    test('detects close dates (same day or within 1 day)', () => {
      assert.strictEqual(areDatesClose('2026-05-04', '2026-05-04'), true);
      assert.strictEqual(areDatesClose('2026-05-04T10:00:00Z', '2026-05-04T14:30:00Z'), true);
      assert.strictEqual(areDatesClose('2026-05-04', '2026-05-05'), true);
      assert.strictEqual(areDatesClose('2026-05-04', '2026-05-20'), false);
    });

    test('synchronously deduplicates matching events and retains richest description', () => {
      const events = [
        {
          id: 'evt-1',
          title: 'Warboys Annual May Day Fete',
          eventDate: '2026-05-04',
          eventTime: '12:00 PM',
          venue: 'Warboys Parish Centre',
          content: 'Short note: annual fete.',
          url: 'https://warboys.gov.uk/events/1'
        },
        {
          id: 'evt-2',
          title: 'May Day Fete & Family Fun Day',
          eventDate: '2026-05-04',
          eventTime: '12:00 PM - 4:00 PM',
          venue: 'Parish Centre Green, Warboys',
          content: 'Join the community for the annual May Day Fete featuring bouncy castles, stalls, BBQ, raffle, and live brass band music.',
          url: 'https://fowl.org.uk/events/may-fete'
        },
        {
          id: 'evt-3',
          title: 'Parish Council Monthly Meeting',
          eventDate: '2026-05-11',
          eventTime: '7:30 PM',
          venue: 'Parish Centre',
          content: 'Monthly meeting of the full parish council.',
          url: 'https://warboys.gov.uk/meetings/may'
        }
      ];

      const deduped = deduplicateEventsSync(events);
      assert.strictEqual(deduped.length, 2, 'Must merge the 2 duplicate May Day fete events');

      const fete = deduped.find(e => e.title.toLowerCase().includes('fete'));
      assert.ok(fete, 'Fete must be present');
      assert.ok(fete.content.includes('brass band'), 'Must retain richer description from second source');
      assert.ok(fete.mergedSources && fete.mergedSources.length === 2, 'Must record merged source URLs');
    });

    test('asynchronously leverages LLM assessment for ambiguous event matches', async () => {
      const events = [
        {
          id: 'amb-1',
          title: 'Library Quiz Night',
          eventDate: '2026-05-15',
          eventTime: '7:00 PM',
          venue: 'Warboys Community Library',
          content: 'Team trivia quiz night to raise funds for the library.',
          url: 'https://fowl.org.uk/events/quiz'
        },
        {
          id: 'amb-2',
          title: 'FOWL General Knowledge Trivia & Raffle',
          eventDate: '2026-05-15',
          eventTime: '19:00',
          venue: 'Community Library, Warboys',
          content: 'Friends of Warboys Library hosting evening trivia.',
          url: 'https://cambs.gov.uk/libraries/events/quiz'
        }
      ];

      // Mock LLM client indicating duplicate
      const mockLlm = {
        assessDuplicateEvents: async (e1, e2) => ({
          isDuplicate: true,
          confidence: 0.95,
          reason: 'Both refer to the same Friday night Friends of Warboys Library quiz',
          canonicalTitle: 'Friends of Warboys Library (FOWL) Quiz Night & Trivia'
        })
      };

      const deduped = await deduplicateEvents(events, { llmClient: mockLlm });
      assert.strictEqual(deduped.length, 1, 'LLM deduplication should merge ambiguous events');
      assert.strictEqual(deduped[0].title, 'Friends of Warboys Library (FOWL) Quiz Night & Trivia');
    });
  });

  describe('2. Granular Document & Image OCR Cache (processed-doc-cache.js)', () => {
    test('stores and retrieves granular per-item cache entries', () => {
      const cacheOpts = { dataDir: testDir, place: 'Warboys' };
      const itemUrl = 'https://example.org/news/new-community-hub';
      const itemTimestamp = '2026-09-12T10:00:00Z';
      const extracted = {
        events: [],
        news: [
          {
            id: 'hub-news-1',
            title: 'New Community Hub Opens',
            url: itemUrl,
            date: '2026-09-12'
          }
        ],
        governance: [],
        planning: []
      };

      assert.strictEqual(getCachedItem(itemUrl, itemTimestamp, cacheOpts), null);

      setCachedItem(itemUrl, itemTimestamp, extracted, { author: 'Editor' }, cacheOpts);

      const cached = getCachedItem(itemUrl, itemTimestamp, cacheOpts);
      assert.ok(cached, 'Must retrieve cached item');
      assert.strictEqual(cached.news.length, 1);
      assert.strictEqual(cached.news[0].title, 'New Community Hub Opens');
    });

    test('stores and retrieves multimodal image OCR text cache entries', () => {
      const cacheOpts = { dataDir: testDir, place: 'Warboys' };
      const imgUrl = 'https://fowl.org.uk/images/talk-poster-september.jpg';

      assert.strictEqual(getCachedImageText(imgUrl, cacheOpts), null);

      setCachedImageText(imgUrl, 'Talk on Medieval Cambridgeshire by Dr John Smith. 24 Sept 7:30pm.', cacheOpts);

      const cachedText = getCachedImageText(imgUrl, cacheOpts);
      assert.ok(cachedText, 'Must retrieve cached image OCR text');
      assert.ok(cachedText.includes('Medieval Cambridgeshire'));
    });

    test('prunes mock and synthetic entries from cache', () => {
      const cacheOpts = { dataDir: testDir, place: 'Warboys' };
      const fakeUrl = 'https://fake.local/mock-minutes';
      setCachedItem(fakeUrl, '2026-01-01', {
        governance: [{ id: 'mock-1', title: 'Mock Parish Meeting', url: fakeUrl, date: '2026-01-01' }]
      }, {}, cacheOpts);

      const realUrl = 'https://warboysparishcouncil.gov.uk/minutes/real';
      setCachedItem(realUrl, '2026-01-01', {
        governance: [{ id: 'real-1', title: 'Real Parish Meeting', url: realUrl, date: '2026-01-01' }]
      }, {}, cacheOpts);

      const prunedCount = pruneMockEntries(cacheOpts);
      assert.ok(prunedCount >= 1, 'Should prune at least one mock entry');
      assert.strictEqual(getCachedItem(fakeUrl, '2026-01-01', cacheOpts), null);
      assert.ok(getCachedItem(realUrl, '2026-01-01', cacheOpts) !== null);
    });
  });

  describe('3. Schemas & School vs Whole-Village Separation', () => {
    test('normalizes school items and sets isSchoolSource and whole-place flags', () => {
      const internalSchoolItem = {
        id: 'wpa-ann-1',
        title: 'Reception Class Phonics Workshop',
        url: 'https://wpa.education/news/1',
        date: '2026-09-15',
        school: 'wpa'
      };

      const validatedInternal = validateSingleItem('news', internalSchoolItem, { schoolSlug: 'wpa' });
      assert.strictEqual(validatedInternal.isSchoolSource, true);
      assert.strictEqual(validatedInternal.isWholeVillage, false);

      const wholeVillageSchoolItem = {
        id: 'wpa-fete-1',
        title: 'WPA Annual Summer Fete & Car Boot Sale',
        url: 'https://wpa.education/fete',
        date: '2026-06-20',
        school: 'wpa',
        isWholeVillage: true,
        wholePlaceReason: 'Open to whole village community and public'
      };

      const validatedVillage = validateSingleItem('news', wholeVillageSchoolItem, { schoolSlug: 'wpa' });
      assert.strictEqual(validatedVillage.isSchoolSource, true);
      assert.strictEqual(validatedVillage.isWholeVillage, true);
      assert.strictEqual(validatedVillage.wholePlaceReason, 'Open to whole village community and public');

      const nonSchoolItem = {
        id: 'pc-news-1',
        title: 'New Footpath Resurfacing Completed',
        url: 'https://warboys.gov.uk/news/footpath',
        date: '2026-09-10'
      };

      const validatedPC = validateSingleItem('news', nonSchoolItem, { id: 'parish-council' });
      assert.strictEqual(validatedPC.isSchoolSource, false);
      assert.strictEqual(validatedPC.isWholeVillage, true);
    });

    test('BriefingComposer.isWholeVillageSchoolItem correctly gates items for main village briefing', () => {
      const composer = new BriefingComposer({ villageName: 'Warboys', county: 'Cambridgeshire' });

      // Internal school item without promotion -> excluded
      assert.strictEqual(composer.isWholeVillageSchoolItem({
        title: 'Headteacher Weekly Bulletin: Year 2 Trip',
        content: 'Please ensure permission slips are returned.',
        isSchoolSource: true,
        isWholeVillage: false
      }), false);

      // School item with explicit whole village promotion -> included
      assert.strictEqual(composer.isWholeVillageSchoolItem({
        title: 'Headteacher Weekly Bulletin',
        content: 'School community news',
        isSchoolSource: true,
        isWholeVillage: true
      }), true);

      // School item mentioning village-wide community fete -> included via keywords
      assert.strictEqual(composer.isWholeVillageSchoolItem({
        title: 'WPA PTFA Summer Fete',
        content: 'Open to all residents, car boot sale and BBQ on school field.',
        isSchoolSource: true
      }), true);

      // General parish item -> always included
      assert.strictEqual(composer.isWholeVillageSchoolItem({
        title: 'Warboys Parish Council Meeting',
        content: 'Planning and highways discussion.',
        isSchoolSource: false
      }), true);
    });
  });

  describe('4. Real PDF Text Extraction (pdf-parser.js)', () => {
    test('handles empty or invalid PDF buffer gracefully', async () => {
      const nullResult = await parsePdfFromBuffer(null);
      assert.strictEqual(nullResult, null);

      const invalidResult = await parsePdfFromBuffer(Buffer.from('not a pdf'));
      assert.strictEqual(invalidResult, null);
    });

    test('extracts structured paragraphs and metadata from genuine PDF url', async () => {
      const { parsePdfFromUrl } = require('../scripts/utils/pdf-parser');
      const diaryUrl = 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf';
      const parsed = await parsePdfFromUrl(diaryUrl);

      assert.ok(parsed, 'PDF should parse successfully');
      assert.ok(parsed.text && parsed.text.length > 500, 'Text should be substantive');
      assert.ok(Array.isArray(parsed.paragraphs), 'Paragraphs should be an array');
      assert.ok(parsed.paragraphs.length > 5, 'Should extract multiple paragraphs');
      assert.ok(parsed.numPages >= 1, 'Should report page count');
    });
  });
});
