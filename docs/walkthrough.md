# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Separate Regular Events Panel & Clickable Calendar Badges (`src/calendar/index.njk` & `src/public/css/style.css`)
- **Dedicated Regular Events Panel (`#regular-events-panel`)**: Positioned regular recurring sessions (Storytime, Rhymetime, Lego Club, Craft & Chat, IT Drop-In) into a clean bottom panel titled `🔄 Regular Recurring Sessions & Groups`, listing each session once to avoid cluttering the one-off schedule with repetitive occurrences.
- **Un-highlighted Regular Day Badges**: Regular events appear on calendar day cells as a small purple `Regular` badge without highlighting the cell background (solid bright blue cell background is reserved for one-off events).
- **Interactive Click Navigation**: Clicking a `Regular` badge in any calendar cell smoothly scrolls down to `#regular-events-panel` and briefly highlights the corresponding regular session card.

### 2. High-Contrast Vibrant Calendar Styling (`src/public/css/style.css`)
- **Bright High-Contrast Highlights**: Updated calendar grid styling so highlighted event dates feature vibrant blue backgrounds (`#0284c7`) with crisp `#ffffff` white text (`.cal-day-has-events`).
- **Today Highlight**: Today's date features a bold warm amber/gold background (`#d97706`) with crisp `#ffffff` white text (`.cal-day-today`).

### 3. Timezone-Safe Calendar Date Formatting & Weekday Alignment (`src/calendar/index.njk` & `scripts/sources/fowl-source.js`)
- **Fixed Timezone Offset Shifting**: Fixed client-side Date formatting using timezone-safe `formatLocalDateStr(year, month, day)`.
- **Exact Weekday Mapping**: Dynamically expanded recurring weekly library sessions to their exact upcoming calendar dates (e.g. Saturdays `2026-08-15`, Tuesdays `2026-08-18`, Thursdays `2026-08-20`, Fridays `2026-08-21`).

### 4. Clean Title Formatting & Strict Calendar Deduplication (`scripts/sources/fowl-source.js` & `scripts/utils/events-calendar-store.js`)
- **Eliminated Title & Content Duplication**: Standardized event titles for Warboys Library weekly sessions.
- **Strict Deduplication**: Enhanced `saveCalendar()` to deduplicate events by canonical title keys and IDs.

### 5. Automatic Past Event Filtering (`scripts/utils/events-calendar-store.js` & `scripts/agent/briefing-agent.js`)
- Enforced strict cutoff filtering across the ingestion pipeline, persistent calendar store (`src/_data/events_calendar.json`), and briefing fallback generator.

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
- **Result**: Eleventy compiled 8 static pages in 0.34s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
