# Walkthrough: Direct Hunts Post RSS, Full-Text Extraction & 5-Layer Death Notice Filtering

Implemented direct news ingestion from **The Hunts Post** (`https://www.huntspost.co.uk/news/rss`), **full-text article paragraph extraction**, village location filtering (`Warboys`), and a **5-layer death notice pre-filtering system** that permanently eliminates obituaries (such as *MEGAN IRENE STEPHENS*) from daily briefings.

---

## 🛠️ Summary of Accomplishments

### 1. Direct Hunts Post RSS Feed & Full-Text Ingestion ([`village.config.json`](file:///home/dsample/code/village-daily/village.config.json), [`scripts/sources/rss-source.js`](file:///home/dsample/code/village-daily/scripts/sources/rss-source.js))
- Switched Hunts Post source URL to publisher RSS (`https://www.huntspost.co.uk/news/rss`) instead of Google News RSS search proxies.
- Configured `RssSource` to fetch full article body paragraphs (`article p`) for Hunts Post articles (persistently cached in `processed_documents_cache.json`).
- Applied location keyword filtering (`Warboys`) against the complete article text, ensuring articles about Warboys (e.g. *fenside caravan park*) are retained with full context while non-Warboys district news is filtered out.

### 2. 5-Layer Death Notice Filtering Engine ([`scripts/utils/pre-filter.js`](file:///home/dsample/code/village-daily/scripts/utils/pre-filter.js#L1-L40))
Replaced simple title uppercase checking with a 5-layer pre-filter:
- **Layer 1 (URL Path Checks)**: Drops URLs matching `/announcements/`, `/obituaries/`, `/in-memoriam/`, `/family-notices/`, `familynotices.co.uk`, `remembering-`.
- **Layer 2 (Dynamic Suffix Stripping)**: Regex strips ANY trailing source suffix (`- huntspost.co.uk`, `- The Hunts Post`, `- Cambs Times`, `- Google News`, etc.) before evaluating title casing or name patterns.
- **Layer 3 (Expanded Obituary Keyword Dictionary)**: Drops items containing keywords like `passed away`, `crematorium`, `funeral service`, `beloved wife/husband/mother/father`, `in loving memory`, `donations in lieu`, `family flowers only`.
- **Layer 4 (Structural Casing & Name + Age Matching)**: Drops pattern matches like `NAME, Age` (`"Stephens, Megan Irene, 85"`, `"Megan Irene Stephens (85)"`) and uppercase full names.
- **Layer 5 (LLM Agent Negative Constraint)**: Added explicit negative instruction in [`scripts/agent/briefing-agent.js`](file:///home/dsample/code/village-daily/scripts/agent/briefing-agent.js#L27) instructing the LLM editor to exclude personal funeral notices and obituaries.

### 3. Automated Test Suite Expansion ([`tests/regression-suite.test.js`](file:///home/dsample/code/village-daily/tests/regression-suite.test.js#L149-L162))
- Added unit tests verifying suffix-stripped death notice filtering (`MEGAN IRENE STEPHENS - huntspost.co.uk`) and announcement URL path detection.

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (13138ms)
ℹ tests 16
ℹ suites 8
ℹ pass 16
ℹ fail 0
```

### 2. Live Ingestion & Output Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: `MEGAN IRENE STEPHENS` returned **0 results** across `src/briefings/*.md` and `_site/index.html`.
- **Git Commit**: `3e6cbce` (*"fix: switch Hunts Post to direct RSS with full-text article extraction and implement 5-layer death notice pre-filter"*).
