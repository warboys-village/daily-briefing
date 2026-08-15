# Walkthrough: Cambridgeshire County Council Ingestion & Persistent Document Processing Cache

We have implemented and verified **Cambridgeshire County Council Meeting Minutes & Agendas Ingestion** alongside a **Persistent Document Processing Cache** for the Village Daily Briefing System.

---

## 🛠️ Summary of Accomplishments

### 1. Persistent Document Processing Cache (`scripts/utils/processed-doc-cache.js`)
- **Repository Cache Store**: Created `processed-doc-cache.js` to manage `src/_data/processed_documents_cache.json`.
- **Zero Duplicate Processing**: Stores extracted JSON items along with processing timestamps. Subsequent daily runs check this cache first, returning already-processed document items instantly without re-downloading or making duplicate LLM extraction calls.

### 2. Cambridgeshire County Council CMIS Extractor (`scripts/sources/county-council-source.js`)
- **CMIS Portal Connection**: Connects to the official **Cambridgeshire County Council CMIS Portal** (`https://cambridgeshire.cmis.uk.com/ccc_live/`).
- **Committee Ingestion**: Crawls agendas, decision statements, and PDF document packs from 5 key committees:
  1. **County Council (Full Council)**
  2. **Highways & Transport Committee**
  3. **Environment & Green Investment Committee**
  4. **Children & Young People Committee**
  5. **Strategy, Resources & Performance Committee**
- **Local Relevance Filtering**: Filters extracted records for terms relevant to **Warboys**, **Huntingdonshire**, **A141 / B1040**, **SEND / Schools**, **Highways**, and **Bus Services**.
- **Direct CMIS Document Links**: Links directly to specific decision packs (`https://cambridgeshire.cmis.uk.com/CCC_live/Document.ashx?...`).

### 3. Comprehensive Automated Test Coverage (`tests/regression-suite.test.js`)
- Added Unit Test Section 5 to `tests/regression-suite.test.js` asserting cache storage/retrieval and `CountyCouncilSource` extraction. All **7 / 7 tests passed** (`npm test`).

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
▶ Village Daily System - Comprehensive Regression Test Suite
  ▶ 1. DOCX Meeting Minutes Extractor (scripts/utils/docx-parser.js)
    ✔ extracts separate governance items without raw attendance/header fluff
  ▶ 2. Warboys Diary Events Extractor & PDF Issue Links (scripts/sources/events-source.js)
    ✔ attaches specific PDF issue URLs and accurately dates events
  ▶ 3. Pre-Filtering & Retention Rules (scripts/utils/pre-filter.js)
    ✔ retains governance items up to 60 days and prioritizes high-signal items
  ▶ 4. Deterministic Component Rendering & Categorization (template-renderer.js)
    ✔ renders 4 distinct section blocks with top calendar banner in Governance
    ✔ prevents governance items mentioning Local Plan from being misclassified into Planning
  ▶ 5. Persistent Document Processing Cache & County Council Source
    ✔ stores and retrieves cached document extraction items
    ✔ extracts Cambridgeshire County Council committee decisions
✔ Village Daily System - Comprehensive Regression Test Suite (4848ms)

7 / 7 tests passed (0 failures)
```

### 2. Ingestion & Build Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.18s (`_site/archive/2026-08-15/index.html`).

---

## 🚀 How to Run & Test

- **Run Automated Tests**: `npm test`
- **Run Data Ingestion**: `npm run ingest:mock` (or `npm run ingest` with API key)
- **Local Dev Server**: `npm run dev`
