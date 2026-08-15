# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Attendance & Administrative Header Filtering (`scripts/utils/docx-parser.js`)
- **Excluded Administrative Fluff**: Removed raw document header items containing councillor attendance lists, apologies for absence, meeting opening times, and minute reference numbers (`144/26`, `145/26`).
- **Clean Governance Section**: Ensures only the 4 synthesized, news-worthy community decision items appear in the **🏛️ Governance & Parish Council** block.

### 2. Comprehensive Automated Regression Test Suite (`tests/regression-suite.test.js`)
- **Automated Test Suite**: Added test coverage in `tests/regression-suite.test.js` to ensure raw attendance/header cards are never emitted (`assert.strictEqual(fullTextItem, undefined)`).

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
- **Result**: **5 / 5 tests passed** in 2.52 seconds.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.53s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Run Tests**: `npm test`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
