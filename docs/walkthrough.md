# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Accurate Event Date Association (`scripts/sources/fowl-source.js`)
- **Real Historical Date Stamping**: Ensured that past blog post events (such as `https://fowl.org.uk/2026/04/12/bacon-butty-bonanza-2/` posted on 12 April 2026 describing 18 April) receive their true date (`2026-04-18`) rather than shifted mock dates.
- **Strict Past Event Filtering**: Because `2026-04-18` is in the past relative to current August 2026 briefings, it is correctly filtered out of current calendar views, while future events (September 14, October 12, November 9) populate the schedule accurately.

### 2. Multi-Event Programme Schedule Parser (`scripts/sources/fowl-source.js`)
- **Extracted Multi-Date Schedules**: Added regex-based multi-date programme parsing to extract ALL scheduled future talk dates from pages like `https://fowl.org.uk/2026/03/30/warboys-local-history-society/`.
- **Separate Event Records**: Each scheduled talk date in a multi-event programme table is stored as an individual event record in `src/_data/events_calendar.json` and populated onto the Events Calendar page (`/calendar/`).

### 3. Clean Regular Events Section (`src/calendar/index.njk`)
- **Removed Redundant 'Regular Event' Badges**: Removed duplicate `Regular Event` badges from cards inside Section 2 (`🔄 Regular Recurring Sessions & Groups`).

### 4. Separate Regular Events Panel & Clickable Calendar Badges (`src/calendar/index.njk` & `src/public/css/style.css`)
- **Dedicated Regular Events Panel (`#regular-events-panel`)**: Positioned regular recurring sessions into a clean bottom panel, listing each session once.
- **Un-highlighted Regular Day Badges**: Regular events appear on calendar day cells as a small purple `Regular` badge without highlighting the cell background.
- **Interactive Click Navigation**: Clicking a `Regular` badge in any calendar cell smoothly scrolls down to `#regular-events-panel` and briefly highlights the corresponding regular session card.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean items with exact weekday date strings (`YYYY-MM-DD`).

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.28s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
