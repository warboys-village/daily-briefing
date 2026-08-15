# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Extracted News Topics vs Raw Document Filenames (`scripts/sources/parish-council-source.js`)
- **Removed Raw Filename Scrapers**: Removed the scraper that published raw document button titles like `"Agenda (PDF)"`, `"Agenda (DOCX)"`, or `"Minutes and Agendas"` as news cards.
- **Only Real Extracted Topics**: The **📰 Village News & Governance** section now displays ONLY real synthesized news topics extracted from council documents (e.g. *Highway Contractors Face Penalties & Flaxon Walk Bay Completed*, *County Council Reports £60m SEND Overspend*, *Full Council Agenda: Feast Week Tombola & Summer Sports Demand*).

### 2. 30-Day Retention Window for Parish News (`village.config.json` & `scripts/utils/pre-filter.js`)
- **30-Day Retention**: Updated `"preFilterDays": 30` in `village.config.json` and updated `preFilterItems` to deduplicate by normalized `title + date` key, preserving multiple distinct news topics extracted from a single meeting document.

### 3. Immediate Next Weekday Occurrence for Regular Events (`scripts/sources/fowl-source.js`)
- **Immediate Next Date Stamping**: Today being **Saturday 15 August 2026**, the very next occurrence of a weekly Thursday session (like Storytime) is **Thursday 20 August 2026** (5 days away).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 16 high-signal items without raw document titles, featuring clean extracted news topics and calendar events.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.42s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
