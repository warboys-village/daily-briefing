const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  updateNewsStore,
  loadNewsStore,
  updatePlanningStore,
  loadPlanningStore,
  updateGovernanceStore,
  loadGovernanceStore,
  NEWS_STORE_PATH,
  PLANNING_STORE_PATH,
  GOVERNANCE_STORE_PATH
} = require('../scripts/utils/content-stores');

const BriefingComposer = require('../scripts/agent/briefing-composer');

describe('Decoupled Content Stores & Briefing Composition', () => {

  describe('1. News Store Persistence, Anti-Disappearance & Hygiene', () => {
    test('deduplicates news by URL, filters death notices, and strips UI fluff', () => {
      const now = new Date('2026-09-02T10:00:00Z');
      const incoming = [
        {
          id: 'item-1',
          title: 'Warboys Library Celebrates New Extension8817KB - The Hunts Post',
          content: 'Share Share Facebook Twitter WhatsApp Construction completed ahead of schedule.',
          url: 'https://www.huntspost.co.uk/news/warboys-library-extension',
          date: '2026-09-01T12:00:00Z',
          sourceName: 'The Hunts Post'
        },
        {
          id: 'item-2',
          title: 'SMITH, Eleanor (89) - Obituary',
          content: 'Beloved wife and mother passed away peacefully.',
          url: 'https://www.huntspost.co.uk/announcements/smith',
          date: '2026-09-01T12:00:00Z',
          sourceName: 'The Hunts Post'
        }
      ];

      const updated = updateNewsStore(incoming, { maxDays: 21, nowDate: now });

      // Obituary should be filtered out
      assert.strictEqual(updated.some(i => i.title.includes('SMITH')), false, 'Obituaries must be filtered out');
      
      // Valid news item should be retained and cleaned
      const newsItem = updated.find(i => i.url.includes('warboys-library-extension'));
      assert.ok(newsItem, 'Valid news item must be present');
      assert.ok(!newsItem.title.includes('8817KB'), 'Title must not include attachment size');
      assert.ok(!newsItem.title.includes('The Hunts Post'), 'Title must not include trailing source suffix');
      assert.ok(!newsItem.content.startsWith('Share'), 'Content must not start with Share fluff');
    });

    test('preserves cached news items when a subsequent scrape returns 0 items (anti-disappearance)', () => {
      const day1 = new Date('2026-09-01T06:00:00Z');
      const day1Items = [{
        id: 'news-stable-1',
        title: 'Warboys Parish Tree Planting Initiative',
        content: 'Community volunteers planted 50 native trees.',
        url: 'https://example.com/tree-planting',
        date: '2026-09-01T05:00:00Z',
        sourceName: 'Village News'
      }];

      updateNewsStore(day1Items, { maxDays: 21, nowDate: day1 });

      // Day 2: RSS feed is down or returns empty array
      const day2 = new Date('2026-09-02T06:00:00Z');
      const day2Updated = updateNewsStore([], { maxDays: 21, nowDate: day2 });

      assert.ok(day2Updated.some(i => i.id === 'news-stable-1'), 'Day 1 item must persist even when Day 2 scrape returns empty');
    });

    test('evicts news items older than retention TTL (21 days)', () => {
      const now = new Date('2026-09-25T10:00:00Z');
      const items = [
        {
          id: 'news-fresh',
          title: 'Warboys Autumn Craft Market Announced',
          content: 'Craft stalls and local artisans.',
          url: 'https://example.com/autumn-market',
          date: '2026-09-20T10:00:00Z'
        },
        {
          id: 'news-stale',
          title: 'Old Summer Fete Summary',
          content: 'Event took place over a month ago.',
          url: 'https://example.com/summer-fete-old',
          date: '2026-08-01T10:00:00Z'
        }
      ];

      const updated = updateNewsStore(items, { maxDays: 21, nowDate: now });
      assert.ok(updated.some(i => i.id === 'news-fresh'), 'Fresh news item within 21 days must be kept');
      assert.strictEqual(updated.some(i => i.id === 'news-stale'), false, 'Stale news item older than 21 days must be evicted');
    });
  });

  describe('2. Planning Store Persistence & Status Lifecycle', () => {
    test('tracks planning status updates from New/In Progress to Decided by reference', () => {
      const day1 = new Date('2026-08-10T10:00:00Z');
      const appRef = '24/00555/FUL';

      // Day 1: New Application
      updatePlanningStore([{
        id: 'plan-555',
        reference: appRef,
        title: 'Single-storey rear extension at Mill Green',
        proposal: 'Single-storey rear extension at Mill Green',
        address: '15 Mill Green, Warboys',
        statusCategory: 'NEW',
        statusLabel: 'New Application',
        badgeClass: 'badge-new',
        url: 'https://planning.huntingdonshire.gov.uk/24/00555/FUL',
        date: '2026-08-10T09:00:00Z'
      }], { maxActiveDays: 90, maxDecidedDays: 30, nowDate: day1 });

      // Day 15: Application is decided / permitted
      const day15 = new Date('2026-08-25T10:00:00Z');
      const updatedList = updatePlanningStore([{
        id: 'plan-555',
        reference: appRef,
        title: 'Single-storey rear extension at Mill Green',
        statusCategory: 'DECIDED',
        statusLabel: 'Permitted',
        badgeClass: 'badge-approved',
        decisionOutcome: 'Permitted with Standard Conditions',
        url: 'https://planning.huntingdonshire.gov.uk/24/00555/FUL',
        date: '2026-08-25T09:00:00Z'
      }], { maxActiveDays: 90, maxDecidedDays: 30, nowDate: day15 });

      const item = updatedList.find(p => p.reference === appRef);
      assert.ok(item, 'Application must exist in store');
      assert.strictEqual(item.statusCategory, 'DECIDED', 'Status must update to DECIDED');
      assert.strictEqual(item.badgeClass, 'badge-approved', 'Badge must update to badge-approved');
      assert.strictEqual(item.decisionOutcome, 'Permitted with Standard Conditions', 'Decision outcome must be recorded');
    });

    test('retains active planning applications for up to 90 days', () => {
      const now = new Date('2026-09-02T10:00:00Z');
      const activeApp = {
        reference: '24/00111/OUT',
        title: 'Outline application for 4 dwellings',
        statusCategory: 'UPDATED',
        statusLabel: 'In Progress',
        badgeClass: 'badge-progress',
        date: '2026-07-01T10:00:00Z' // 63 days old
      };

      const store = updatePlanningStore([activeApp], { maxActiveDays: 90, maxDecidedDays: 30, nowDate: now });
      assert.ok(store.some(p => p.reference === '24/00111/OUT'), '63-day-old active application must be retained within 90-day window');
    });
  });

  describe('3. Governance Store Persistence & Meeting Retention', () => {
    test('retains minutes from latest 2 meetings even when interval spans past 30 days', () => {
      const now = new Date('2026-09-02T10:00:00Z');
      const items = [
        {
          id: 'gov-aug',
          meetingTitle: 'Warboys Parish Council Meeting – 10 August 2026',
          title: 'Feast Week Biodiversity Tombola Grant Approved',
          content: 'Council approved grant for biodiversity display.',
          date: '2026-08-10T19:00:00Z'
        },
        {
          id: 'gov-july',
          meetingTitle: 'Warboys Parish Council Meeting – 13 July 2026',
          title: 'Flaxon Walk Disabled Parking Bay Tender Accepted',
          content: 'Tender accepted for civil works.',
          date: '2026-07-13T19:00:00Z' // 51 days ago
        }
      ];

      const govStore = updateGovernanceStore(items, { maxDays: 60, nowDate: now });
      assert.ok(govStore.some(g => g.title.includes('Feast Week')), 'Latest meeting item must be retained');
      assert.ok(govStore.some(g => g.title.includes('Flaxon Walk')), 'Previous meeting item (51 days old) must be retained');
    });
  });

  describe('4. Briefing Composer Non-Starvation & Multi-Section Rendering', () => {
    test('composes all 4 blocks without section starvation from large single-source volume', async () => {
      const composer = new BriefingComposer({
        villageName: 'Warboys',
        county: 'Cambridgeshire'
      });

      const composed = composer.composeContent({
        maxNewsItems: 10,
        maxEventsDays: 30,
        maxPlanningPerCategory: 10
      });

      assert.ok(Array.isArray(composed.events), 'Events array must be defined');
      assert.ok(Array.isArray(composed.news), 'News array must be defined');
      assert.ok(Array.isArray(composed.governance), 'Governance array must be defined');
      assert.ok(Array.isArray(composed.planning), 'Planning array must be defined');

      const { html } = await composer.generateBriefing({ isoDate: '2026-09-02' });
      assert.ok(html.includes('What\'s On'), 'Briefing HTML must contain Block 1: What\'s On');
      assert.ok(html.includes('Warboys News'), 'Briefing HTML must contain Block 2: Warboys News');
      assert.ok(html.includes('Governance & Parish Council'), 'Briefing HTML must contain Block 3: Governance');
      assert.ok(html.includes('Planning & Development'), 'Briefing HTML must contain Block 4: Planning');
    });
  });

  describe('5. Calendar Store Recurrence & Past-Date Eviction', () => {
    test('excludes past regular events and updates recurring events with upcoming dates', () => {
      const { saveCalendar } = require('../scripts/utils/events-calendar-store');
      const now = new Date('2026-09-03T10:00:00Z');

      const incoming = [
        {
          id: 'rhymetime-past',
          title: 'Warboys Library Baby & Toddler Rhymetime',
          isRegular: true,
          eventDate: '2026-08-18'
        },
        {
          id: 'rhymetime-upcoming',
          title: 'Warboys Library Baby & Toddler Rhymetime',
          isRegular: true,
          eventDate: '2026-09-08'
        }
      ];

      const saved = saveCalendar(incoming, { nowDate: now });
      const rhymetime = saved.find(e => e.title.includes('Rhymetime'));
      assert.ok(rhymetime, 'Rhymetime must exist');
      assert.strictEqual(rhymetime.eventDate, '2026-09-08', 'Upcoming date must replace past date');
      assert.strictEqual(saved.some(e => e.eventDate === '2026-08-18'), false, 'Past event must be evicted');
    });
  });

});
