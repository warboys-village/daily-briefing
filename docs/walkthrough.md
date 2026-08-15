# Walkthrough: Top-of-Page iCal Placement & WPA Year-Group Selection Modal

We have updated both the **Warboys Community Events Calendar** (`/calendar/`) and the **Warboys Primary Academy (WPA)** subpage (`/archive/YYYY-MM-DD/wpa/`) to place subscription triggers cleanly at the **top of each page header/banner area**, eliminating section block clutter and removing visible `.ics` file paths.

---

## 🛠️ Summary of Accomplishments

### 1. WPA Interactive Year Selection Modal ([`src/archive/wpa.njk`](file:///home/dsample/code/village-daily/src/archive/wpa.njk))
- **Top Banner Placement**: Prominent `📅 Subscribe to iCalendar Feed →` button in the top school header banner.
- **Interactive Overlay Modal (`#wpa-ical-modal`)**: Clicking opens a modal listing all 7 year groups + combined feed with clean human-readable titles (no raw file paths):
  - **`Reception/Early Years`** &rarr; `[Subscribe →]` (`/wpa-r.ics`)
  - **`Year 1`** &rarr; `[Subscribe →]` (`/wpa-y1.ics`)
  - **`Year 2`** &rarr; `[Subscribe →]` (`/wpa-y2.ics`)
  - **`Year 3`** &rarr; `[Subscribe →]` (`/wpa-y3.ics`)
  - **`Year 4`** &rarr; `[Subscribe →]` (`/wpa-y4.ics`)
  - **`Year 5`** &rarr; `[Subscribe →]` (`/wpa-y5.ics`)
  - **`Year 6`** &rarr; `[Subscribe →]` (`/wpa-y6.ics`)
  - **`All Years Combined`** &rarr; `[Subscribe →]` (`/wpa.ics`)
- **Section Cleanliness**: Removed inline subscription boxes from inside the *Dates for Your Diary* content section block.

### 2. Village Events Calendar Top Header Link ([`src/calendar/index.njk`](file:///home/dsample/code/village-daily/src/calendar/index.njk))
- **Top Header Placement**: `📅 Subscribe to iCalendar Feed →` placed cleanly right aligned in the page header without displaying the raw `.ics` file path.

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (5055ms)
ℹ tests 13
ℹ suites 8
ℹ pass 13
ℹ fail 0
```

### 2. SSG Build Output Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled **19 static files** cleanly in 0.43s including `_site/archive/2026-08-15/wpa/index.html` and `_site/calendar/index.html`.
