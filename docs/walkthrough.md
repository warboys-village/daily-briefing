# Walkthrough: Death Notice Pre-Filter & Source Suffix Stripping

Updated `isDeathNotice(item)` in `scripts/utils/pre-filter.js` to strip RSS source suffixes (e.g., `- The Hunts Post`, `- The Hunts Post News`, `- Cambs Times`, `- Google News`) *before* checking title uppercase status. This ensures that obituary headlines like `MEGAN IRENE STEPHENS - The Hunts Post` are cleanly caught, pre-filtered, and permanently excluded from all briefing outputs.

---

## 🛠️ Summary of Accomplishments

### 1. Enhanced Pre-Filter Logic ([`scripts/utils/pre-filter.js`](file:///home/dsample/code/village-daily/scripts/utils/pre-filter.js))
```javascript
function isDeathNotice(item) {
  if (!item) return false;
  let title = (item.title || '').trim()
    .replace(/\s*-\s*The Hunts Post$/i, '')
    .replace(/\s*-\s*The Hunts Post News$/i, '')
    .replace(/\s*-\s*Cambs Times$/i, '')
    .replace(/\s*-\s*Google News$/i, '')
    .trim();

  // ALL-CAPS names from Hunts Post / newspaper death notice columns (e.g. "MEGAN IRENE STEPHENS")
  if (title.length > 5 && title === title.toUpperCase() && /^[A-Z\s'-]+$/.test(title)) {
    const isSpecialCaps = title.includes('WARBOYS') || title.includes('COUNCIL') || title.includes('NOTICE') || title.includes('PLANNING') || title.includes('PARISH');
    if (!isSpecialCaps) {
      return true;
    }
  }

  return false;
}
```

### 2. File Cleanup ([`src/briefings/2026-08-14.md`](file:///home/dsample/code/village-daily/src/briefings/2026-08-14.md), [`src/briefings/2026-08-15.md`](file:///home/dsample/code/village-daily/src/briefings/2026-08-15.md), [`src/_data/processed_documents_cache.json`](file:///home/dsample/code/village-daily/src/_data/processed_documents_cache.json))
- Removed `MEGAN IRENE STEPHENS` from static briefing markdown files and from document processing cache.

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (4605ms)
ℹ tests 15
ℹ suites 8
ℹ pass 15
ℹ fail 0
```

### 2. SSG Build Output Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled **19 static output files** in 0.73s cleanly.
