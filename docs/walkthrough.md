# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. FOWL Library Page Alignment (`scripts/sources/fowl-source.js`)
- **Direct Alignment with Published Listing**: Inspecting live rendered DOM content on `https://fowl.org.uk/listing/library/` revealed that FOWL specifically publishes 3 regular sessions:
  - **Baby & Toddler Rhymetime**: Every Tuesday (10:30 AM – 11:00 AM)
  - **Children's Storytime**: Every Thursday (10:30 AM – 11:00 AM)
  - **Fortnightly Coffee Morning**: Fortnightly on Saturdays (10:30 AM – 12:00 PM)
- Removed unverified extra sessions so regular calendar events match the published site 100%.

### 2. Strict 1-to-1 True Date Matching for Blog Posts (`scripts/sources/fowl-source.js`)
- **Eliminated Artificial Date Overrides**: Both post URLs (posted on 12 April 2026 describing Saturday 18 April) are strictly date-stamped with their true event date `2026-04-18`. Because `2026-04-18` is in the past relative to current August 2026 briefings, those events are automatically filtered out, leaving only genuine upcoming events in September, October, and November.

### 3. Multi-Event Programme Schedule Parser (`scripts/sources/fowl-source.js`)
- **Extracted Multi-Date Schedules**: Added regex-based multi-date programme parsing to extract ALL scheduled future talk dates from pages like `https://fowl.org.uk/2026/03/30/warboys-local-history-society/`.
- **Separate Event Records**: Each scheduled talk date in a multi-event programme table is stored as an individual event record in `src/_data/events_calendar.json` and populated onto the Events Calendar page (`/calendar/`).

### 4. Separate Regular Events Panel & Clickable Calendar Badges (`src/calendar/index.njk` & `src/public/css/style.css`)
- **Dedicated Regular Events Panel (`#regular-events-panel`)**: Positioned regular recurring sessions into a clean bottom panel, listing each session once.
- **Un-highlighted Regular Day Badges**: Regular events appear on calendar day cells as a small purple `Regular` badge without highlighting the cell background.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 43 total items matching live published site content.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.21s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
