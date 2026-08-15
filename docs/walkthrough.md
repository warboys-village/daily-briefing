# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Page 9 Calendar Table Future Events Extraction (`scripts/sources/events-source.js`)
- **Analyzed Full Page 9 Event Table**: Parsed the complete text of Page 9 (*WHAT’S ON - calendar of forthcoming events*) in [`Warboys-Diary-April-May-26-final.pdf`](https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf).
- **Extracted Future November Events**:
  1. **Warboys Young at Heart Club Christmas Quiz (WDDC)** — Friday 27 November 2026 @ 7:30 PM (Warboys Community Centre).
  2. **Warboys Christmas Lighting Switch On** — Saturday 28 November 2026 @ 4:30 PM - 6:00 PM (Warboys Weir).
- **Calendar Store Persistence**: Saved these future events into `src/_data/events_calendar.json` so they are tracked on the Interactive Events Calendar (`/calendar/`).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Saved 27 Nov and 28 Nov events into `src/_data/events_calendar.json`.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.30s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
