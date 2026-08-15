# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Chronological Event Sorting in "What's On" (`scripts/agent/briefing-agent.js`)
- **Root Cause**: Previously, events in the fallback briefing renderer were sorted by `b.date - a.date` (news publication date descending), causing older blog post entries with future event dates to appear below newly ingested regular sessions with later event dates.
- **Fix**: Updated `BriefingAgent` to sort all items in the `📅 What's On` section strictly by `eventDate` (or `date`) **ascending**.
- **Verification**: Verified in `src/briefings/2026-08-15.md` that 20 August appears before 26 August, which appears before 7 September.

### 2. Main Page & Archive Layout Cleanup (`src/index.njk` & `src/_includes/layouts/briefing.njk`)
- **Removed Duplicate Briefing Headings**: Removed `<h1 class="briefing-title">` from both `src/index.njk` and `src/_includes/layouts/briefing.njk`.
- The site header retains `Warboys Daily` and the date badge (`Today's Briefing • 15 August 2026`) cleanly without repeating `Warboys Daily Briefing – <date>` lower down on the page.

### 3. Multi-Layer Event Deduplication (`scripts/utils/events-calendar-store.js` & `src/calendar/index.njk`)
- **Store-Level Deduplication Key**: Updated `saveCalendar()` to construct a normalized title + date deduplication key (`oneoff_${normTitle.slice(0, 30)}_${isoDateStr}`), ensuring events scraped with differing source IDs are merged into a single clean record in `src/_data/events_calendar.json`.
- **Template-Level Loop Guard**: Added `{% set renderedKeys = [] %}` tracking inside `src/calendar/index.njk` to prevent duplicate rendering in Section 1 (`Scheduled One-Off Events`).

### 4. History Society HTML Table Parser (`scripts/sources/fowl-source.js`)
- **Direct Alignment with Published Post Table**: Inspected live rendered DOM structure of `https://fowl.org.uk/2026/03/30/warboys-local-history-society/` and added direct HTML `<table>` row parsing.
- **Exact Events & Speakers**:
  - **7 September 2026**: *Bravery, Beheadings and Barbeques* (Speaker: Rev Ruth Clay)
  - **5 October 2026**: *Operation Epsilon (Farm Hall)* (Speaker: Roger Leivers)

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean, non-duplicated items sorted chronologically in `src/_data/events_calendar.json`.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.52s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
