# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Dynamic DOCX Meeting Minutes Extractor (`scripts/utils/docx-parser.js` & `scripts/sources/parish-council-source.js`)
- **Live DOCX Ingestion**: Built a native dynamic parser (`parseDocxFromUrl`) that discovers `.docx` meeting minute links on the Parish Council calendar (`https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`), downloads the document file over HTTP, extracts raw OpenXML paragraphs (`word/document.xml`), and synthesizes structured news & event items.
- **Extracted Items**:
  1. *Parish Council Governance: Highway Contractor Penalties & Flaxon Walk Parking Bay* (from `04-mn-13.07.26.docx`)
  2. *County Council Reports £60m SEND Overspend; Local Plan & Newman Stores Consultation* (from `04-mn-13.07.26.docx`)
  3. *Warboys Community Showcase 2026* (Announced in Council Minutes, 12 Sep 2026)
  4. *Warboys Community Choir Concert* (Announced in Council Minutes, 27 Sep 2026)

### 2. Separated Governance & Parish Council Block (`scripts/agent/briefing-agent.js`)
- **Dedicated Governance Block**: Separated local news into **📰 Village News** and parish governance into **🏛️ Governance & Parish Council**.
- **Meeting Calendar Banner**: Placed a top-level link banner at the start of the Governance section pointing directly to the official list view (`https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 4 live items directly from `https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/04/04-mn-13.07.26.docx` using `parseDocxFromUrl()`.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.27s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
