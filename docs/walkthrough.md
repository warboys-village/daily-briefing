# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Automatic Past Event Filtering (`scripts/utils/events-calendar-store.js` & `scripts/agent/briefing-agent.js`)
- Enforced strict cutoff filtering across the ingestion pipeline, persistent calendar store (`src/_data/events_calendar.json`), and briefing fallback generator.
- Any one-off event with an `eventDate` prior to today's date is automatically filtered out. Only current (today) and upcoming events (plus regular recurring sessions) are displayed in **What's On** and the **Events Calendar**.

### 2. Interactive Village Events Calendar Page (`/calendar/`)
- **New Calendar Page (`src/calendar/index.njk`)**: Created dedicated Events Calendar page permalinked at `/calendar/index.html`.
- **Top Month Calendar Widget**:
  - Displays monthly 7-column calendar grid with forward/back month navigation buttons.
  - Highlighting: Today's date highlighted in gold (`.cal-day-today`), event dates highlighted in sky blue with dot indicators (`.cal-day-has-events`).
  - Smooth Scroll Interaction: Clicking any event date smoothly scrolls down the page to that date's section element (`#events-date-YYYY-MM-DD`).
- **Date-Grouped Events Schedule**: Renders stored events from persistent repository calendar (`src/_data/events_calendar.json`) with event card titles, date/time badges, venues, descriptions, and source links.

### 3. Blog Post Event Extraction & Persistent Repository Calendar (`src/_data/events_calendar.json`)
- **Event Extraction from Blog Posts**: Posts describing events (e.g. *Bacon Butty Bonanza*, *Warboys Library Book Sale*, *May Day Fete*, *Local History Society talks*) are automatically extracted as **Event items** (routed to Block 1: What's On) rather than generic News.
- **Persistent Repository Calendar (`src/_data/events_calendar.json`)**: All extracted events are saved to a persistent JSON store inside the codebase (`src/_data/events_calendar.json`).
- **Accurate Post & Event Dates**: Items reflect their actual event/publication dates (parsed from URLs like `/2026/04/12/` or text like `18 April`).

### 4. Headline Title Cleanup & Source Badge Removal
- Stripped repetitive source prefixes and suffixes (`FOWL Blog: `, ` - The Hunts Post`, `Village Scene Magazine: `).
- Source attribution is displayed strictly in the bottom strapline row (`Source: [Publisher Name](URL)`), keeping card headers clean.
- Omitted artificial reference numbers (`Ref: EVT-1`, `Ref: NEWS-1`).

### 5. Unified Card Strapline & Top-Right Badges
- **Top Right Badge**: Event Date & Time badge (`badge-today`, `badge-upcoming`, `badge-regular`), Planning Stage badge (`badge-new`, `badge-approved`), or Publication date.
- **Bottom Strapline Row**: `Source: [Publisher Name](URL)` link and `Full Report →` direct link.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run ingest:mock
```
- **Result**: Successfully filtered out past events and saved current/upcoming events in `src/_data/events_calendar.json`, displayed in **What's On** and `/calendar/`.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.40s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
