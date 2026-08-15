# Walkthrough: Warboys Primary Academy (WPA) Section Heading Document Links

We have updated the WPA school subpage (`/archive/YYYY-MM-DD/wpa/`) to match the clean design pattern used in the meeting minute sections: direct document links are placed right next to the section headings without repeating the section title in the link text or creating duplicate inner banners.

---

## 🛠️ Section Heading & Document Link Design ([`src/archive/wpa.njk`](file:///home/dsample/code/village-daily/src/archive/wpa.njk))

1. **📅 Dates for Your Diary**:
   - **Heading**: `📅 Dates for Your Diary (Autumn Term 2026)`
   - **Inline Link Button**: `[📅 Full Schedule in Sway →](https://sway.cloud.microsoft/MLTtAeuJheXv3QNm?ref=Link)`

2. **📢 Weekly Newsletter Announcements**:
   - **Heading**: `📢 Weekly Newsletter Announcements (16 July 2026)`
   - **Inline Link Button**: `[📰 Read Sway Newsletter →](https://sway.cloud.microsoft/MLTtAeuJheXv3QNm?ref=Link)`

3. **💬 Parent Forum Meeting Minutes**:
   - **Heading**: `💬 Parent Forum Meeting Minutes – 11 June 2026`
   - **Inline Link Button**: `[📄 Full Minutes (PDF) →](https://www.wpa.education/_resources/900970c4-19bf-4b59-b76b-d6ffdd00534b)`

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (5421ms)
ℹ tests 10
ℹ suites 7
ℹ pass 10
ℹ fail 0
```

### 2. SSG Build Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled 10 static pages cleanly in 0.49s including `_site/archive/2026-08-15/wpa/index.html`.
