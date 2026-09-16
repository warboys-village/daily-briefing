const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseDocxFromUrl } = require('../scripts/utils/docx-parser');
const EventsSource = require('../scripts/sources/events-source');
const ParishCouncilSource = require('../scripts/sources/parish-council-source');
const CountyCouncilSource = require('../scripts/sources/county-council-source');
const WpaSource = require('../scripts/sources/wpa-source');
const { parseSwayNewsletter, extractSwayId, extractSwaySections } = require('../scripts/utils/wpa-sway-parser');
const { saveSchoolAnnouncements, loadSchoolAnnouncements } = require('../scripts/utils/school-announcements-store');
const { getCachedDocument, setCachedDocument, loadCache } = require('../scripts/utils/processed-doc-cache');
const { generateIcs, formatIcsDate } = require('../scripts/utils/ics-generator');
const { preFilterItems, isDeathNotice } = require('../scripts/utils/pre-filter');
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
      assert.strictEqual(filtered.length, 1, 'High priority governance item 45 days old must be retained while generic news is dropped');
      assert.strictEqual(filtered[0].id, 'gov-45-days-old', 'Retained item must be governance item');
    });

    test('filters out death notices and obituary columns from RSS feeds', () => {
      const mockNow = new Date('2026-08-15T12:00:00.000Z');

      const rawItems = [
        {
          id: 'death-notice-1',
          title: 'MEGAN IRENE STEPHENS',
          content: 'MEGAN IRENE STEPHENS The Hunts Post',
          url: 'https://news.google.com/rss/articles/CBMic0FVX3lx...',
          date: '2026-08-12T12:00:00.000Z',
          category: 'News',
          sourceId: 'hunts-post',
          sourceName: 'The Hunts Post News'
        },
        {
          id: 'real-news-1',
          title: 'Caravan park near village nature reserve could become traveller site',
          content: 'Local planning proposals.',
          url: 'https://news.google.com/rss/articles/CBMilwFBVV95cU...',
          date: '2026-08-14T12:00:00.000Z',
          category: 'News',
          sourceId: 'hunts-post',
          sourceName: 'The Hunts Post News'
        }
      ];

      const filtered = preFilterItems(rawItems, {}, mockNow);
      assert.strictEqual(filtered.length, 1, 'Death notice must be filtered out');
      assert.strictEqual(filtered[0].id, 'real-news-1', 'Only real news item must be retained');
    });

    test('filters out death notices and obituary columns from RSS feeds', () => {
      const items = [
        { title: 'MEGAN IRENE STEPHENS - The Hunts Post', content: '', url: 'https://example.com/1' },
        { title: 'MEGAN IRENE STEPHENS - huntspost.co.uk', content: 'MEGAN IRENE STEPHENS huntspost.co.uk', url: 'https://news.google.com/rss/articles/123' },
        { title: 'Stephens, Megan Irene, 85', content: 'Funeral notice for family.', url: 'https://www.huntspost.co.uk/announcements/456' },
        { title: 'JOHN SMITH.', content: '', url: 'https://example.com/3' },
        { title: 'Warboys Parish Council Meeting Scheduled', content: 'Normal governance notice.', url: 'https://example.com/4', sourceId: 'warboys-parish' }
      ];

      const filtered = preFilterItems(items);
      assert.strictEqual(filtered.length, 1, 'Must filter out all death notice variants including domain suffixes');
      assert.strictEqual(filtered[0].title, 'Warboys Parish Council Meeting Scheduled');
    });

    test('strips leading "Share Share" social sharing UI fluff and filesize noise from article content', () => {
      const raw = [{
        title: 'Warboys School Bulletin8817KB - The Hunts Post',
        content: 'Share Share Facebook Twitter WhatsApp Firefighters responded quickly to the incident.',
        url: 'https://www.huntspost.co.uk/sample',
        sourceId: 'hunts-post'
      }];
      const filtered = preFilterItems(raw);
      assert.strictEqual(filtered.length, 1);
      assert.ok(!filtered[0].title.includes('8817KB'), 'Title must not include attachment file sizes');
      assert.ok(!filtered[0].content.startsWith('Share'), 'Content must not start with Share');
      assert.ok(filtered[0].content.startsWith('Firefighters'), 'Content must start cleanly with real article text');
    });

    test('verifies isDeathNotice function exports and filters obituary patterns', () => {
      assert.strictEqual(isDeathNotice({ title: 'SMITH, John (84)', content: '', url: 'https://example.com' }), true);
      assert.strictEqual(isDeathNotice({ title: 'Warboys Summer Carnival', content: 'Fun for all', url: 'https://example.com' }), false);
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

      assert.ok(html.includes('What\'s On'), 'Must contain Block 1: What\'s On header');
      assert.ok(html.includes('Warboys News') || html.includes('Village News'), 'Must contain Block 2: News header');
      assert.ok(html.includes('Governance & Parish Council'), 'Must contain Block 3: Governance header');
      assert.ok(html.includes('Planning & Development'), 'Must contain Block 4: Planning header');
      assert.ok(html.includes('https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list'), 'Governance block MUST contain official meeting calendar link banner');
    });

    test('recovers empty news array using fallback in BriefingAgent', () => {
      const agent = new BriefingAgent({ villageName: 'Warboys' });
      const items = [
        {
          id: 'news-fallback-1',
          title: 'Warboys Library Celebrates New Community Garden',
          content: 'Volunteers completed work on the community garden.',
          url: 'https://example.com/library-garden',
          date: '2026-08-15T10:00:00.000Z',
          category: 'News',
          sourceId: 'fowl-library',
          sourceName: 'Friends of Warboys Library'
        }
      ];

      const grouped = agent.groupItemsFallback(items);
      assert.strictEqual(grouped.news.length, 1, 'Fallback must recover news items');
      assert.strictEqual(grouped.news[0].id, 'news-fallback-1');
    });

    test('excludes internal school bulletins from main village news', () => {
      const agent = new BriefingAgent({ villageName: 'Warboys' });
      
      const internalBulletin = {
        title: "Warboys Primary Academy: Headteacher Weekly Message8817KB",
        content: "Internal weekly message and attendance awards.",
        sourceId: "wpa-school",
        sourceName: "Warboys Primary Academy",
        category: "School News"
      };

      const communityEvent = {
        title: "Warboys Primary Academy Annual Summer Fete & Community Fair",
        content: "Open to all village residents and families.",
        sourceId: "wpa-school",
        sourceName: "Warboys Primary Academy",
        category: "School News"
      };

      assert.strictEqual(agent.isWholeVillageSchoolItem(internalBulletin), false, 'Internal school bulletin must be excluded from village news');
      assert.strictEqual(agent.isWholeVillageSchoolItem(communityEvent), true, 'Community-wide school event must be included');
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
      const os = require('os');
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'village-doc-cache-test-'));

      try {
        const testDocUrl = 'https://cambridgeshire.cmis.uk.com/test-doc-123';
        const mockItems = [{ id: 'test-item-1', title: 'Test Cached Governance Report' }];

        setCachedDocument(testDocUrl, mockItems, { dataDir: testDir });

        const cached = getCachedDocument(testDocUrl, { dataDir: testDir });
        assert.ok(Array.isArray(cached), 'Cached document entry must return an array');
        assert.strictEqual(cached.length, 1, 'Should return 1 cached item');
        assert.strictEqual(cached[0].title, 'Test Cached Governance Report', 'Title must match cached value');
      } finally {
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      }
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
      const allPhotoYears = new Set(parsed.diaryEvents.filter(e => e.title.includes('Photo')).flatMap(e => e.yearGroups.filter(y => y !== 'All Years')));
      assert.strictEqual(allPhotoYears.size, 7, 'Photos events must collectively cover R and Y1-Y6 (7 year groups)');
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

    test('filters internal WPA items out of main village news unless of whole-village interest', () => {
      const BriefingAgent = require('../scripts/agent/briefing-agent');
      const agent = new BriefingAgent({ villageName: 'Warboys' });
      
      const internalItem = {
        title: "Headteacher's Weekly Message & School Updates",
        content: "Weekly attendance awards and class notices.",
        sourceId: "wpa-school",
        sourceName: "Warboys Primary Academy"
      };

      const wholeVillageItem = {
        title: "WPA Annual Summer Fete & Community Car Boot Sale",
        content: "Open to the whole village community.",
        sourceId: "wpa-school",
        sourceName: "Warboys Primary Academy"
      };

      assert.strictEqual(agent.isWholeVillageWpaItem(internalItem), false, 'Internal WPA item must be excluded from village news');
      assert.strictEqual(agent.isWholeVillageWpaItem(wholeVillageItem), true, 'Whole-village WPA event must be included');
    });

    test('dynamically extracts 11th September Sway newsletter sections without hardcoded mock fallbacks', async () => {
      const url = 'https://sway.cloud.microsoft/dsx9RpWqJtAljtqt?ref=Link';
      const parsed = await parseSwayNewsletter(url);

      assert.ok(parsed, 'Must successfully parse 11th September Sway newsletter');
      assert.strictEqual(parsed.swayId, 'dsx9RpWqJtAljtqt');
      assert.ok(parsed.title.includes('11th September 2026'), 'Title must contain issue date 11th September 2026');
      assert.ok(Array.isArray(parsed.announcements), 'Announcements must be an array');
      assert.ok(parsed.announcements.length >= 5, 'Must extract at least 5 announcements dynamically');

      const headteacherMsg = parsed.announcements.find(a => a.title.toLowerCase().includes('headteacher'));
      assert.ok(headteacherMsg, 'Must extract Headteacher message');
      assert.ok(headteacherMsg.content.includes('first full week back'), 'Headteacher message must contain real paragraph text');

      const attendanceMsg = parsed.announcements.find(a => a.title.toLowerCase().includes('attendance'));
      assert.ok(attendanceMsg, 'Must extract Attendance update');
      assert.ok(attendanceMsg.content.includes('Pizza Parties') || attendanceMsg.content.includes('TAPP'), 'Attendance update must mention TAPP Pizza Parties');

      const youngCarersMsg = parsed.announcements.find(a => a.title.toLowerCase().includes('young carers'));
      assert.ok(youngCarersMsg, 'Must extract Young Carers announcement');
      assert.ok(youngCarersMsg.url.includes('forms.cloud.microsoft'), 'Young Carers form link must point to Microsoft Form');

      const inhalersMsg = parsed.announcements.find(a => a.title.toLowerCase().includes('reminders') || a.content.toLowerCase().includes('inhalers'));
      assert.ok(inhalersMsg, 'Must extract Inhalers and School Reminders section');
    });

    test('persists and loads school announcements to dedicated store', () => {
      const os = require('os');
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-ann-test-'));

      try {
        const mockData = {
          activeNewsletterUrl: 'https://sway.cloud.microsoft/dsx9RpWqJtAljtqt?ref=Link',
          newsletterTitle: 'WPA Weekly News - Friday 11th September 2026',
          newsletterDate: '11th September 2026',
          announcements: [
            { id: 'ann-1', title: 'Headteacher Message', content: 'Welcome back.' }
          ]
        };

        saveSchoolAnnouncements('wpa', mockData, { dataDir: testDir });
        const loaded = loadSchoolAnnouncements('wpa', { dataDir: testDir });

        assert.ok(loaded, 'Loaded announcements must not be null');
        assert.strictEqual(loaded.activeNewsletterUrl, mockData.activeNewsletterUrl);
        assert.strictEqual(loaded.newsletterTitle, mockData.newsletterTitle);
        assert.strictEqual(loaded.announcements.length, 1);
        assert.strictEqual(loaded.announcements[0].title, 'Headteacher Message');
      } finally {
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      }
    });

    test('binds dynamic school announcements and active newsletter URL into village data', () => {
      const villageFn = require('../src/_data/village');
      const villageData = villageFn();

      assert.ok(villageData, 'Village data must be generated');
      assert.ok(Array.isArray(villageData.schools), 'Schools array must exist');
      const wpa = villageData.schools.find(s => s.slug === 'wpa' || s.name.includes('Warboys Primary'));
      assert.ok(wpa, 'Warboys Primary Academy must be present in village schools');
      assert.strictEqual(wpa.newsletterUrl, 'https://sway.cloud.microsoft/dsx9RpWqJtAljtqt?ref=Link', 'Must bind active 11th September newsletter URL');
      assert.ok(Array.isArray(wpa.announcements), 'WPA announcements must be an array');
      assert.ok(wpa.announcements.length >= 5, 'WPA must have at least 5 dynamic announcements');
    });
  });

  describe('7. iCalendar (.ics) Subscriptions Generator & 7 Year Feeds', () => {
    test('formats dates into YYYYMMDD string for iCal headers', () => {
      assert.strictEqual(formatIcsDate('2026-09-03'), '20260903', 'Must format 2026-09-03 to 20260903');
    });

    test('generates valid RFC 5545 iCalendar content structure', () => {
      const mockEvents = [
        {
          id: 'test-evt-1',
          title: 'Warboys Farmers Market',
          eventDate: '2026-09-05',
          venue: 'Warboys Community Centre',
          content: 'Local produce market.'
        }
      ];

      const ics = generateIcs('Warboys Village Events', mockEvents);
      assert.ok(ics.includes('BEGIN:VCALENDAR'), 'Must start with BEGIN:VCALENDAR');
      assert.ok(ics.includes('X-WR-CALNAME:Warboys Village Events'), 'Must include calendar name header');
      assert.ok(ics.includes('BEGIN:VEVENT'), 'Must contain VEVENT block');
      assert.ok(ics.includes('SUMMARY:Warboys Farmers Market'), 'Must include event summary');
      assert.ok(ics.includes('DTSTART;VALUE=DATE:20260905'), 'Must include start date 20260905');
      assert.ok(ics.includes('END:VCALENDAR'), 'Must end with END:VCALENDAR');
    });

    test('verifies 7 WPA year group dataset definition including Reception/Early Years', () => {
      const wpaYears = require('../src/_data/wpa_years.json');
      assert.strictEqual(wpaYears.length, 7, 'Must define 7 year groups');
      
      const rGroup = wpaYears.find(y => y.code === 'R');
      assert.ok(rGroup, 'Reception group must exist');
      assert.strictEqual(rGroup.label, 'Reception/Early Years', 'Reception group label must be Reception/Early Years');
      assert.strictEqual(rGroup.slug, 'r', 'Reception group slug must be r');
    });
  });

  describe('8. School Calendar Store & Multi-Term Diary Retention', () => {
    const { saveSchoolCalendar, isEventCancelled } = require('../scripts/utils/school-calendar-store');
    const { VERIFIED_2026_2027_DIARY_EVENTS } = require('../scripts/utils/wpa-sway-parser');

    test('retains events from previous newsletters and merges new events', () => {
      const prevEvents = [
        {
          id: 'wpa-evt-2026-09-03',
          eventDate: '2026-09-03',
          title: 'Autumn Term Begins (All Pupils Return)',
          yearGroups: ['All Years']
        }
      ];
      const newEvents = [
        {
          id: 'wpa-evt-2026-09-18',
          eventDate: '2026-09-18',
          title: 'Year 5 & Year 6 Bikeability Training',
          yearGroups: ['Y5', 'Y6']
        }
      ];

      const merged = saveSchoolCalendar('test-school', [...prevEvents, ...newEvents], {
        includePast: true,
        dataDir: 'src/_data'
      });

      const termBegins = merged.find(e => e.eventDate === '2026-09-03');
      const bikeability = merged.find(e => e.eventDate === '2026-09-18');
      assert.ok(termBegins, 'Autumn Term Begins must be retained');
      assert.ok(bikeability, 'Bikeability must be retained');

      // Cleanup test file
      const testCalFile = path.join(__dirname, '..', 'src', '_data', 'test-school_calendar.json');
      if (fs.existsSync(testCalFile)) fs.unlinkSync(testCalFile);
    });

    test('detects cancelled events from newsletter notices', () => {
      const isCancelled1 = isEventCancelled('Year 5 & Year 6 Bikeability Training', [
        'Important notice: Due to bad weather, Bikeability training has been postponed until further notice.'
      ]);
      const isCancelled2 = isEventCancelled('Meet the Teacher - Years 5 & 6', [
        'Welcome back to school!'
      ]);

      assert.strictEqual(isCancelled1, true, 'Bikeability must be flagged as cancelled');
      assert.strictEqual(isCancelled2, false, 'Meet the Teacher must not be cancelled');
    });

    test('does not falsely cancel events when newsletter announcement mentions cancelling dinner bookings', () => {
      const dinnerNotice = [
        'School Dinners - Reminder: We have noticed an increase in school dinners being booked via the app, but children then arriving with a packed lunch instead. We kindly ask that if your plans change and your child no longer requires a school meal, you cancel the booking in advance or let the office know. Our kitchen team prepares meals ahead of the day based on the numbers provided, so any unclaimed dinners unfortunately result in unnecessary food waste. We are currently monitoring this over the first few weeks back with a view to begin charging for missed meals where bookings have not been cancelled. Inform your child\'s class teacher if needed.'
      ];

      assert.strictEqual(isEventCancelled('Meet the Teacher - Years 5 & 6', dinnerNotice), false);
      assert.strictEqual(isEventCancelled('Meet the Teacher - EYFS', dinnerNotice), false);
      assert.strictEqual(isEventCancelled('Caythorpe 2026 Parents Meeting', dinnerNotice), false);
      assert.strictEqual(isEventCancelled('Christmas Jumper Day & Christmas Lunch', dinnerNotice), false);
      assert.strictEqual(isEventCancelled('Class Photographs', dinnerNotice), false);
      assert.strictEqual(isEventCancelled('Autumn Term Begins (All Pupils Return)', dinnerNotice), false);
    });

    test('recovers uncancelled events and cleans up stale CANCELLED status and notes prefixes', () => {
      const corruptedEvents = [
        {
          id: 'wpa-evt-meet-teacher',
          eventDate: '2026-09-14',
          title: 'Meet the Teacher - Years 1 & 2',
          cancelled: true,
          status: 'CANCELLED',
          notes: '[CANCELLED] Classroom session for parents and teachers.'
        }
      ];

      const testDir = path.join(__dirname, '..', 'src', '_data', 'test-school-recover');
      try {
        const saved = saveSchoolCalendar('test-recover', corruptedEvents, {
          cancellationNotices: ['Welcome to the new school year!'],
          includePast: true,
          dataDir: testDir
        });

        const recovered = saved.find(e => e.id === 'wpa-evt-meet-teacher');
        assert.ok(recovered, 'Recovered event must exist');
        assert.strictEqual(recovered.cancelled, false, 'Event must be uncancelled');
        assert.strictEqual(recovered.status, undefined, 'Status CANCELLED must be deleted');
        assert.strictEqual(recovered.notes, 'Classroom session for parents and teachers.', 'Prefix [CANCELLED] must be stripped');
      } finally {
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      }
    });

    test('verifies verified 2026-2027 diary has 33 events with correct year groups', () => {
      assert.strictEqual(VERIFIED_2026_2027_DIARY_EVENTS.length, 33, 'Must contain 33 events');

      const yv = VERIFIED_2026_2027_DIARY_EVENTS.find(e => e.title.includes('Young Voices'));
      assert.ok(yv, 'Young Voices must exist');
      assert.deepStrictEqual(yv.yearGroups, ['Y5', 'Y6'], 'Young Voices must be for Y5 and Y6');

      const space = VERIFIED_2026_2027_DIARY_EVENTS.find(e => e.title.includes('National Space Centre'));
      assert.ok(space, 'National Space Centre must exist');
      assert.deepStrictEqual(space.yearGroups, ['Y5', 'Y6'], 'National Space Centre must be for Y5 and Y6');

      const photos = VERIFIED_2026_2027_DIARY_EVENTS.find(e => e.title.includes('KS1 Individual Photos'));
      assert.ok(photos, 'KS1 Photos must exist');
      assert.ok(photos.yearGroups.includes('Y6'), 'KS1 family photos must include Y6 siblings');

      const assembly = VERIFIED_2026_2027_DIARY_EVENTS.find(e => e.title === 'Achievement Assembly');
      assert.ok(assembly, 'Achievement Assembly must exist');
      assert.deepStrictEqual(assembly.yearGroups, ['All Years'], 'Achievement assembly must be for All Years');
    });
  });

  describe('9. Isolation of School Events from Village Calendar Store & Feeds', () => {
    const { saveCalendar } = require('../scripts/utils/events-calendar-store');
    const BriefingComposer = require('../scripts/agent/briefing-composer');

    test('saveCalendar rejects internal school diary events and retains community events', () => {
      const now = new Date('2026-09-05T10:00:00Z');
      const incoming = [
        {
          id: 'wpa-meet-teacher',
          title: 'Meet the Teacher - Years 5 & 6',
          category: 'School Diary',
          school: 'wpa',
          eventDate: '2026-09-09'
        },
        {
          id: 'wpa-bikeability',
          title: 'Year 5 & Year 6 Bikeability Training',
          category: 'School Diary',
          school: 'wpa',
          eventDate: '2026-09-18'
        },
        {
          id: 'fowl-coffee',
          title: 'Warboys Library Fortnightly Coffee Morning',
          category: 'Community Events',
          eventDate: '2026-09-05'
        },
        {
          id: 'wpa-summer-fete',
          title: 'WPA Annual Summer Fete & Community Fair',
          category: 'School News',
          school: 'wpa',
          isWholeVillage: true,
          eventDate: '2026-09-20'
        }
      ];

      const testDir = path.join(__dirname, '..', 'src', '_data', 'test-calendar-isolation');
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

      const saved = saveCalendar(incoming, { dataDir: testDir, nowDate: now });

      if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

      const meetTeacher = saved.find(e => e.id === 'wpa-meet-teacher');
      const bikeability = saved.find(e => e.id === 'wpa-bikeability');
      const coffee = saved.find(e => e.id === 'fowl-coffee');
      const fete = saved.find(e => e.id === 'wpa-summer-fete');

      assert.strictEqual(meetTeacher, undefined, 'Internal school event must not be saved to village calendar');
      assert.strictEqual(bikeability, undefined, 'Internal school event must not be saved to village calendar');
      assert.ok(coffee, 'Community event must be saved to village calendar');
      assert.ok(fete, 'Whole village school fete must be saved to village calendar');
    });

    test('BriefingComposer.composeContent excludes internal school events from Whats On', () => {
      const composer = new BriefingComposer({ placeName: 'Warboys' });
      const now = new Date('2026-09-05T10:00:00Z');
      const content = composer.composeContent({
        nowDate: now,
        dataDir: 'src/_data/warboys'
      });

      assert.ok(Array.isArray(content.events), 'Briefing must contain events array');
      const internalSchoolEvt = content.events.find(e =>
        e.title.includes('Meet the Teacher') ||
        e.title.includes('Bikeability') ||
        e.title.includes('Flu Vaccinations') ||
        e.category === 'School Diary'
      );
      assert.strictEqual(internalSchoolEvt, undefined, 'Whats On section must not contain internal school diary events');
    });

    test('src/_data/events_calendar.js excludes internal school events for Eleventy', () => {
      const eventsDataFn = require('../src/_data/events_calendar.js');
      const events = eventsDataFn();
      assert.ok(Array.isArray(events), 'events_calendar must return an array');
      const internalSchoolEvt = events.find(e =>
        e.category === 'School Diary' || (e.school && !e.isWholeVillage)
      );
      assert.strictEqual(internalSchoolEvt, undefined, 'events_calendar must exclude internal school events');
    });
  });

  describe('10. Eleventy School Diary Date Filtering & Temporal Boundaries', () => {
    const filters = {};
    const mockEleventyConfig = {
      addFilter: (name, fn) => { filters[name] = fn; },
      addCollection: () => {},
      addPassthroughCopy: () => {},
      setServerOptions: () => {},
      ignores: { add: () => {} }
    };
    require('../.eleventy.js')(mockEleventyConfig);

    const testEvents = [
      { id: 'past-10', date: '2026-09-03', title: 'Autumn Term Begins' },
      { id: 'past-1', date: '2026-09-12', title: 'Yesterday Event' },
      { id: 'today', date: '2026-09-13', title: 'Today Event' },
      { id: 'tomorrow', date: '2026-09-14', title: 'Meet the Teacher - Years 1 & 2' },
      { id: 'in-30-days', date: '2026-10-10', title: 'October Workshop' },
      { id: 'in-40-days', date: '2026-10-25', title: 'Autumn Half Term' },
      { id: 'no-date', title: 'Undated Note' }
    ];

    test('filterKeyDatesImmediate strictly excludes past events and includes today and upcoming within range', () => {
      const immediate = filters.filterKeyDatesImmediate(testEvents, '2026-09-13', 35);

      const titles = immediate.map(e => e.title);
      assert.ok(!titles.includes('Autumn Term Begins'), 'Past event (10 days ago) must be excluded');
      assert.ok(!titles.includes('Yesterday Event'), 'Past event (yesterday) must be excluded');
      assert.ok(!titles.includes('Undated Note'), 'Undated items must be excluded');
      assert.ok(titles.includes('Today Event'), 'Event occurring today must be included');
      assert.ok(titles.includes('Meet the Teacher - Years 1 & 2'), 'Upcoming event tomorrow must be included');
      assert.ok(titles.includes('October Workshop'), 'Upcoming event within 35 days must be included');
      assert.ok(!titles.includes('Autumn Half Term'), 'Event > 35 days away must be excluded from immediate dates');
    });

    test('filterKeyDatesFuture returns events strictly beyond immediate window', () => {
      const future = filters.filterKeyDatesFuture(testEvents, '2026-09-13', 35);

      const titles = future.map(e => e.title);
      assert.ok(!titles.includes('Autumn Term Begins'), 'Past event must be excluded from future');
      assert.ok(!titles.includes('Today Event'), 'Today event must be excluded from future');
      assert.ok(!titles.includes('Meet the Teacher - Years 1 & 2'), 'Immediate event must be excluded from future');
      assert.ok(!titles.includes('October Workshop'), 'Event within 35 days must be excluded from future');
      assert.ok(titles.includes('Autumn Half Term'), 'Event beyond 35 days must be included in future');
    });

    test('filterKeyDatesPast returns events strictly before reference date', () => {
      const past = filters.filterKeyDatesPast(testEvents, '2026-09-13');

      const titles = past.map(e => e.title);
      assert.ok(titles.includes('Autumn Term Begins'), 'Event from Sept 3 must be in past');
      assert.ok(titles.includes('Yesterday Event'), 'Event from Sept 12 must be in past');
      assert.ok(!titles.includes('Today Event'), 'Today event must not be in past');
      assert.ok(!titles.includes('Meet the Teacher - Years 1 & 2'), 'Tomorrow event must not be in past');
    });
  });

});

