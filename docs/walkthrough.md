# Walkthrough: RFC 5545 iCalendar Feeds (`/events.ics` & `/wpa.ics`)

We have created standard **RFC 5545 iCalendar (`.ics`) feeds** for both the main village community events calendar (`/events.ics`) and the Warboys Primary Academy school diary (`/wpa.ics`), allowing residents and parents to subscribe via Apple Calendar, Google Calendar, and Microsoft Outlook.

---

## 🛠️ Summary of Accomplishments

### 1. iCalendar Generator Helper (`scripts/utils/ics-generator.js`)
- Generates RFC 5545 compliant `.ics` calendar structure:
  - `BEGIN:VCALENDAR` / `END:VCALENDAR`
  - Headers: `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME`, `X-WR-TIMEZONE:Europe/London`
  - `VEVENT` blocks with raw unescaped text (`| safe`), ISO UTC timestamps (`DTSTAMP`), all-day dates (`DTSTART;VALUE=DATE`), venue locations, and direct event URLs.

### 2. Main Village Events Feed (`src/events.ics.njk` -> `/events.ics`)
- **Route**: `_site/events.ics`.
- **Data Source**: `src/_data/events_calendar.json` (Warboys Farmers Market, Community Showcase, Choir Concerts, FOWL Library sessions, and Christmas lighting switch-on).

### 3. WPA School Diary Feed (`src/wpa.ics.njk` -> `/wpa.ics`)
- **Route**: `_site/wpa.ics`.
- **Data Source**: `src/_data/wpa_calendar.json` (Autumn Term start, Year 5/6 Bikeability, Individual & Sibling Photos, Half Term holidays).

### 4. UI Subscription Buttons
- **Events Calendar Header** ([`src/calendar/index.njk`](file:///home/dsample/code/village-daily/src/calendar/index.njk)):
  `📅 Subscribe to iCal Feed (/events.ics) →`
- **WPA Subpage Banner** ([`src/archive/wpa.njk`](file:///home/dsample/code/village-daily/src/archive/wpa.njk)):
  `📅 Subscribe to iCal (/wpa.ics) →`

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (4994ms)
  ✔ 7. iCalendar (.ics) Subscriptions Generator (/events.ics & /wpa.ics)
    ✔ formats dates into YYYYMMDD string for iCal headers
    ✔ generates valid RFC 5545 iCalendar content structure
ℹ tests 12
ℹ suites 8
ℹ pass 12
ℹ fail 0
```

### 2. SSG Build & Compiled File Inspection
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled 12 static files in 0.35s including:
  - `_site/events.ics` (208 lines, 9.2KB)
  - `_site/wpa.ics` (54 lines, 1.5KB)
- **Raw iCal Inspection**: Verified clean RFC 5545 output with zero HTML entity escaping bugs (`SUMMARY:Warboys Local History Society: 'Bravery, Beheadings and Barbeques'`).
