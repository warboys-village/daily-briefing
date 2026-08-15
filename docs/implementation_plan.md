# Implementation Plan: Village Daily Briefing System (Warboys, Cambridgeshire)

Create a forkable, automated local news and governance daily briefing website for **Warboys** (Cambridgeshire, UK). Built with **Eleventy (11ty)**, hosted via **Cloudflare Pages**, and powered by an **LLM-optimized Node.js Ingestion Pipeline** with tool-calling to fetch, extract, inspect, and summarize daily council minutes, planning applications, news, and community updates.

---

## Goal Description
- **Forkable Architecture**: A single configuration file (`village.config.json`) sets the target location (Warboys), local councils (Huntingdonshire District Council, Cambridgeshire County Council, Warboys Parish Council), and active data source plugins.
- **Strict LLM API Budget & Token Optimization**:
  - **Code-First Ingestion**: Data extractors perform parsing, date filtering, deduplication, HTML cleaning, and text truncation deterministically in Node.js *before* invoking the LLM.
  - **Turn & Budget Limits**: The LLM Agent loop is capped (max 2 tool calls or single batched prompt) to minimize API quota usage.
  - **Zero-Data Short Circuit**: If no new items are detected on a given day, the script creates a clean status update without calling the LLM API.
  - **Free-Tier Friendly**: Supports `gemini-2.0-flash`, `gemini-1.5-flash`, `gpt-4o-mini`, or OpenRouter free models out-of-the-box.
- **Direct Citations**: Every item in the briefing includes explicit citations and direct markdown links to the original source documents/URLs.
- **URL & Archive Structure**:
  - `/`: Serves today's daily briefing directly.
  - `/archive/`: List of all daily briefings grouped by date.
  - `/archive/YYYY-MM-DD/`: Canonical permalink for any given day's briefing.
  - `/archive/YYYY-MM-DD/sources/`: Detailed breakdown of data sources queried and raw items processed for that day.
  - `/feed.xml`: RSS / Atom feed.
- **Cloudflare Pages & GitHub Actions**:
  - Daily cron workflow running at 6:00 AM UTC.
  - Automatic deployment to Cloudflare Pages.

---

## User Review Required

> [!IMPORTANT]
> **LLM Usage Minimization Strategy**:
> 1. **Local Pre-Filtering**: Strip boilerplates, footers, and stale items in JS code first. Send only relevant, cleaned snippets to the LLM.
> 2. **Capped Agent Iterations**: Limit max agent tool calls to 2 turns max.
> 3. **No-Call Bypass**: If no new news, planning, or council items are found for the day, generate a lightweight static briefing with 0 LLM calls.
> 4. **Free Tier Defaults**: Pre-configured to work with free-tier keys (e.g. Gemini 2.0 Flash / OpenRouter free tier).

---

## Open Questions
- *None*. Requirements, optimization strategy, routing structure, and target configuration are aligned.

---

## Proposed Changes

### 1. Configuration & Site Architecture

#### `village.config.json`
Central configuration for Warboys (and template for forked repositories).
```json
{
  "villageName": "Warboys",
  "county": "Cambridgeshire",
  "districtCouncil": "Huntingdonshire District Council",
  "parishCouncil": "Warboys Parish Council",
  "siteTitle": "Warboys Daily Briefing",
  "siteDescription": "Daily aggregated local news, council meeting minutes, and planning applications for Warboys, Cambridgeshire.",
  "timezone": "Europe/London",
  "outputDir": "src/briefings",
  "llmConfig": {
    "model": "gemini-2.0-flash",
    "maxTurns": 2,
    "maxTokens": 1500,
    "preFilterDays": 7,
    "maxItemSnippetLength": 800
  },
  "sources": [
    {
      "id": "google-news",
      "type": "rss",
      "name": "Google News (Warboys)",
      "url": "https://news.google.com/rss/search?q=Warboys+Cambridgeshire&hl=en-GB&gl=GB&ceid=GB:en",
      "enabled": true
    },
    {
      "id": "hdc-planning",
      "type": "hdc-planning",
      "name": "Huntingdonshire District Council Planning",
      "parishFilter": "Warboys",
      "enabled": true
    },
    {
      "id": "warboys-parish",
      "type": "parish-council",
      "name": "Warboys Parish Council",
      "url": "https://warboysparishcouncil.co.uk",
      "enabled": true
    }
  ]
}
```

---

### 2. Low-Cost Ingestion & LLM Pipeline (`./scripts/`)

#### `[NEW]` `scripts/utils/pre-filter.js`
Deterministic pre-filter:
- Removes duplicate items by title/URL.
- Filters out items older than `preFilterDays`.
- Cleans HTML boilerplate & strips long irrelevant text, capping each raw item snippet (e.g. max 800 chars).

#### `[NEW]` `scripts/agent/llm-client.js`
Universal lightweight client supporting Gemini / OpenAI / OpenRouter with strict token limits and mock offline mode.

#### `[NEW]` `scripts/agent/tools.js` & `briefing-agent.js`
Agent loop capped at 2 turns max:
1. Runs pre-filtered extractors.
2. If total fresh items = 0, generates "No new updates for today" directly without calling LLM.
3. If fresh items exist, calls LLM Agent with concise pre-filtered items context + tools (`fetch_page_content`, `extract_pdf_text`).
4. Outputs `src/briefings/YYYY-MM-DD.md` with in-text citation links `[Source](url)`.

---

### 3. Static Site Generator (Eleventy)

#### `[NEW]` `.eleventy.js` & Templates
- `/`: Latest briefing.
- `/archive/YYYY-MM-DD/`: Daily briefing archive page.
- `/archive/YYYY-MM-DD/sources/`: Daily sources detail page.
- `/archive/`: Full archive listing.
- `/feed.xml`: RSS XML feed.

---

### 4. CI/CD & Deployment

#### `[NEW]` `.github/workflows/daily-briefing.yml`
Runs ingestion, builds Eleventy site, deploys to Cloudflare Pages.

#### `[NEW]` `README.md`
Documentation for setup, free API keys, and repository forking.

---

## Verification Plan

### Automated Tests & Pipeline Checks
1. **Source Pre-Filtering & Mock Test**:
   - `npm run test:sources`: Validates extractors and local pre-filtering.
   - `npm run ingest -- --mock`: Runs dry-run ingestion with zero LLM API calls.
2. **Token Limit Verification**:
   - Verify raw prompt context sent to LLM remains under ~3,000 tokens per daily run.
3. **Eleventy SSG Build Verification**:
   - `npm run build`: Ensures 11ty compiles cleanly.
   - Checks URLs: `/`, `/archive/`, `/archive/2026-08-14/`, `/archive/2026-08-14/sources/`, `/feed.xml`.

### Manual Verification
1. **Local Preview**:
   - Run `npm run dev` to inspect site layout, typography, navigation, and citation links.
