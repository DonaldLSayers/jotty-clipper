// Extractor registry - loads all site-specific extractors
// This file is loaded by content.js to make extractors available

(function() {
  'use strict';

  // Initialize the global extractors object if it doesn't exist
  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  // This function builds the extractors object with domain-to-extractor mappings
  // It's called after all extractor files have been loaded
  window.JottyExtractors.loadExtractors = function() {
    const extractors = {};

    // Get all registered extractors
    const extractorModules = [
      window.JottyExtractors.youtube,
      window.JottyExtractors.amazon,
      window.JottyExtractors.reddit,
      window.JottyExtractors.wikipedia,
      window.JottyExtractors.stackoverflow,
      window.JottyExtractors.medium
    ];

    // Build domain mappings
    extractorModules.forEach(extractor => {
      if (extractor && extractor.domains && Array.isArray(extractor.domains)) {
        // Map each domain to this extractor
        extractor.domains.forEach(domain => {
          extractors[domain] = {
            name: extractor.name,
            extract: extractor.extract
          };
        });
      }
    });

    return extractors;
  };

  // Helper function to find extractor for a given hostname
  window.JottyExtractors.findExtractor = function(hostname, extractors) {
    // Check for exact domain matches first, then partial matches
    for (const domain in extractors) {
      if (hostname === domain || hostname.includes(domain)) {
        return extractors[domain];
      }
    }
    return null;
  };
})();
