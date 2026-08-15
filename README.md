# 🏡 Warboys Daily Briefing System ([daily.warboys.uk](https://daily.warboys.uk))

A forkable, automated local news, governance, and community events briefing generator for **Warboys** (Cambridgeshire, UK), live at **[daily.warboys.uk](https://daily.warboys.uk)**. Built with [Eleventy (11ty)](https://www.11ty.dev/) and powered by a token-optimized **Node.js Agentic LLM Pipeline** with tool-calling to fetch, extract, inspect, and summarize daily council minutes, planning applications, news, school updates, and community calendar events.

---

## 🌟 Key Features

- **Pre-configured for Warboys**: Aggregates data from 9 distinct local sources out-of-the-box:
  1. **Warboys Parish Council**: Extracted directly from DOCX meeting minutes with administrative fluff removal.
  2. **Huntingdonshire District Council (HDC) Planning**: Live planning application scraping and categorization.
  3. **Cambridgeshire County Council**: Committee decision monitoring for Highways, Transport & Infrastructure.
  4. **Warboys Primary Academy (WPA)**: Sway REST API parser extracting weekly school announcements, dates for your diary, and Parent Forum PDF minutes.
  5. **Warboys Diary & Community Events**: Community event extraction with direct links to published monthly PDF issue pages.
  6. **Village Scene Magazine**: Parish & village community news.
  7. **Friends of Warboys Library (FOWL)**: Library session schedules and community events.
  8. **Google News (Warboys)**: Local news RSS feed aggregation with death notice pre-filtering.
  9. **The Hunts Post**: Local newspaper RSS ingestion.

- **Warboys Primary Academy (WPA) School Hub (`/wpa/`)**:
  - Dedicated subpage featuring official school announcements, Parent Forum minutes, and a *Dates for Your Diary* section with color-coded year group pill badges matching the official newsletter table (`Reception/R` through `Year 6` and `All Years`).

- **RFC 5545 iCalendar Subscription Feeds**:
  - `/events.ics`: Community events iCalendar subscription.
  - `/wpa.ics`: All-years combined WPA school calendar feed.
  - `/wpa-r.ics` through `/wpa-y6.ics`: Individual per-year group WPA iCalendar subscription feeds for Apple Calendar, Google Calendar, and Microsoft Outlook.

- **LLM API Quota & Cost Safeguards**:
  - Deterministic pre-filtering in JavaScript cleans HTML, strips footers, filters death notices, and caps snippet sizes before calling the LLM.
  - Persistent document processing cache (`src/_data/processed_documents_cache.json`) with automatic 180-day TTL and size pruning.
  - Strict British English language enforcement across summaries and briefings.

- **Clean URL Structure**:
  - `/`: Today's latest aggregated daily briefing.
  - `/wpa/`: Warboys Primary Academy school briefing & diary.
  - `/calendar/`: Community events calendar.
  - `/archive/`: Directory listing all historical daily briefings.
  - `/archive/YYYY-MM-DD/`: Canonical permalink for any daily briefing.
  - `/archive/YYYY-MM-DD/sources/`: Data transparency page showing exact raw sources, item counts, and snippets processed for that day.
  - `/archive/YYYY-MM-DD/wpa/`: Historical WPA archive briefing page.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Regression Test Suite
```bash
npm test
```

### 3. Run Data Ingestion (Mock / Dry-Run Mode)
To test data extraction and daily briefing generation without requiring API keys:
```bash
npm run ingest:mock
```

### 4. Run Data Ingestion with LLM API Key
Create a `.env` file with your API key:
```env
LLM_API_KEY=your_gemini_or_openai_key
LLM_MODEL=gemini-2.0-flash
```
Then run:
```bash
npm run ingest
```

### 5. Build and Preview Site
```bash
npm run dev
```
Open [http://localhost:8080](http://localhost:8080) (or `http://<your-local-ip>:8080` from another device on your local network) to inspect today's briefing, the WPA hub, events calendar, archives, and daily source breakdown pages.

---

## ⚙️ How to Fork for Another Village or Town

1. **Fork this repository** on GitHub.
2. Edit `village.config.json` with your target location and council details:
```json
{
  "villageName": "YourVillage",
  "county": "YourCounty",
  "districtCouncil": "Your District Council Name",
  "parishCouncil": "Your Parish Council Name",
  "siteTitle": "YourVillage Daily Briefing",
  "sources": [
    {
      "id": "local-news-rss",
      "type": "rss",
      "name": "Local Gazette RSS",
      "url": "https://example.com/rss",
      "enabled": true
    }
  ]
}
```
3. To add custom scrapers or extractors, add a subclass of `BaseSource` in `scripts/sources/` and register it in `scripts/ingest.js`.

---

## ☁️ Deploying to Cloudflare Pages & GitHub Actions

1. In GitHub Repository Secrets (`Settings -> Secrets & variables -> Actions`), add:
   - `LLM_API_KEY`: Your Gemini or OpenAI API key.
   - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API Token.
   - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID.
2. Enable GitHub Actions. The workflow `.github/workflows/daily-briefing.yml` will automatically run at **6:00 AM UTC daily**, generate the new briefing, commit it to `src/briefings/YYYY-MM-DD.md`, build Eleventy, and deploy to Cloudflare Pages.

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](file:///home/dsample/code/village-daily/LICENSE) file for details.
