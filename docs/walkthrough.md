# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. High-Priority Allocation for Governance & Planning (`scripts/utils/pre-filter.js`)
- **Root Cause**: `preFilterItems` was previously sorting all raw items strictly by date descending and truncating at `maxTotalItems = 16`. High-volume generic news feeds (like Google News) pushed older Parish Council meeting minute items past the truncation cutoff.
- **Fix**: Updated `preFilterItems` to partition items into high-priority local buckets (**Governance**, **Planning**, **Events**) and generic news. High-priority items are placed first in the pipeline and `maxTotalItems` was expanded to `24`.
- **Verification**: Verified in `src/briefings/2026-08-15.md` lines 347–414 that ALL extracted council decision items (Feast Week Tombola, Highway Maintenance Penalties, Flaxon Walk Disabled Bay, £60m SEND budget report, Newman Stores update) appear under **🏛️ Governance & Parish Council** below the official meeting calendar banner.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 22 high-signal items ensuring full representation across Governance, News, Events, and Planning.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.36s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
