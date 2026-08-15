/**
 * Pre-filters raw items to optimize context window and eliminate token waste
 */
function preFilterItems(rawItems, config = {}) {
  const { maxDays = 30, maxItemSnippetLength = 800, maxTotalItems = 24 } = config;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxDays);

  const seenTitles = new Set();
  const filtered = [];

  // Separate governance, planning, events (high priority) from generic news
  const highPriority = [];
  const genericNews = [];

  for (const item of rawItems) {
    if (!item || !item.title || !item.url) continue;

    const catStr = (item.category || '').toLowerCase();
    const srcStr = (item.sourceName || '').toLowerCase();
    const srcIdStr = (item.sourceId || '').toLowerCase();

    const isHighPriority = catStr.includes('governance') || catStr.includes('event') || catStr.includes('plan') || srcStr.includes('parish council') || srcIdStr === 'warboys-parish';
    
    if (isHighPriority) {
      highPriority.push(item);
    } else {
      genericNews.push(item);
    }
  }

  // Sort each group by date descending
  highPriority.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  genericNews.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Combine with high-priority items first so local governance, planning, and events are never truncated
  const combinedRaw = [...highPriority, ...genericNews];

  for (const item of combinedRaw) {
    // Clean title by removing source prefixes/suffixes
    let cleanTitle = item.title.trim()
      .replace(/^FOWL Blog:\s*/i, '')
      .replace(/^Warboys Parish Council:\s*/i, '')
      .replace(/^Village Scene Magazine:\s*/i, '')
      .replace(/\s*-\s*The Hunts Post$/i, '')
      .replace(/\s*-\s*The Hunts Post News$/i, '')
      .trim();

    // Check date cutoff (allow up to 60 days for governance items so latest monthly meeting minutes are preserved)
    if (item.date) {
      const d = new Date(item.date);
      const isGov = (item.sourceId === 'warboys-parish') || (item.category || '').toLowerCase().includes('governance');
      const itemMaxDays = isGov ? 60 : maxDays;
      const itemCutoff = new Date();
      itemCutoff.setDate(itemCutoff.getDate() - itemMaxDays);
      if (!isNaN(d.getTime()) && d < itemCutoff) continue;
    }

    // Deduplicate by normalized title + date key
    const normalizedTitle = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dateKey = (item.eventDate || item.date || '').slice(0, 10);
    const dedupeKey = `${normalizedTitle}_${dateKey}`;
    if (seenTitles.has(dedupeKey)) continue;

    seenTitles.add(dedupeKey);

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
