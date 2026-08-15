const path = require('path');

module.exports = function(eleventyConfig) {
  // Passthrough static CSS / assets
  eleventyConfig.addPassthroughCopy({ "src/public": "public" });

  // Bind dev server to 0.0.0.0 for LAN access
  eleventyConfig.setServerOptions({
    host: "0.0.0.0"
  });

  // Briefings collection sorted by date descending
  eleventyConfig.addCollection("briefings", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/briefings/*.md").sort((a, b) => {
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
