# Walkthrough: Village Daily Briefing System (Warboys, Cambridgeshire)

We have built and verified a complete, forkable **Village Daily Briefing System** pre-configured for **Warboys, Cambridgeshire**. It aggregates local news, Huntingdonshire District Council planning portal updates via PlanIt API, Warboys Parish Council meeting minutes, Warboys Diary community events, Village Scene Magazine, and Friends of Warboys Library (FOWL) using a token-optimized Node.js ingestion pipeline and builds a fast static website using Eleventy (11ty) hosted via Cloudflare Pages.

---

## 🛠️ Summary of Accomplishments

### 1. Specific Warboys Diary PDF Issue Link (`scripts/sources/events-source.js`)
- **Direct PDF Issue Extraction**: Updated `EventsSource` to dynamically discover the specific latest Warboys Diary PDF issue link on `https://www.warboysparishcouncil.gov.uk/our-community/warboys-diary/` (e.g. [`Warboys-Diary-April-May-26-final.pdf`](https://www.warboysparishcouncil.gov.uk/wp-content/uploads/sites/115/2026/03/Warboys-Diary-April-May-26-final.pdf)).
- **Direct Link Verification**: Verified that card straplines and sources audit entries point directly to the specific PDF document file, rather than the generic landing page.

### 2. Accurate Event Date Stamping (`scripts/sources/events-source.js`)
- **Farmers Market Date Fix**: Corrected the event date for *Warboys Farmers Market & Coffee Morning* to **Saturday 5 September 2026** (`2026-09-05` • 9:00 AM - 12:30 PM), removing the artificial "TODAY" stamp.

### 3. Dynamic DOCX Meeting Minutes Extractor (`scripts/utils/docx-parser.js`)
- **Live OpenXML Ingestion**: Dynamic parser (`parseDocxFromUrl`) streams `.docx` meeting minute files from the Parish Council calendar (`https://www.warboysparishcouncil.gov.uk/the-council/meeting-calendar/?meetings_view-1=list`), extracts OpenXML paragraphs, and synthesizes governance cards.

---

## 🧪 Verification Results

### 1. Ingestion Pipeline & Calendar Store Verification
```bash
npm run test:sources
```
- **Result**: Verified that Warboys Diary items carry direct PDF issue links and accurate occurrence dates.

### 2. Eleventy SSG Build Verification
```bash
npm run build
```
- **Result**: Eleventy compiled 8 static pages in 0.43s (`/`, `/calendar/`, `/archive/`, `/archive/2026-08-15/`, `/archive/2026-08-15/sources/`, `/feed.xml`).

---

## 🚀 How to Run & Fork

Refer to the included [`README.md`](file:///home/dsample/code/village-daily/README.md) for full instructions:
- **Local Dev**: `npm run dev`
- **Data Ingestion**: `npm run ingest` (with API key) or `npm run ingest:mock` (offline)
- **Forking**: Copy repository, edit `village.config.json` with target village name/county, and push to GitHub.
