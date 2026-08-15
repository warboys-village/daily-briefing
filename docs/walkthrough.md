# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Full Meeting Minutes LLM Ingestion (`scripts/utils/docx-parser.js`)
- **Full Un-truncated Text Ingestion**: Updated `docx-parser.js` to package the **complete, un-truncated raw text of meeting minutes** (e.g. `04-mn-13.07.26.docx`) into the ingestion item payload (`item.content = paragraphs.join('\n\n')`).
- **Zero Fragile Filtering**: The LLM reads the complete transcript from start to finish and extracts all news-worthy governance decisions, community consultations, and event announcements directly.

### 2. Architecture Refactoring & Deterministic Component Rendering
- Shifted LLM output from raw HTML strings to structured JSON payloads (`{ events, news, governance, planning }`).
- Built `scripts/agent/template-renderer.js` to format JSON payloads into high-contrast HTML cards deterministically with zero token waste on HTML markup tags.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Collected 49 raw items including full raw meeting minutes document payload.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.63s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
