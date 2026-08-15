# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Meeting Calendar List View & Non-ISO Date Parsing (`scripts/sources/parish-council-source.js`)
- **Target URL**: Target list view at `https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`.
- **Non-ISO Date Parser**: Added `parseDdMmYyDate` to parse `dd.mm.yy`, `dd/mm/yy`, and `dd-mm-yy` dates (e.g. `10.08.26` → 10 August 2026, `13.07.26` → 13 July 2026).
- **Direct PDF/DOCX Document Extraction**: Extracted direct links under `Minutes` and `Associated documents` (e.g., `05-agenda-10.08.26-LW.pdf` and `04-mn-13.07.26.docx`) so source links lead directly to official council files.

### 2. Official `.gov.uk` Parish Council Domain Alignment (`village.config.json` & `scripts/sources/parish-council-source.js`)
- **Official Live Site**: Updated all links to the official live domain **`https://www.warboysparishcouncil.gov.uk/`**.

### 3. Immediate Next Weekday Occurrence for Regular Events (`scripts/sources/fowl-source.js`)
- **Immediate Next Date Stamping**: Today being **Saturday 15 August 2026**, the very next occurrence of a weekly Thursday session (like Storytime) is **Thursday 20 August 2026** (5 days away).

### 4. Chronological Event Sorting in "What's On" (`scripts/agent/briefing-agent.js`)
- **Ascending Event Order**: Updated `BriefingAgent` to sort all cards in `📅 What's On` strictly by `eventDate` ascending (earliest event date first).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean, non-duplicated items from meeting calendar list view with direct PDF/DOCX links.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.47s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
