const pdf = require('pdf-parse');
const { getCachedDocument, setCachedDocument } = require('./processed-doc-cache');

/**
 * Parses raw text and paragraphs from a PDF Buffer using pdf-parse.
 */
async function parsePdfFromBuffer(buffer, options = {}) {
  if (!buffer || buffer.length === 0) return null;

  try {
    const data = await pdf(buffer);
    const rawText = data.text || '';

    // Split text into meaningful paragraphs while stripping page footer noise
    const lines = rawText.split(/\r?\n/).map(l => l.trim());
    const paragraphs = [];
    let currentPara = [];

    for (const line of lines) {
      if (!line) {
        if (currentPara.length > 0) {
          paragraphs.push(currentPara.join(' '));
          currentPara = [];
        }
      } else {
        // Skip common header/footer line noise like "Page X of Y"
        if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) continue;
        currentPara.push(line);
      }
    }
    if (currentPara.length > 0) {
      paragraphs.push(currentPara.join(' '));
    }

    return {
      numPages: data.numpages || 1,
      text: rawText,
      paragraphs,
      info: data.info || {},
      metadata: data.metadata || {}
    };
  } catch (err) {
    console.warn('[PdfParser] Error parsing PDF buffer:', err.message);
    return null;
  }
}

/**
 * Downloads a PDF from a URL and extracts clean structured text and paragraphs.
 * Utilizes persistent document caching to avoid repeated binary downloads.
 */
async function parsePdfFromUrl(pdfUrl, options = {}) {
  if (!pdfUrl) return null;

  const cached = getCachedDocument(pdfUrl, options);
  if (cached && cached.text) {
    return cached;
  }

  try {
    const res = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0',
        'Accept': 'application/pdf,*/*'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      console.warn(`[PdfParser] HTTP ${res.status} fetching ${pdfUrl}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = await parsePdfFromBuffer(buffer, options);

    if (parsed) {
      const result = {
        url: pdfUrl,
        ...parsed
      };
      setCachedDocument(pdfUrl, result, options);
      return result;
    }
  } catch (err) {
    console.warn(`[PdfParser] Failed to parse PDF from ${pdfUrl}:`, err.message);
  }

  return null;
}

module.exports = {
  parsePdfFromBuffer,
  parsePdfFromUrl
};
