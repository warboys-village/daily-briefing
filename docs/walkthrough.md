# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Direct PDF Content Analysis of `Warboys-Diary-April-May-26-final.pdf` (`scripts/sources/events-source.js`)
- **Direct PDF Extraction**: Downloaded and analyzed all 16 pages of [`Warboys-Diary-April-May-26-final.pdf`](https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf).
- **Exact Page-by-Page Findings**:
  - **Page 1**: Table of Contents & Section Index.
  - **Page 3**: **Warboys Climate & Environment Repair Café** (Saturday 18 April 2026, 10am–1pm at Warboys Community Centre).
  - **Page 8**: Friendship Club (Thursdays 10–11:30am at Sports & Social Club).
  - **Page 9**: **Warboys May Day Fete** (Monday 4 May 2026, 11am–3pm at Sports Field) & **Feast Week & Street Market** (Sunday 26 July 2026).
  - **Page 10**: General Church Information (Warboys Parish Church 2nd Sunday Family Café Time with hot drinks and bacon/cheese toasties; Warboys Baptist Church 2nd Tuesday Coffee & Cakes at 10:30am).
  - **Page 11**: **White Hart Bowls Club Open Day** (Saturday 18 April 2026 at 2pm).
- **Correction**: The *Warboys Farmers Market & Coffee Morning* entry was not present in this PDF document issue and was removed.

### 2. Verbose Data Audit Trail & Direct Document Links (`src/archive/sources.njk` & `scripts/ingest.js`)
- **Audit Detail Breakdown**: Displays raw title, publication/event date, source category, extracted content details, and a prominent **Direct Document / Source Link** box (`📄 Direct Document / Source Link`).

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Extracted clean, exact PDF page items from `Warboys-Diary-April-May-26-final.pdf`.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.53s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
