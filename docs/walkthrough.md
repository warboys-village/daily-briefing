# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Official `.gov.uk` Parish Council Domain Alignment (`village.config.json` & `scripts/sources/parish-council-source.js`)
- **Root Cause**: The deprecated `.co.uk` domain (`warboysparishcouncil.co.uk`) was dead and returning HTTP 404 errors.
- **Fix**: Updated `village.config.json` and `ParishCouncilSource` to the official live domain **`https://www.warboysparishcouncil.gov.uk/`**.
- **Valid Source Links**:
  - Agendas & Minutes: `https://www.warboysparishcouncil.gov.uk/the-council/minutes-agendas/`
  - Community & Assembly Notices: `https://www.warboysparishcouncil.gov.uk/our-community/warboys-diary/`

### 2. Immediate Next Weekday Occurrence for Regular Events (`scripts/sources/fowl-source.js`)
- **Immediate Next Date Stamping**: Today being **Saturday 15 August 2026**, the very next occurrence of a weekly Thursday session (like Storytime) is **Thursday 20 August 2026** (5 days away).
- **Prevented Distant Date Leakage**: Updated `getUpcomingWeekdayDates` to target `count = 1` (the immediate upcoming occurrence) so regular events do not generate distant future entries (like 10 September) ahead of nearer one-off events (like 26 August).

### 3. Chronological Event Sorting in "What's On" (`scripts/agent/briefing-agent.js`)
- **Ascending Event Order**: Updated `BriefingAgent` to sort all cards in `📅 What's On` strictly by `eventDate` ascending (earliest event date first).

### 4. Main Page & Archive Layout Cleanup (`src/index.njk` & `src/_includes/layouts/briefing.njk`)
- **Removed Duplicate Briefing Headings**: Removed `<h1 class="briefing-title">` from both `src/index.njk` and `src/_includes/layouts/briefing.njk`.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean, non-duplicated items in `src/_data/events_calendar.json` with valid live `.gov.uk` URLs.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.44s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
