# 🏡 Village Daily Briefing System (Warboys, Cambridgeshire)

A forkable, automated local news and governance briefing generator for **Warboys** (Cambridgeshire, UK). Built with [Eleventy (11ty)](https://www.11ty.dev/) and powered by a token-optimized **Node.js Agentic LLM Pipeline** with tool-calling to fetch, extract, inspect, and summarize daily council minutes, planning applications, news, and community updates.

---

## 🌟 Key Features

- **Pre-configured for Warboys**: Aggregates data from Huntingdonshire District Council planning portal, Warboys Parish Council agendas/minutes, and local news RSS feeds out-of-the-box.
- **Paywall & Script-Heavy Reader Bypass**: Integrated with `smry.ai` reader fallback to automatically extract clean full-article text from news sites like *The Hunts Post*.
- **Forkable Architecture**: Change `village.config.json` to adapt the system for any UK village, town, or parish.
- **LLM API Quota & Cost Safeguards**:
  - Deterministic pre-filtering in JavaScript cleans HTML, strips footers, and caps snippet sizes before calling the LLM.
  - Hard-capped agent tool turns (max 2 turns) and maximum token limit (1500 tokens).
  - Short-circuit zero-item bypass: If no new updates are detected, generates a static briefing without spending LLM tokens.
  - Supports free-tier compatible models (`gemini-2.0-flash`, `gpt-4o-mini`, OpenRouter free models).
- **Direct Source Citations**: Every item in the daily briefing text includes inline markdown links (`[Source Name](url)`) pointing directly to the original source page or PDF.
- **Clean URL Structure**:
  - `/`: Today's latest daily briefing.
  - `/archive/`: Directory listing all historical daily briefings.
  - `/archive/YYYY-MM-DD/`: Canonical permalink for any daily briefing.
  - `/archive/YYYY-MM-DD/sources/`: Data transparency page showing exact raw sources, item counts, and snippets processed for that day.
  - `/feed.xml`: RSS / Atom feed for subscribers.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Data Ingestion (Mock / Dry-Run Mode)
To test data extraction and daily briefing generation without requiring API keys:
```bash
npm run ingest:mock
```

### 3. Run Data Ingestion with LLM API Key
Create a `.env` file with your API key:
```env
LLM_API_KEY=your_gemini_or_openai_key
LLM_MODEL=gemini-2.0-flash
```
Then run:
```bash
npm run ingest
```

### 4. Build and Preview Site
```bash
npm run dev
```
Open [http://localhost:8080](http://localhost:8080) (or `http://<your-local-ip>:8080` from another device on your local network) to inspect today's briefing, the archive, and daily source breakdown pages.

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
MIT License.
