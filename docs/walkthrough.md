# Walkthrough: Replacing Tooling Names with Document Purpose Wording

Replaced user-facing UI references to software tooling (*"Microsoft Sway" / "Sway"*) with functional document purpose descriptions (*"Weekly School Newsletter"*, *"Full Schedule in Newsletter"*).

---

## 🛠️ Summary of Accomplishments

### 1. User Interface Templates ([`src/wpa.njk`](file:///home/dsample/code/village-daily/src/wpa.njk) & [`src/archive/wpa.njk`](file:///home/dsample/code/village-daily/src/archive/wpa.njk))
- **Subtitle**: Updated to `Weekly School Newsletter, Dates for Your Diary (R to Year 6), & Parent Forum Minutes`
- **Banner Link**: Updated to `📰 Read Full Weekly Newsletter →`
- **Section Link**: Updated to `📅 Full Schedule in Newsletter →`
- **Section Link**: Updated to `📰 Read School Newsletter →`

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (5245ms)
ℹ tests 15
ℹ suites 8
ℹ pass 15
ℹ fail 0
```

### 2. SSG Build Output Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled **19 static output files** in 0.69s cleanly.
