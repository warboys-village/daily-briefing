# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Accurate Governance vs Planning Classification (`scripts/agent/briefing-agent.js`)
- **Root Cause**: The fallback briefing generator was executing `category.includes('plan') || title.includes('plan')` to collect planning items. Governance items containing the phrase "Local Plan consultation" (e.g. *County Council Reports £60m SEND Overspend; Local Plan & Newman Stores Consultation*) were being misclassified as Planning applications instead of Governance news.
- **Fix**: Restricted `planningItems` strictly to `sourceId === 'hdc-planning'` or `category === 'planning'`, preventing governance reports that mention "Local Plan" from being hijacked into Planning & Development.
- **Verification**: Verified in `src/briefings/2026-08-15.md` lines 353–394 that both extracted governance items from `04-mn-13.07.26.docx` appear under **🏛️ Governance & Parish Council** below the official meeting calendar banner.

### 2. Dynamic DOCX Meeting Minutes Extractor (`scripts/utils/docx-parser.js`)
- **Extracted Items**:
  1. *Parish Council Governance: Highway Contractor Penalties & Flaxon Walk Parking Bay* (Governance)
  2. *County Council Reports £60m SEND Overspend; Local Plan & Newman Stores Consultation* (Governance)
  3. *Warboys Community Showcase 2026* (Event, 12 Sep)
  4. *Warboys Community Choir Concert* (Event, 27 Sep)

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 4 items from `04-mn-13.07.26.docx`, correctly routing 2 to Governance and 2 to Events.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.28s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
