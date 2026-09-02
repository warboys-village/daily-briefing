# Walkthrough: Decoupled Per-Source Ingestion & Cached Content Composition

Transformed the Village Daily content pipeline from an ephemeral monolithic scrape with global item caps into a **decoupled per-source caching and persistent domain store architecture**.

---

## 🛠️ Summary of Changes

### 1. Persistent Domain Content Stores ([`scripts/utils/content-stores.js`](file:///home/admin/code/village-daily/scripts/utils/content-stores.js))
- **`news_store.json`**: Persistent village news store. Applies 21-day TTL, deduplicates on canonical URL or normalized title, strips social sharing fluff (`Share Share Facebook...`), removes attachment file size noise (`8817KB`), and enforces the 5-layer death notice filter.
- **`planning_store.json`**: Persistent planning store. Retains active applications up to 90 days, tracks status lifecycle transitions (New &rarr; In Progress &rarr; Decided), records decision outcomes, and retains decided applications for 30 days post-decision.
- **`governance_store.json`**: Persistent governance store. Retains parish and county council meeting minutes up to 60 days, with guaranteed retention of all items from the latest 2 meetings even across longer intervals.
- **`events_calendar.json`**: Integrated with existing persistent calendar store, retaining future dates and regular recurring events.

### 2. Independent Source Ingestion ([`scripts/ingest.js`](file:///home/admin/code/village-daily/scripts/ingest.js))
- **Decoupled Execution**: Every source runs inside its own isolated error-handling block. A failure or timeout in one source no longer impacts other sources or halts the pipeline.
- **Direct Domain Routing**: Items extracted from each source are routed directly to their respective domain stores.
- **Fault Tolerance (Anti-Disappearance)**: If an external site or RSS feed is temporarily unreachable on Day 2, previously cached items from Day 1 remain intact in the domain stores and are not lost.
- **Removed Global Item Limit (`maxTotalItems`)**: Eliminates the global bottleneck where large volumes of planning or governance records could starve out village news or events.

### 3. Briefing Composer ([`scripts/agent/briefing-composer.js`](file:///home/admin/code/village-daily/scripts/agent/briefing-composer.js))
- **Deterministic Composition**: Composes the daily briefing directly from the active stores:
  - **What's On**: Upcoming events within 30 days + regular recurring events.
  - **Village News**: Fresh news items up to 12 stories, filtered for whole-village relevance.
  - **Governance**: Latest parish council meeting + county council items.
  - **Planning**: Active applications grouped by New Applications, In Progress, and Decided.
- **Optional Editorial Highlights**: When an LLM API key is present, generates an engaging 2-sentence morning welcome banner summarizing today's highlights with graceful zero-token fallback.

---

## 🧪 Verification Results

### 1. Automated Regression & Unit Test Suites
```bash
npm test
```
```
✔ Decoupled Content Stores & Briefing Composition (922.52ms)
  ✔ 1. News Store Persistence, Anti-Disappearance & Hygiene (7.37ms)
  ✔ 2. Planning Store Persistence & Status Lifecycle (3.69ms)
  ✔ 3. Governance Store Persistence & Meeting Retention (1.53ms)
  ✔ 4. Briefing Composer Non-Starvation & Multi-Section Rendering (908.35ms)
✔ Village Daily System - Comprehensive Regression Test Suite (4640.14ms)
ℹ tests 27
ℹ suites 13
ℹ pass 27
ℹ fail 0
```

### 2. Live Source Extractors
```bash
npm run test:sources
```
```
--- Testing Village Daily Source Extractors ---
Testing Google News (Warboys) (rss)... -> Returned 0 items.
Testing The Hunts Post News (rss)... -> Returned 0 items.
Testing Huntingdonshire District Council Planning (hdc-planning)... -> Returned 3 items.
Testing Warboys Parish Council (parish-council)... -> Returned 5 items.
Testing Warboys Diary & Community Events (events)... -> Returned 5 items.
Testing Village Scene Magazine (village-scene)... -> Returned 1 items.
Testing Friends of Warboys Library (FOWL) (fowl-library)... -> Returned 16 items.
Testing Cambridgeshire County Council (county-council)... -> Returned 2 items.
Testing Warboys Primary Academy (wpa-school)... -> Returned 8 items.
Total Extracted Items across sources: 40
--- Test Complete ---
```

### 3. Static Site Generation (Eleventy)
```bash
npm run build
```
```
[11ty] Copied 3 Wrote 25 files in 0.41 seconds (v3.1.6)
```
Generated files include `/index.html`, `/calendar/index.html`, `/wpa/index.html`, `/archive/2026-09-02/index.html`, and audit transparency pages at `/archive/2026-09-02/sources/index.html`.
