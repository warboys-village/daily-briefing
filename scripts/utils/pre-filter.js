/**
 * Pre-filters raw items to optimize context window and eliminate token waste
 */
function preFilterItems(rawItems, config = {}) {
  const { maxDays = 30, maxItemSnippetLength = 800, maxTotalItems = 16 } = config;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxDays);

  const seenUrls = new Set();
  const seenTitles = new Set();
  const filtered = [];

  // Sort raw items by date descending (latest first)
  const sortedRaw = [...rawItems].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  for (const item of sortedRaw) {
    if (!item || !item.title || !item.url) continue;

    // Clean title by removing source prefixes/suffixes (e.g. 'FOWL Blog:', '- The Hunts Post')
    let cleanTitle = item.title.trim()
      .replace(/^FOWL Blog:\s*/i, '')
      .replace(/^Warboys Parish Council:\s*/i, '')
      .replace(/^Village Scene Magazine:\s*/i, '')
      .replace(/\s*-\s*The Hunts Post$/i, '')
      .replace(/\s*-\s*The Hunts Post News$/i, '')
      .trim();

    // Check date cutoff
    if (item.date) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime()) && d < cutoffDate) continue;
    }

    // Deduplicate
    const normalizedUrl = item.url.split('#')[0].toLowerCase();
    const normalizedTitle = cleanTitle.toLowerCase();
    if (seenUrls.has(normalizedUrl) || seenTitles.has(normalizedTitle)) continue;

    seenUrls.add(normalizedUrl);
    seenTitles.add(normalizedTitle);

    // Clean text snippet
    let cleanedContent = (item.content || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedContent.length > maxItemSnippetLength) {
      cleanedContent = cleanedContent.slice(0, maxItemSnippetLength) + '...';
    }

    filtered.push({
      ...item,
      title: cleanTitle,
      content: cleanedContent
    });

    if (filtered.length >= maxTotalItems) break;
  }

  return filtered;
}

module.exports = { preFilterItems };
