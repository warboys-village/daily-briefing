# Walkthrough: WPA 7 Year-Group iCalendar Feeds (`/wpa-r.ics` to `/wpa-y6.ics`)

We have generated **7 year-group specific iCalendar (`.ics`) subscription feeds** for Warboys Primary Academy (WPA), allowing parents to subscribe specifically to their child's year group schedule or the combined school calendar.

---

## 🛠️ Summary of Accomplishments

### 1. Year Group Dataset (`src/_data/wpa_years.json`)
Defines the 7 targeted year group feeds:
1. **`R`**: `/wpa-r.ics` &rarr; Described as **`Reception/Early Years`**
2. **`Y1`**: `/wpa-y1.ics` &rarr; `Year 1`
3. **`Y2`**: `/wpa-y2.ics` &rarr; `Year 2`
4. **`Y3`**: `/wpa-y3.ics` &rarr; `Year 3`
5. **`Y4`**: `/wpa-y4.ics` &rarr; `Year 4`
6. **`Y5`**: `/wpa-y5.ics` &rarr; `Year 5`
7. **`Y6`**: `/wpa-y6.ics` &rarr; `Year 6`

### 2. Year-Group iCal Feed Generator Template (`src/wpa-years.ics.njk`)
- Dynamically compiles all 7 `.ics` files during the build (`_site/wpa-r.ics`, `_site/wpa-y1.ics`, ..., `_site/wpa-y6.ics`).
- **Filtering Logic**: An event is included in a year feed if its `yearGroups` array contains that year's code (e.g. `R` or `Y5`) OR `"All Years"`.
- **Verification**:
  - `Bikeability Course` (applicable only to `Y5` and `Y6`) is included in `/wpa-y5.ics` and `/wpa-y6.ics`, but excluded from `/wpa-r.ics` through `/wpa-y4.ics`.
  - All-school events (e.g. `Autumn Term Begins`) are included in all 7 year feeds.

### 3. WPA Subpage Subscription Panel ([`src/archive/wpa.njk`](file:///home/dsample/code/village-daily/src/archive/wpa.njk))
Displays a dedicated **Year Group iCal Subscription Panel**:
- `[Reception/Early Years (/wpa-r.ics)]`
- `[Year 1 (/wpa-y1.ics)]`
- `[Year 2 (/wpa-y2.ics)]`
- `[Year 3 (/wpa-y3.ics)]`
- `[Year 4 (/wpa-y4.ics)]`
- `[Year 5 (/wpa-y5.ics)]`
- `[Year 6 (/wpa-y6.ics)]`
- `[All Years (/wpa.ics)]`

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (5000ms)
  ✔ 7. iCalendar (.ics) Subscriptions Generator & 7 Year Feeds
    ✔ formats dates into YYYYMMDD string for iCal headers
    ✔ generates valid RFC 5545 iCalendar content structure
    ✔ verifies 7 WPA year group dataset definition including Reception/Early Years
ℹ tests 13
ℹ suites 8
ℹ pass 13
ℹ fail 0
```

### 2. SSG Build Output Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled **19 static files** in 0.48s including all 7 year-group `.ics` feeds and the combined `/wpa.ics` and `/events.ics`.
