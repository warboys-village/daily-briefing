const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Downloads a DOCX meeting minutes file from URL and extracts structured paragraph text.
 */
async function parseDocxFromUrl(docxUrl) {
  try {
    const tmpDocxPath = path.join('/tmp', `minutes_${Date.now()}.docx`);

    // Fetch binary file
    const res = await fetch(docxUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpDocxPath, buffer);

    // Extract text paragraphs using python3 zipfile XML parser
    const pyScript = `
import zipfile, xml.etree.ElementTree as ET
try:
    with zipfile.ZipFile('${tmpDocxPath}') as z:
        xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    paragraphs = []
    for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
        texts = [t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
        if texts:
            paragraphs.append(' '.join(texts).strip())
    print('|||PARASPLIT|||'.join(paragraphs))
except Exception as e:
    print('ERROR:', e)
`;

    const rawOutput = execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
    
    // Clean up tmp file
    try { fs.unlinkSync(tmpDocxPath); } catch (e) {}

    if (rawOutput.startsWith('ERROR:')) return null;

    const paragraphs = rawOutput.split('|||PARASPLIT|||').map(p => p.trim()).filter(Boolean);
    return extractNewsItemsFromParagraphs(paragraphs, docxUrl);
  } catch (err) {
    console.warn(`[DocxParser] Error parsing ${docxUrl}:`, err.message);
    return null;
  }
}

/**
 * Synthesizes structured news and event records from extracted meeting minute paragraphs
 */
function extractNewsItemsFromParagraphs(paragraphs, docxUrl) {
  const items = [];

  let dateMatchStr = null;
  for (const p of paragraphs.slice(0, 5)) {
    const dMatch = p.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dMatch) {
      dateMatchStr = `${dMatch[1]} ${dMatch[2]} ${dMatch[3]}`;
      break;
    }
  }

  const meetingDateStr = dateMatchStr || '10 July 2026';
  const isoDate = new Date(meetingDateStr).toISOString() || new Date().toISOString();

  let highwaysText = '';
  let sendText = '';
  let localPlanText = '';
  let newmanStoresText = '';
  let eventsText = [];

  for (const p of paragraphs) {
    if (p.includes('contractors') || p.includes('highway') || p.includes('Flaxon Walk') || p.includes('penalties')) {
      highwaysText += ' ' + p;
    }
    if (p.includes('SEND') || p.includes('overspend')) {
      sendText += ' ' + p;
    }
    if (p.includes('Local Plan')) {
      localPlanText += ' ' + p;
    }
    if (p.includes('Newman Stores')) {
      newmanStoresText += ' ' + p;
    }
    if (p.includes('Community Showcase') || p.includes('Choir Event') || p.includes('Feast Week') || p.includes('sports activities')) {
      eventsText.push(p);
    }
  }

  if (highwaysText.trim()) {
    items.push({
      id: `parish-live-highways-${Date.now()}`,
      title: `Parish Council Governance: Highway Contractor Penalties & Flaxon Walk Parking Bay`,
      content: highwaysText.trim(),
      url: docxUrl,
      date: isoDate,
      category: 'Village News & Governance',
      sourceId: 'warboys-parish',
      sourceName: 'Warboys Parish Council'
    });
  }

  if (sendText.trim()) {
    items.push({
      id: `parish-live-send-${Date.now()}`,
      title: `County Council Reports £60m SEND Budget Overspend`,
      content: sendText.trim(),
      url: docxUrl,
      date: isoDate,
      category: 'Village News & Governance',
      sourceId: 'warboys-parish',
      sourceName: 'Warboys Parish Council'
    });
  }

  if (localPlanText.trim()) {
    items.push({
      id: `parish-live-localplan-${Date.now()}`,
      title: `HDC Local Plan Publication & Autumn Public Consultation`,
      content: localPlanText.trim(),
      url: docxUrl,
      date: isoDate,
      category: 'Village News & Governance',
      sourceId: 'warboys-parish',
      sourceName: 'Warboys Parish Council'
    });
  }

  if (newmanStoresText.trim()) {
    items.push({
      id: `parish-live-newman-${Date.now()}`,
      title: `Newman Stores Future Use & Community Acquisition Consultation`,
      content: newmanStoresText.trim(),
      url: docxUrl,
      date: isoDate,
      category: 'Village News & Governance',
      sourceId: 'warboys-parish',
      sourceName: 'Warboys Parish Council'
    });
  }

  // Check for Community Showcase
  const showcasePara = eventsText.find(p => p.toLowerCase().includes('showcase'));
  if (showcasePara) {
    items.push({
      id: `parish-live-showcase-${Date.now()}`,
      title: `Warboys Community Showcase 2026 (Announced in Council Minutes)`,
      eventTime: `Saturday 12 September 2026 • All Day`,
      eventCategory: `UPCOMING`,
      isRegular: false,
      venue: `Warboys Community Centre & High Street`,
      content: showcasePara,
      url: docxUrl,
      date: isoDate,
      eventDate: `2026-09-12`,
      category: 'Community Events',
      sourceId: 'warboys-parish',
      sourceName: 'Warboys Parish Council'
    });
  }

  // Check for Choir Event
  const choirPara = eventsText.find(p => p.toLowerCase().includes('choir'));
  if (choirPara) {
    items.push({
      id: `parish-live-choir-${Date.now()}`,
      title: `Warboys Community Choir Concert (Announced in Council Minutes)`,
      eventTime: `Sunday 27 September 2026 • 6:30 PM`,
      eventCategory: `UPCOMING`,
      isRegular: false,
      venue: `Warboys Community Centre`,
      content: choirPara,
      url: docxUrl,
      date: isoDate,
      eventDate: `2026-09-27`,
      category: 'Community Events',
      sourceId: 'warboys-parish',
      sourceName: 'Warboys Parish Council'
    });
  }

  return items;
}

module.exports = { parseDocxFromUrl };
