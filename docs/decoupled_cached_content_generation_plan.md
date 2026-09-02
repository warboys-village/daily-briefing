# Implementation Plan: Decoupled Multi-Source Ingestion & Cached Content Composition

Transform the Village Daily content generation pipeline from a monolithic, ephemeral scrape with global item caps into a **decoupled, per-source caching and persistent domain store architecture**.

---

## 🎯 Goal Description

### The Problem in the Current Architecture
1. **Content Disappears Between Days**: If an RSS feed rotates out articles, a scraper encounters a transient network timeout, or a monthly council minutes document passes a strict `maxDays` cutoff, items that were present yesterday completely vanish today.
2. **Global Item Limit Bottleneck (`maxTotalItems`)**: In the current pipeline, all items from all 8 sources are dumped into a single `allRawItems` array, sliced down by a global item limit (previously 24, recently raised to 80), and fed into a single LLM prompt. If one source yields 30 items, it can crowd out and starve other critical sections (such as Village News or Governance).
3. **LLM Single-Prompt Fragility**: Forcing the LLM to process up to 80 diverse items (planning, minutes, events, news) in one monolithic turn causes context exhaustion, JSON truncation errors, and empty section arrays (e.g. `news: []`), necessitating brittle fallback recovery.
4. **Redundant Reprocessing**: Items that do not change for weeks (planning applications, monthly parish council minutes, upcoming events) are re-analyzed by the LLM every single day.

### The Proposed Architecture: Decoupled Ingestion & Cached Composition
Dealing with each data source separately and composing the site from persistent cached domain stores directly solves all of these issues:
- **Per-Source Processors**: Each source extracts, cleans, filters noise/death notices, and standardizes its own items independently.
- **Persistent Domain Stores**: Items are stored in persistent JSON data stores (`news_store.json`, `planning_store.json`, `governance_store.json`, and the existing `events_calendar.json`).
- **Domain-Specific Lifecycles (TTLs)**:
  - **Events**: Active until the event date passes (or permanent if regular).
  - **News**: Active for 14–30 days with rolling freshness deduplication.
  - **Planning**: Active for 60–90 days (until decided), with decided applications retained for 30 days post-decision.
  - **Governance**: Active until superseded by the subsequent meeting's minutes (retained up to 60 days).
- **Deterministic Site Composition**: The daily briefing is composed directly from the active cached stores via `template-renderer.js`. No sections can be crowded out, no items disappear due to transient feed issues, and generation takes < 50ms with 0 token waste.
- **Optional Editorial Intro**: A lightweight, optional LLM step can generate a concise 2–3 sentence "Daily Overview / Highlights" from the composed items without touching or risking the structured section cards.

```mermaid
flowchart TD
    subgraph Sources [Individual Data Sources]
        S_HuntsPost[Hunts Post RSS]
        S_Parish[Parish Council DOCX]
        S_County[County Council Decisions]
        S_PlanIt[PlanIt Planning API]
        S_Diary[Warboys Diary PDF]
        S_FOWL[FOWL Library Events & News]
        S_Scene[Village Scene Directory]
        S_WPA[WPA School Sway & Minutes]
    end

    subgraph Processors [Independent Domain Extractors & Cleaners]
        P_News[News Processor<br/>• Strip social share fluff & file sizes<br/>• 5-layer death notice filter<br/>• Article summary cache]
        P_Gov[Governance Processor<br/>• DOCX item extraction<br/>• Document cache lookup<br/>• Meeting date clustering]
        P_Plan[Planning Processor<br/>• PlanIt API deduplication<br/>• Status mapping New/Updated/Decided<br/>• Map URL generation]
        P_Evt[Events Processor<br/>• Event date parsing & validation<br/>• Regular vs one-off classification<br/>• Calendar deduplication]
        P_WPA[School Processor<br/>• Sway newsletter parser<br/>• Year-group badging<br/>• Whole-village filter]
    end

    subgraph Stores [Persistent Domain Stores in src/_data/]
        Store_News[(news_store.json<br/>TTL: 14-30 days)]
        Store_Gov[(governance_store.json<br/>TTL: Latest meetings / 60 days)]
        Store_Plan[(planning_store.json<br/>TTL: Active apps / 60-90 days)]
        Store_Evt[(events_calendar.json<br/>TTL: Future dates & regular)]
        Store_WPA[(wpa_calendar.json & wpa_years.json)]
    end

    subgraph Composer [Site Composer (scripts/compose-briefing.js)]
        Comp_Select[Select Active Items from Stores<br/>• Top 8-12 Fresh News<br/>• Active Governance items<br/>• Active Planning apps<br/>• Upcoming Events]
        Comp_Render[Deterministic Template Renderer<br/>(template-renderer.js)]
        Comp_Output[Generate src/briefings/YYYY-MM-DD.md<br/>& src/_data/daily_sources/]
    end

    subgraph StaticSite [Eleventy SSG & Cloudflare Pages]
        SSG_Home[Home: /index.html]
        SSG_Archive[Archive: /archive/YYYY-MM-DD/]
        SSG_Cal[Calendar & ICS: /calendar/]
        SSG_WPA[School Hub: /wpa/]
    end

    S_HuntsPost --> P_News
    S_Scene --> P_News
    S_FOWL --> P_News
    S_WPA --> P_News

    S_Parish --> P_Gov
    S_County --> P_Gov

    S_PlanIt --> P_Plan

    S_Diary --> P_Evt
    S_FOWL --> P_Evt
    S_Parish --> P_Evt
    S_WPA --> P_Evt

    S_WPA --> P_WPA

    P_News --> Store_News
    P_Gov --> Store_Gov
    P_Plan --> Store_Plan
    P_Evt --> Store_Evt
    P_WPA --> Store_WPA

    Store_News --> Comp_Select
    Store_Gov --> Comp_Select
    Store_Plan --> Comp_Select
    Store_Evt --> Comp_Select

    Comp_Select --> Comp_Render
    Comp_Render --> Comp_Output
    Comp_Output --> StaticSite
    Store_Evt --> StaticSite
    Store_WPA --> StaticSite
    StaticSite --> SSG_Home
    StaticSite --> SSG_Archive
    StaticSite --> SSG_Cal
    StaticSite --> SSG_WPA
```

---

## ⚠️ User Review Required

> [!IMPORTANT]
> **Persistent Stores Location and Git Tracking**:
> We will place persistent domain stores in `src/_data/stores/` (or directly in `src/_data/` alongside `events_calendar.json`):
> - `src/_data/news_store.json`
> - `src/_data/governance_store.json`
> - `src/_data/planning_store.json`
> - `src/_data/events_calendar.json` (already in place and working)
> These JSON files are committed to Git as part of the daily automated pipeline. This gives Git history of all community items and ensures Cloudflare Pages builds from complete cached state.

> [!NOTE]
> **Source Failure Fault-Tolerance**:
> If an external API (e.g. PlanIt or Cambridgeshire County Council CMIS) fails or times out during a daily run, the pipeline will log a warning, keep the previously cached items in the store, and generate a complete daily briefing. Sections will no longer disappear when a source has a temporary outage.

---

## ❓ Open Questions

> [!TIP]
> 1. **Retention Periods (TTLs)**:
>    - Proposed: News = 21 days; Governance = 60 days (or latest 2 meetings); Planning = 90 days (or 30 days after decision date); Events = until event date passes.
>    - Does this match your intended retention for village content?
> 2. **Daily Briefing Overview/Lead**:
>    - Option A: Purely deterministic cards (fastest, 0 API tokens, 100% reliable).
>    - Option B: Include a 2-sentence AI-generated "Today's Briefing Highlights" header above the 4 blocks if an LLM API key is present, with an automatic fallback if unavailable.
>    - *Recommendation*: Option B (best of both worlds—highlights when available, flawless cards regardless).

---

## 🛠️ Proposed Changes

### Component 1: Persistent Domain Content Stores (`scripts/utils/content-stores.js`)

#### [NEW] `scripts/utils/content-stores.js`
A unified, robust store manager for domain persistence, deduplication, and TTL pruning:
- `loadStore(storeName)` / `saveStore(storeName, items)`
- `updateNewsStore(newItems, options)`: Deduplicates on URL / normalized title, filters death notices, applies 21-day TTL.
- `updatePlanningStore(newItems, options)`: Deduplicates on application reference (`rec.uid` or `rec.app_ref`), tracks status transitions (New &rarr; Decided), applies 90-day TTL for active and 30-day post-decision TTL for decided.
- `updateGovernanceStore(newItems, options)`: Deduplicates on meeting title + item title, retains items from latest meetings (60 days).
- Uses existing `events-calendar-store.js` for events.

```javascript
// Example: Domain-specific deduplication and TTL pruning
function updateNewsStore(incomingItems = [], options = {}) {
  const { maxDays = 21, nowDate = new Date() } = options;
  const existing = loadStore('news_store');
  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - maxDays);

  const itemMap = new Map();
  // Retain existing unexpired items
  for (const item of existing) {
    if (new Date(item.date || 0) >= cutoff) {
      itemMap.set(item.url || item.id, item);
    }
  }
  // Merge fresh items
  for (const item of incomingItems) {
    if (isDeathNotice(item)) continue;
    if (new Date(item.date || 0) >= cutoff) {
      itemMap.set(item.url || item.id, { ...item, lastSeen: nowDate.toISOString() });
    }
  }
  const updated = Array.from(itemMap.values())
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  saveStore('news_store', updated);
  return updated;
}
```

---

### Component 2: Independent Source Processing (`scripts/ingest.js`)

#### [MODIFY] `scripts/ingest.js`
Refactor the ingestion script to process each source into its respective domain store:
- Sources execute independently inside isolated `try/catch` blocks.
- A failure in one source does NOT stop or impact other sources or empty out previously cached items.
- Extracted items are passed directly to domain store updaters:
  - `rss`, `village-scene`, `fowl-library (news)` &rarr; `updateNewsStore`
  - `hdc-planning` &rarr; `updatePlanningStore`
  - `parish-council`, `county-council` &rarr; `updateGovernanceStore`
  - `events`, `fowl-library (events)`, `parish-council (events)` &rarr; `saveCalendar`
  - `wpa-school` &rarr; `updateWpaStores` + (community events to `news`/`events`)
- Eliminate the global `maxTotalItems` choke point.

```javascript
// Before (Monolithic & Fragile):
allRawItems.push(...items);
const filteredItems = preFilterItems(allRawItems, { maxTotalItems: 24 });
const briefingBody = await agent.generateBriefing(filteredItems, isoDate);

// After (Decoupled & Resilient):
// 1. Ingest into domain stores
await ingestNewsSources(sourceInstances, options);
await ingestPlanningSources(sourceInstances, options);
await ingestGovernanceSources(sourceInstances, options);
await ingestEventSources(sourceInstances, options);

// 2. Compose site from active domain stores
const activeContent = composeBriefingContent({
  maxNewsItems: 10,
  maxPlanningItems: 15,
  maxEventsDays: 30
});
const briefingBody = renderFullBriefingHtml(activeContent, villageConfig.villageName, villageConfig.county, villageConfig);
```

---

### Component 3: Briefing Composer & Template Renderer (`scripts/agent/briefing-composer.js` & `scripts/agent/template-renderer.js`)

#### [NEW] `scripts/agent/briefing-composer.js`
Responsible for selecting the most relevant active items from the stores for today's briefing:
- Selects top fresh village news items (e.g. up to 10 stories).
- Selects active upcoming events (for the next 30 days) + recurring club meetings.
- Selects current governance items grouped by meeting session.
- Selects planning applications grouped into New Applications, In Progress, and Decided.
- Produces a structured data payload `{ events, news, governance, planning }` ready for rendering.
- Optionally calls LLM to generate an editorial overview paragraph if API key is present.

#### [MODIFY] `scripts/agent/template-renderer.js`
- Ensure all 4 section blocks render cleanly from structured store data.
- Maintain existing badges, map links, source links, and meeting document links.

---

### Component 4: Pre-Filter Refactoring (`scripts/utils/pre-filter.js`)

#### [MODIFY] `scripts/utils/pre-filter.js`
- Transform `preFilterItems` into domain-specific cleaning utilities:
  - `cleanNewsItem(item)`: Strip social share fluff, file size suffixes, death notices, and extract clean text.
  - `cleanPlanningItem(item)`: Normalize reference numbers, address, and status badges.
  - `cleanGovernanceItem(item)`: Format meeting title and clean minutes snippets.
- Keep `isDeathNotice` as the authoritative 5-layer filter.
- Remove arbitrary global truncation logic.

---

### Component 5: Test Suite Updates (`tests/regression-suite.test.js`)

#### [MODIFY] `tests/regression-suite.test.js`
Add comprehensive automated test suites covering:
1. **Per-Source Isolation**: Verifying that if one source extractor throws an error or returns empty array, other domain stores and the composed briefing remain intact.
2. **Persistence Across Scrapes (Anti-Disappearance)**: Verifying that items cached on Day 1 persist on Day 2 even if the scraper on Day 2 fetches 0 items.
3. **Domain TTL & Eviction Rules**: Verifying news expires after 21 days, past events expire when their date passes, and active planning applications are retained.
4. **No Section Starvation**: Verifying that a large batch of planning applications or minutes does not truncate or starve news or events.

---

## 🧪 Verification Plan

### Automated Tests
1. Run full regression suite:
   ```bash
   npm test
   ```
2. Test source extractors in isolation:
   ```bash
   npm run test:sources
   ```
3. Test mock ingestion pipeline:
   ```bash
   npm run ingest:mock
   ```
4. Test Eleventy site build:
   ```bash
   npm run build
   ```

### Multi-Day Simulation Verification
Create an automated test script (`tests/multi-day-simulation.test.js`) that:
1. Runs Day 1 ingestion with all mock sources &rarr; verifies all 4 sections are populated.
2. Runs Day 2 ingestion with Hunts Post RSS simulated offline &rarr; verifies Day 1 news items are retained in `news_store.json` and appear in Day 2 briefing.
3. Verifies no content drops out or is missing.
