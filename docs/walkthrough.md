# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Comprehensive Regression Test Suite (`tests/regression-suite.test.js`)
- **Automated Test Coverage**: Built a native Node.js test suite (`npm test` via `node:test`) covering all critical system features:
  1. **DOCX Meeting Minutes Parsing**: Verifies dynamic extraction of full raw text and disaggregation into separate governance items with direct DOCX links.
  2. **Warboys Diary PDF Linking & Date Stamping**: Verifies specific PDF issue URLs, correct upcoming event dates, and Page 9 future winter events (27 Nov Quiz & 28 Nov Switch On).
  3. **Pre-Filtering & 60-Day Retention**: Verifies 60-day window for monthly governance items and 30-day cutoff for generic RSS news.
  4. **Deterministic Component Rendering**: Verifies the 4 section blocks, official meeting calendar banner link, and correct classification (preventing "Local Plan" governance reports from entering Planning).

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
- **Result**: **5 / 5 tests passed** in 2.25 seconds.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.63s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Run Tests**: `npm test`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
