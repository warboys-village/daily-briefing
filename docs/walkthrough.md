# Walkthrough: Desktop 'Subscribe to calendar' Button Copy

Updated desktop button text across WPA subpages, archive pages, and the events calendar page to read **`📅 Subscribe to calendar →`** (shortening to **`📅 Subscribe →`** on mobile viewports < 640px).

---

## 🛠️ Summary of Accomplishments

### 1. Subscribe Button Copy Update
Updated subscribe buttons in [`src/wpa.njk`](file:///home/dsample/code/village-daily/src/wpa.njk), [`src/archive/wpa.njk`](file:///home/dsample/code/village-daily/src/archive/wpa.njk), and [`src/calendar/index.njk`](file:///home/dsample/code/village-daily/src/calendar/index.njk):

- **Desktop Viewport**: `📅 Subscribe to calendar →`
- **Mobile Viewport (< 640px)**: `📅 Subscribe →`

```html
<button type="button" class="btn-open-wpa-ical-modal button-link" style="font-size: 0.8rem; padding: 0.3rem 0.65rem;">
  📅 <span class="btn-ical-full-text">Subscribe to calendar</span><span class="btn-ical-mobile-text">Subscribe</span> &rarr;
</button>
```

---

## 🧪 Verification Results

### 1. Automated Test Suite Execution
```bash
npm test
```
```
✔ Village Daily System - Comprehensive Regression Test Suite (5558ms)
ℹ tests 15
ℹ suites 8
ℹ pass 15
ℹ fail 0
```

### 2. SSG Build Output Verification
```bash
npm run ingest:mock && npm run build
```
- **Result**: Eleventy compiled **19 static output files** in 0.62s cleanly.
