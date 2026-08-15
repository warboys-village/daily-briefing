# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Preserved Governance Meeting Minutes (60-Day Window in `scripts/utils/pre-filter.js`)
- **Root Cause Analysis**: Parish council meeting minutes are published monthly (every 30 to 45 days). The meeting minutes from 10 July 2026 (`04-mn-13.07.26.docx`) were 36 days old relative to the briefing date (15 August 2026), causing the strict 30-day cutoff in `preFilterItems` to filter them out.
- **Fix**: Updated `preFilterItems` to allow up to 60 days for Governance items (`sourceId === 'warboys-parish'`), ensuring the latest monthly council meeting minutes are always preserved.
- **Verification**: Verified in `src/briefings/2026-08-15.md` lines 345–374 that the **🏛️ Governance & Parish Council** section appears with the official meeting calendar banner and dynamically extracted meeting decisions.

### 2. Dynamic DOCX Meeting Minutes Extractor (`scripts/utils/docx-parser.js`)
- **Live OpenXML Parsing**: Built a dynamic parser (`parseDocxFromUrl`) that streams `.docx` meeting minute files from the Parish Council calendar (`https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`), extracts OpenXML paragraphs, and synthesizes governance cards.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 21 high-signal items ensuring full representation of Governance, News, Events, and Planning.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.41s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
