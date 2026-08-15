# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Governance Topic Disaggregation (`scripts/utils/docx-parser.js`)
- **Separated Aggregated Topics**: Split the combined parish meeting minutes cluster into **4 distinct, individual governance items**:
  1. **Parish Council Governance: Highway Contractor Penalties & Flaxon Walk Parking Bay** (10 Jul)
  2. **County Council Reports £60m SEND Budget Overspend** (10 Jul)
  3. **HDC Local Plan Publication & Autumn Public Consultation** (10 Jul)
  4. **Newman Stores Future Use & Community Acquisition Consultation** (10 Jul)

### 2. Architecture Refactoring Plan (`docs/architecture_refactoring_plan.md`)
- Created a comprehensive architectural plan shifting LLM output from raw HTML strings to structured JSON payloads (`{ events, news, governance, planning }`).

### 3. Deterministic Template Component Renderer (`scripts/agent/template-renderer.js`)
- Created `template-renderer.js` to convert structured JSON items into clean HTML cards deterministically.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Successfully extracted 4 individual governance items from `04-mn-13.07.26.docx`.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.25s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
