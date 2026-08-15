const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseDocxFromUrl } = require('../scripts/utils/docx-parser');
const EventsSource = require('../scripts/sources/events-source');
const ParishCouncilSource = require('../scripts/sources/parish-council-source');
const CountyCouncilSource = require('../scripts/sources/county-council-source');
const WpaSource = require('../scripts/sources/wpa-source');
const { parseSwayNewsletter, extractSwayId } = require('../scripts/utils/wpa-sway-parser');
const { getCachedDocument, setCachedDocument, loadCache } = require('../scripts/utils/processed-doc-cache');
const { preFilterItems } = require('../scripts/utils/pre-filter');
const { renderFullBriefingHtml } = require('../scripts/agent/template-renderer');
const BriefingAgent = require('../scripts/agent/briefing-agent');

describe('Village Daily System - Comprehensive Regression Test Suite', () => {

  describe('1. DOCX Meeting Minutes Extractor (scripts/utils/docx-parser.js)', () => {
    test('extracts separate governance items without raw attendance/header fluff', async () => {
      const testDocxUrl = 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/04-mn-13.07.26.docx';
      const items = await parseDocxFromUrl(testDocxUrl);

      assert.ok(Array.isArray(items), 'DOCX parser should return an array');
      assert.ok(items.length >= 4, 'Should extract discrete governance items from meeting minutes');

      // 1. Verify Raw Attendance/Header Item is Excluded
      const fullTextItem = items.find(i => i.id.startsWith('parish-full-minutes-'));
      assert.strictEqual(fullTextItem, undefined, 'Raw attendance/header text must NOT be emitted as a card');

      // 2. Verify Disaggregated Governance Items
      const sendItem = items.find(i => i.id.startsWith('parish-live-send-'));
      const localPlanItem = items.find(i => i.id.startsWith('parish-live-localplan-'));
      const newmanItem = items.find(i => i.id.startsWith('parish-live-newman-'));

      assert.ok(sendItem, 'Should contain discrete item for £60m SEND budget overspend');
      assert.ok(localPlanItem, 'Should contain discrete item for HDC Local Plan consultation');
      assert.ok(newmanItem, 'Should contain discrete item for Newman Stores consultation');

      assert.ok(sendItem.title.includes('SEND'), 'SEND item title must reference SEND');
      assert.ok(localPlanItem.title.includes('Local Plan'), 'Local Plan item title must reference Local Plan');
      assert.ok(newmanItem.title.includes('Newman Stores'), 'Newman Stores item title must reference Newman Stores');

      // 3. Verify Direct DOCX Links
      for (const item of items) {
        assert.strictEqual(item.url, testDocxUrl, `Item ${item.id} must point to exact DOCX URL`);
      }
    });
  });

  describe('2. Warboys Diary Events Extractor & PDF Issue Links (scripts/sources/events-source.js)', () => {
    test('attaches specific PDF issue URLs and accurately dates events', async () => {
      const source = new EventsSource({
        id: 'warboys-diary',
        name: 'Warboys Diary & Community Events',
        url: 'https://www.warboysparishcouncil.gov.uk/our-community/warboys-diary/'
      });

      const items = await source.extract({ includeMockFallback: true });
      assert.ok(items.length > 0, 'Events source must extract items');

      // 1. Verify Direct PDF Link (not landing page)
      const pdfItem = items.find(i => i.url.endsWith('.pdf'));
      assert.ok(pdfItem, 'Items from Warboys Diary must link directly to the specific issue PDF URL');
      assert.ok(!pdfItem.url.endsWith('/warboys-diary/'), 'Link must NOT be the generic landing page URL');

      // 2. Verify Farmers Market event is NOT stamped with TODAY
      const marketItem = items.find(i => i.title.includes('Farmers Market'));
      if (marketItem) {
        assert.notStrictEqual(marketItem.eventCategory, 'TODAY', 'Farmers Market must NOT be stamped as TODAY');
        assert.ok(marketItem.eventTime.includes('5 September 2026') || marketItem.eventDate === '2026-09-05', 'Farmers Market must be scheduled for upcoming date');
      }

      // 3. Verify Page 9 Future November Events
      const quizItem = items.find(i => i.title.includes('Christmas Quiz'));
      const switchOnItem = items.find(i => i.title.includes('Christmas Lighting Switch On'));

      assert.ok(quizItem, 'Must extract 27 Nov Christmas Quiz from Page 9 table');
      assert.ok(switchOnItem, 'Must extract 28 Nov Christmas Lighting Switch On from Page 9 table');
      assert.strictEqual(quizItem.eventDate, '2026-11-27', 'Christmas Quiz must be dated 2026-11-27');
      assert.strictEqual(switchOnItem.eventDate, '2026-11-28', 'Christmas Switch On must be dated 2026-11-28');
    });
  });

  describe('3. Pre-Filtering & Retention Rules (scripts/utils/pre-filter.js)', () => {
    test('retains governance items up to 60 days and prioritizes high-signal items', () => {
      const mockNow = new Date('2026-08-15T12:00:00.000Z');

      const rawItems = [
        {
          id: 'gov-45-days-old',
          title: 'Council Minutes: Flaxon Walk Bay',
          content: 'Parking bay update',
          url: 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/04-mn-13.07.26.docx',
          date: '2026-07-01T12:00:00.000Z',
          category: 'Village News & Governance',
          sourceId: 'warboys-parish',
          sourceName: 'Warboys Parish Council'
        },
        {
          id: 'rss-45-days-old',
          title: 'Old Regional News Story',
          content: 'Old generic story',
          url: 'https://news.google.com/...',
          date: '2026-07-01T12:00:00.000Z',
          category: 'News',
          sourceId: 'google-news',
          sourceName: 'Google News'
        }
      ];

      const filtered = preFilterItems(rawItems, {}, mockNow);
      const govFiltered = filtered.find(i => i.id === 'gov-45-days-old');
      const rssFiltered = filtered.find(i => i.id === 'rss-45-days-old');

      assert.ok(govFiltered, 'Governance items must be preserved up to 60 days past meeting date');
      assert.strictEqual(rssFiltered, undefined, 'Generic RSS news > 30 days old must be filtered out');
    });
  });

  describe('4. Deterministic Component Rendering & Categorization (template-renderer.js)', () => {
    test('renders 4 distinct section blocks with top calendar banner in Governance', () => {
      const briefingData = {
        events: [{
          id: 'evt-1',
          title: 'Summer Fete',
          eventTime: 'Saturday 20 August • 10:00 AM',
          eventCategory: 'UPCOMING',
          venue: 'Village Green',
          content: 'Annual summer fete.',
          url: 'https://example.com/fete.pdf',
          sourceName: 'Warboys Diary'
        }],
        news: [{
          id: 'news-1',
          title: 'Community Fund Grant',
          content: 'Village hall receives grant.',
          date: '2026-08-14T12:00:00.000Z',
          url: 'https://example.com/grant',
          sourceName: 'The Hunts Post'
        }],
        governance: [{
          id: 'gov-1',
          title: 'Parish Council Governance: Parking Bay',
          content: 'Bay finished early.',
          date: '2026-07-10T12:00:00.000Z',
          url: 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/04-mn-13.07.26.docx',
          sourceName: 'Warboys Parish Council'
        }],
        planning: [{
          id: 'plan-1',
          title: 'Extension at 12 High Street',
          address: '12 High Street, Warboys',
          content: 'Erection of single-storey extension.',
          statusCategory: 'NEW',
          statusLabel: 'New Application',
          badgeClass: 'badge-new',
          url: 'https://publicaccess.huntingdonshire.gov.uk/...',
          sourceName: 'HDC Planning'
        }]
      };

      const html = renderFullBriefingHtml(briefingData, 'Warboys', 'Cambridgeshire');

      assert.ok(html.includes('📅 What\'s On'), 'Must contain Block 1: What\'s On header');
      assert.ok(html.includes('📰 Village News'), 'Must contain Block 2: Village News header');
      assert.ok(html.includes('🏛️ Governance & Parish Council'), 'Must contain Block 3: Governance header');
      assert.ok(html.includes('🏗️ Planning & Development'), 'Must contain Block 4: Planning header');
      assert.ok(html.includes('https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list'), 'Governance block MUST contain official meeting calendar link banner');
    });

    test('prevents governance items mentioning Local Plan from being misclassified into Planning', () => {
      const agent = new BriefingAgent({});
      const items = [
        {
          id: 'gov-local-plan',
          title: 'County Council Reports £60m SEND Overspend; HDC Local Plan Consultation',
          content: 'Parish council discussion on Local Plan',
          category: 'Village News & Governance',
          sourceId: 'warboys-parish',
          sourceName: 'Warboys Parish Council',
          date: '2026-07-10T12:00:00.000Z',
          url: 'https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/04-mn-13.07.26.docx'
        },
        {
          id: 'real-plan-app',
          title: 'Proposed 5 Dwellings',
          proposal: 'Erection of 5 dwellings',
          category: 'Planning & Development',
          sourceId: 'hdc-planning',
          sourceName: 'HDC Planning',
          statusCategory: 'NEW',
          date: '2026-08-10T12:00:00.000Z',
          url: 'https://publicaccess.huntingdonshire.gov.uk/...'
        }
      ];

      const grouped = agent.groupItemsFallback(items);

      assert.strictEqual(grouped.planning.length, 1, 'Only HDC Planning items should be in Planning section');
      assert.strictEqual(grouped.planning[0].id, 'real-plan-app', 'Real planning application must be in Planning section');
      assert.strictEqual(grouped.governance[0].id, 'gov-local-plan', 'Governance report mentioning Local Plan must remain in Governance section');
    });
  });

  describe('5. Persistent Document Processing Cache & County Council Source', () => {
    test('stores and retrieves cached document extraction items', () => {
      const testDocUrl = 'https://cambridgeshire.cmis.uk.com/test-doc-123';
      const mockItems = [{ id: 'test-item-1', title: 'Test Cached Governance Report' }];

      setCachedDocument(testDocUrl, mockItems);

      const cached = getCachedDocument(testDocUrl);
      assert.ok(Array.isArray(cached), 'Cached document entry must return an array');
      assert.strictEqual(cached.length, 1, 'Should return 1 cached item');
      assert.strictEqual(cached[0].title, 'Test Cached Governance Report', 'Title must match cached value');
    });

    test('extracts Cambridgeshire County Council committee decisions', async () => {
      const source = new CountyCouncilSource({
        id: 'cambs-county',
        name: 'Cambridgeshire County Council',
        url: 'https://cambridgeshire.cmis.uk.com/ccc_live/'
      });

      const items = await source.extract({ includeMockFallback: true });
      assert.ok(Array.isArray(items), 'County Council source must return an array');
      assert.ok(items.length > 0, 'Should extract County Council items');

      const highwaysItem = items.find(i => i.sourceName === 'Cambridgeshire County Council');
      assert.ok(highwaysItem, 'Must contain Cambridgeshire County Council item');
      assert.strictEqual(highwaysItem.sourceId, 'cambs-county', 'sourceId must be cambs-county');
    });
  });

  describe('6. Warboys Primary Academy (WPA) Sway REST Parser & School Subpage', () => {
    test('extracts Sway ID from Microsoft Sway URLs', () => {
      const id1 = extractSwayId('https://sway.cloud.microsoft/MLTtAeuJheXv3QNm?ref=Link');
      const id2 = extractSwayId('https://sway.office.com/MLTtAeuJheXv3QNm');

      assert.strictEqual(id1, 'MLTtAeuJheXv3QNm', 'Must extract Sway ID MLTtAeuJheXv3QNm');
      assert.strictEqual(id2, 'MLTtAeuJheXv3QNm', 'Must extract Sway ID MLTtAeuJheXv3QNm');
    });

    test('parses Sway newsletter announcements and dates for your diary with year group badges', async () => {
      const testSwayUrl = 'https://sway.cloud.microsoft/MLTtAeuJheXv3QNm?ref=Link';
      const parsed = await parseSwayNewsletter(testSwayUrl);

      assert.ok(parsed, 'Sway parser must return structured data');
      assert.strictEqual(parsed.swayId, 'MLTtAeuJheXv3QNm', 'SwayId must match');
      assert.ok(Array.isArray(parsed.announcements), 'Announcements must be an array');
      assert.ok(Array.isArray(parsed.diaryEvents), 'Diary events must be an array');

      // Verify targeted year group badges (R to Y6)
      const bikeability = parsed.diaryEvents.find(e => e.title.includes('Bikeability'));
      assert.ok(bikeability, 'Must extract Bikeability event');
      assert.deepStrictEqual(bikeability.yearGroups, ['Y5', 'Y6'], 'Bikeability targeted year groups must be Y5, Y6');

      const photos = parsed.diaryEvents.find(e => e.title.includes('Photos'));
      assert.ok(photos, 'Must extract School Photos event');
      assert.strictEqual(photos.yearGroups.length, 7, 'Photos event must apply to R and Y1-Y6 (7 year groups)');
    });

    test('extracts WPA items and Parent Forum minutes from WpaSource', async () => {
      const source = new WpaSource({
        id: 'wpa-school',
        name: 'Warboys Primary Academy',
        url: 'https://www.wpa.education/parents/letters-newsletters'
      });

      const items = await source.extract({ includeMockFallback: true });
      assert.ok(Array.isArray(items), 'WpaSource must return an array of items');
      assert.ok(items.length > 0, 'Should extract items from WPA source');

      const forumItem = items.find(i => i.title.includes('Parent Forum'));
      assert.ok(forumItem, 'Must extract Parent Forum meeting minutes item');
      assert.strictEqual(forumItem.sourceId, 'wpa-school', 'sourceId must be wpa-school');
    });
  });

});
