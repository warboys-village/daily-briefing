# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Meeting Minutes (`04-mn-13.07.26.docx`) Content Extraction (`scripts/sources/parish-council-source.js`)
- **Extracted News & Decisions**: Parsed the raw text of `04-mn-13.07.26.docx` and extracted 4 major news-worthy items:
  1. **Highway Contractors & Parking**: Financial penalties for poor highway repairs starting September; completion of Flaxon Walk disabled parking bay.
  2. **SEND Budget & Local Plan**: County council £60m SEND budget overspend report; September Local Plan publication & discussions on Newman Stores.
  3. **Warboys Community Showcase 2026**: Announced for Saturday 12 September 2026.
  4. **Warboys Community Choir Concert**: Scheduled for Sunday 27 September 2026.

### 2. Meeting Calendar List View & Non-ISO Date Parsing (`scripts/sources/parish-council-source.js`)
- **Target URL**: Target list view at `https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`.
- **Non-ISO Date Parser**: Added `parseDdMmYyDate` to parse `dd.mm.yy`, `dd/mm/yy`, and `dd-mm-yy` dates (e.g. `10.08.26` → 10 August 2026, `13.07.26` → 13 July 2026).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean, non-duplicated items from meeting calendar list view and DOCX minutes.

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
