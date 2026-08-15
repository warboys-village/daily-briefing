# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Separated Governance & Parish Council Block (`scripts/agent/briefing-agent.js`)
- **Dedicated Governance Block**: Separated local news into **📰 Village News** and parish governance into **🏛️ Governance & Parish Council**.
- **Meeting Calendar Banner**: Placed a top-level link banner at the start of the Governance section pointing directly to the official list view:
  `📅 Official Parish Council Meetings & Agendas: Warboys Parish Council Meeting Calendar →` (`https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`).
- **Extracted Meeting Items**: Below the banner, rendered all extracted decisions, reports, and agenda items from the latest council meeting documents.

### 2. 30-Day Retention Window & Clean Extracted Topics (`village.config.json` & `scripts/sources/parish-council-source.js`)
- **Clean Topic Extraction**: Removed raw filename scrapers (e.g. `"Agenda (PDF)"`) and retained clean extracted headlines (e.g. SEND overspend report, Highways contractor penalties, Flaxon Walk parking bay, Feast Week Tombola).
- **30-Day Retention**: Preserved parish news from the past 30 days and populated future event announcements onto the **Events Calendar**.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted 16 high-signal items across 4 separated section blocks (`📅 What's On`, `📰 Village News`, `🏛️ Governance & Parish Council`, `🏗️ Planning & Development`).

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.33s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
