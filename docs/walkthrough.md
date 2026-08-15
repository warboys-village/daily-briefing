# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Verbose Data Audit Trail & Direct Document Links (`src/archive/sources.njk` & `scripts/ingest.js`)
- **Verbose Audit Page**: Redesigned the Data Sources audit page (`/archive/YYYY-MM-DD/sources/`) to display detailed itemized breakdowns for every raw item extracted across all source extractors.
- **Audit Detail Breakdown**: Displays raw title, publication/event date, source category, extracted content details, and a prominent **Direct Document / Source Link** box (`📄 Direct Document / Source Link`).
- **Direct Document URLs**: Verified that all item links point directly to their underlying source document (PDF agenda, DOCX meeting minutes file, specific blog post, or PlanIt application detail page), rather than a generic source homepage.

### 2. Dynamic DOCX Meeting Minutes Extractor (`scripts/utils/docx-parser.js`)
- **Live OpenXML Ingestion**: Dynamic parser (`parseDocxFromUrl`) streams `.docx` meeting minute files from the Parish Council calendar (`https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`), extracts OpenXML paragraphs, and synthesizes governance cards.

### 3. Separated Governance Block (`scripts/agent/briefing-agent.js`)
- **Dedicated Block & Calendar Banner**: Features the **🏛️ Governance & Parish Council** block with a top-level link banner: `📅 Official Parish Council Meetings & Agendas: Warboys Parish Council Meeting Calendar →`.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Saved full verbose raw items list into `src/_data/daily_sources/2026-08-15.json`.

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
