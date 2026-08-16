# Implementation Plan: Direct Hunts Post RSS, Full-Text Article Extraction & 5-Layer Death Notice Filter

Fetch direct news from **The Hunts Post** (`https://www.huntspost.co.uk/news/rss`), extract **full article text** to determine village relevance, and implement a **5-layer death notice pre-filter** to permanently prevent obituaries (such as *MEGAN IRENE STEPHENS*) from appearing in daily briefings.

---

## 🎯 Problem & Architecture Solution

### 1. Root Cause of *MEGAN IRENE STEPHENS* Reappearance
- **Suffix Removal Failure**: Google News returned `title: "MEGAN IRENE STEPHENS - huntspost.co.uk"`. The pre-filter regex previously only stripped `- The Hunts Post`, leaving `- huntspost.co.uk` attached.
- **Title Casing Failure**: Because `"huntspostcouk"` contained lowercase letters, `lettersOnly === lettersOnly.toUpperCase()` failed.
- **Short Snippet Limitation**: RSS feeds only provide 1-sentence snippets, making it hard to judge whether a Hunts Post article is about Warboys or another town in Huntingdonshire.

### 2. The Comprehensive Solution
1. **Direct Hunts Post RSS (`https://www.huntspost.co.uk/news/rss`)**: Discontinue relying on Google News RSS queries for Hunts Post.
2. **Full-Text Article Extraction & Caching**: `RssSource` fetches full body paragraphs (`article p`) for Hunts Post items (persistently cached in `processed_documents_cache.json`).
3. **Village Relevance Filtering**: Checks full article text for target location keywords (`Warboys`, `PE28`, `Warboys Parish`) so only stories about the village are retained.
4. **5-Layer Death Notice Pre-Filter**: Eliminates obituaries across URL paths, dynamic suffix stripping, keyword dictionary, Name+Age pattern matching, and LLM negative prompting.

---

## 🛠️ Proposed Changes

### 1. Update Source Configuration ([`village.config.json`](file:///home/dsample/code/village-daily/village.config.json))

#### [MODIFY] `village.config.json`
Point Hunts Post source directly to publisher RSS:
```diff
     {
       "id": "hunts-post",
       "type": "rss",
       "name": "The Hunts Post News",
-      "url": "https://news.google.com/rss/search?q=Warboys+site:huntspost.co.uk&hl=en-GB&gl=GB&ceid=GB:en",
+      "url": "https://www.huntspost.co.uk/news/rss",
+      "filterKeyword": "Warboys",
       "enabled": true
     }
```

---

### 2. Full-Text Article Extraction & Relevance Filter ([`scripts/sources/rss-source.js`](file:///home/dsample/code/village-daily/scripts/sources/rss-source.js))

#### [MODIFY] `scripts/sources/rss-source.js`
Enhance `RssSource` to fetch full article body paragraphs for Hunts Post URLs, check for village keyword relevance, and store full text.

---

### 3. 5-Layer Robust Death Notice Filter ([`scripts/utils/pre-filter.js`](file:///home/dsample/code/village-daily/scripts/utils/pre-filter.js))

#### [MODIFY] `scripts/utils/pre-filter.js`
Replace simple title checks with a 5-layer filtering engine.

---

### 4. Agent System Prompt Negative Constraint ([`scripts/agent/briefing-agent.js`](file:///home/dsample/code/village-daily/scripts/agent/briefing-agent.js))

#### [MODIFY] `scripts/agent/briefing-agent.js`
Add explicit negative constraint to LLM prompt.

---

### 5. Regression Test Suite ([`tests/regression-suite.test.js`](file:///home/dsample/code/village-daily/tests/regression-suite.test.js))

#### [MODIFY] `tests/regression-suite.test.js`
Add unit tests verifying full-text extraction, village location filtering, and suffix-stripped death notice filtering.
