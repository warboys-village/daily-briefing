const path = require('path');
const fs = require('fs');
const { loadConfig } = require('./scripts/utils/config-loader');

module.exports = function(eleventyConfig) {
  const config = loadConfig();
  const currentPlace = (config.placeName || config.villageName || 'warboys').toLowerCase();

  // Exclude briefings for other places during this site build
  const briefingsDir = path.join(__dirname, 'src', 'briefings');
  if (fs.existsSync(briefingsDir)) {
    for (const d of fs.readdirSync(briefingsDir)) {
      if (d.toLowerCase() !== currentPlace && fs.statSync(path.join(briefingsDir, d)).isDirectory()) {
        eleventyConfig.ignores.add(`src/briefings/${d}/**`);
      }
    }
  }

  // Passthrough static CSS / assets & Cloudflare Pages _headers
  eleventyConfig.addPassthroughCopy({ "src/public": "public" });
  eleventyConfig.addPassthroughCopy({ "src/public/_headers": "_headers" });

  // Bind dev server to 0.0.0.0 for LAN and external access
  eleventyConfig.setServerOptions({
    host: "0.0.0.0",
    showAllHosts: true
  });

  // Briefings collection sorted by date descending for active place
  eleventyConfig.addCollection("briefings", function(collectionApi) {
    const { loadConfig } = require('./scripts/utils/config-loader');
    const config = loadConfig();
    const place = (config.placeName || config.villageName || 'warboys').toLowerCase();
    const targetDir = config.outputDir || `src/briefings/${place}`;
    let items = collectionApi.getFilteredByGlob(`${targetDir}/*.md`);
    if (items.length === 0) {
      items = collectionApi.getFilteredByGlob(`src/briefings/*.md`);
    }
    return items.sort((a, b) => {
      return new Date(b.data.date) - new Date(a.data.date);
    });
  });

  // Date filters
  eleventyConfig.addFilter("formatDate", function(dateObj) {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  });

  eleventyConfig.addFilter("isoDate", function(dateObj) {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    return d.toISOString().split("T")[0];
  });

  // RFC 5545 iCalendar Filters
  eleventyConfig.addFilter("icsNextDay", function(dateStr) {
    if (!dateStr) return "20260902";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "20260902";
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  });

  eleventyConfig.addFilter("escapeIcs", function(str) {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes"
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
