# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Timezone-Safe Calendar Date Formatting & Weekday Alignment (`src/calendar/index.njk` & `scripts/sources/fowl-source.js`)
- **Fixed Timezone Offset Shifting**: Fixed a client-side Date formatting bug where `.toISOString().split('T')[0]` converted midnight BST (UTC+1) to 23:00 UTC of the previous day, shifting all event markers back by one day. Replaced with `formatLocalDateStr(year, month, day)` using local year, month, and day getters.
- **Exact Weekday Mapping**: Dynamically expanded recurring weekly library sessions to their exact upcoming calendar dates (e.g. Saturdays `2026-08-15`, Tuesdays `2026-08-18`, Thursdays `2026-08-20`, Fridays `2026-08-21`), ensuring Saturday events render strictly on Saturday, Tuesday events on Tuesday, etc.

### 2. Clean Title Formatting & Strict Calendar Deduplication (`scripts/sources/fowl-source.js` & `scripts/utils/events-calendar-store.js`)
- **Eliminated Title & Content Duplication**: Standardized event titles for Warboys Library weekly sessions (*Children's Storytime*, *Baby & Toddler Rhymetime*, *Lego & Board Games Club*, *Craft & Chat Social Group*, *IT & Digital Helper Drop-In*).
- **Strict Deduplication**: Enhanced `saveCalendar()` to deduplicate events by canonical title keys and IDs.

### 3. Automatic Past Event Filtering (`scripts/utils/events-calendar-store.js` & `scripts/agent/briefing-agent.js`)
- Enforced strict cutoff filtering across the ingestion pipeline, persistent calendar store (`src/_data/events_calendar.json`), and briefing fallback generator.
- Any one-off event prior to today's date is automatically filtered out. Only current (today) and upcoming events (plus regular recurring sessions) are displayed.

### 4. Interactive Village Events Calendar Page (`/calendar/`)
- **New Calendar Page (`src/calendar/index.njk`)**: Created dedicated Events Calendar page permalinked at `/calendar/index.html`.
- **Top Month Calendar Widget**:
  - Displays monthly 7-column calendar grid with forward/back month navigation buttons.
  - Highlighting: Today's date highlighted in gold (`.cal-day-today`), event dates highlighted in sky blue with dot indicators (`.cal-day-has-events`).
  - Smooth Scroll Interaction: Clicking any event date smoothly scrolls down the page to that date's section element (`#events-date-YYYY-MM-DD`).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean, non-duplicated items with exact weekday date strings (`YYYY-MM-DD`).

```bash
npm run ingest:mock
```
- **Result**: Generated perfectly aligned event dates in `src/_data/events_calendar.json` (e.g., Saturday 15 August on Saturday, Tuesday 18 August on Tuesday).

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.29s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
