# Walkthrough: Live Site Launch (daily.warboys.uk)

🎉 **Warboys Daily Briefing is live in production at [daily.warboys.uk](https://daily.warboys.uk)!**

---

## 🌟 Live Architecture Highlights

- **Live URL**: [https://daily.warboys.uk](https://daily.warboys.uk)
- **Hosting Platform**: Cloudflare Pages (Global Edge CDN)
- **Automation Pipeline**: GitHub Actions (`.github/workflows/daily-briefing.yml`) scheduled daily at **06:00 AM UTC**
- **Data Ingestion**: 9 Data Sources (Parish Council DOCX minutes, HDC Planning portal, Cambridgeshire County Council committee decisions, WPA Sway REST newsletters, Warboys Diary PDF issue links, Friends of Warboys Library, Village Scene, Google News, Hunts Post)
- **School Hub & iCal Feeds**: Warboys Primary Academy (`/wpa/`) with official schedule table year-group coloured badges (`.badge-year-r` ... `.badge-year-y6`) and RFC 5545 iCalendar feeds (`/events.ics`, `/wpa.ics`, `/wpa-r.ics` ... `/wpa-y6.ics`)
- **Edge Caching**: Configured via [`src/public/_headers`](file:///home/dsample/code/village-daily/src/public/_headers) with 1-year asset immutability and 1-day CDN briefing caching.

---

## 🧪 Verification & Repository Status

```bash
git status
```
```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```
- **Latest Commit**: `bfefee5` (*"docs: set siteUrl to https://daily.warboys.uk"*).
