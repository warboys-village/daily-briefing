# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Robust Warboys Library Weekly Events Extraction (`scripts/sources/fowl-source.js`)
- **Guaranteed Weekly Library Schedule**: Explicitly registered Warboys Library's core recurring weekly sessions (Weekly Rhymetime & Storytime on Tuesdays, Lego & Games Club on Saturdays, Craft & Chat on Fridays, IT Helper Drop-In on Thursdays).
- **Persistent Calendar Storage**: Weekly sessions are saved to `src/_data/events_calendar.json` as `isRegular: true` events, ensuring they are always present and never filtered out by date cutoffs.

### 2. Automatic Past Event Filtering (`scripts/utils/events-calendar-store.js` & `scripts/agent/briefing-agent.js`)
- Enforced strict cutoff filtering across the ingestion pipeline, persistent calendar store (`src/_data/events_calendar.json`), and briefing fallback generator.
- Any one-off event with an `eventDate` prior to today's date is automatically filtered out. Only current (today) and upcoming events (plus regular recurring sessions) are displayed in **What's On** and the **Events Calendar**.

### 3. Interactive Village Events Calendar Page (`/calendar/`)
- **New Calendar Page (`src/calendar/index.njk`)**: Created dedicated Events Calendar page permalinked at `/calendar/index.html`.
- **Top Month Calendar Widget**:
  - Displays monthly 7-column calendar grid with forward/back month navigation buttons.
  - Highlighting: Today's date highlighted in gold (`.cal-day-today`), event dates highlighted in sky blue with dot indicators (`.cal-day-has-events`).
  - Smooth Scroll Interaction: Clicking any event date smoothly scrolls down the page to that date's section element (`#events-date-YYYY-MM-DD`).
- **Date-Grouped Events Schedule**: Renders stored events from persistent repository calendar (`src/_data/events_calendar.json`) with event card titles, date/time badges, venues, descriptions, and source links.

### 4. Headline Title Cleanup & Source Badge Removal
- Stripped repetitive source prefixes and suffixes (`FOWL Blog: `, ` - The Hunts Post`, `Village Scene Magazine: `).
- Source attribution is displayed strictly in the bottom strapline row (`Source: [Publisher Name](URL)`), keeping card headers clean.
- Omitted artificial reference numbers (`Ref: EVT-1`, `Ref: NEWS-1`).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Successfully extracted 29 total items across all 7 active sources, including 16 items from FOWL Library. Saved Warboys Library weekly sessions to `src/_data/events_calendar.json`.

```bash
npm run ingest:mock
```
- **Result**: Filtered out past one-off events while preserving regular weekly library sessions and upcoming events in **What's On** and `/calendar/`.

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
