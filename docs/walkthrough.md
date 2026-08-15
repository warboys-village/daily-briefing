# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. 30-Day Retention Window for Parish News (`village.config.json` & `scripts/utils/pre-filter.js`)
- **Root Cause 1**: `village.config.json` previously had `"preFilterDays": 7`, causing meeting minutes published 10–30 days ago to be dropped during ingestion.
- **Root Cause 2**: `preFilterDays` was deduplicating strictly by URL (`seenUrls.has(url)`). Multiple distinct news topics extracted from a single DOCX meeting minutes file were discarded because they shared the same document URL.
- **Fix**:
  - Updated `"preFilterDays": 30` in `village.config.json` so parish news items from the past 30 days are retained.
  - Updated `preFilterItems` to deduplicate by normalized `title + date` key (`normTitle_dateKey`), preserving all distinct news topics extracted from a single meeting document.
- **Verification**: Verified in `src/briefings/2026-08-15.md` that meeting news items (e.g. SEND overspend, Highway contractor penalties, Flaxon Walk parking bay) appear under **📰 Village News & Governance**, and future events (Community Showcase on 12 Sep & Choir Concert on 27 Sep) are marked on the **Events Calendar**.

### 2. Meeting Minutes (`04-mn-13.07.26.docx`) Content Extraction (`scripts/sources/parish-council-source.js`)
- **Extracted News & Decisions**: Parsed the raw text of `04-mn-13.07.26.docx` and extracted major news-worthy items (Highways penalties, SEND overspend, Local Plan, Newman Stores, Community Showcase, Choir Concert).

### 3. Meeting Calendar List View & Non-ISO Date Parsing (`scripts/sources/parish-council-source.js`)
- **Target URL**: Target list view at `https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`.
- **Non-ISO Date Parser**: Added `parseDdMmYyDate` to parse `dd.mm.yy`, `dd/mm/yy`, and `dd-mm-yy` dates.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 16 high-signal items including past 30-day parish news and upcoming calendar events.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.32s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
