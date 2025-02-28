/**
 * Entry point for Invaluable scraper module
 * This file re-exports the UnifiedScraper implementation
 */

const UnifiedScraper = require('./unified-scraper');

// Export the UnifiedScraper as the default export for backward compatibility
module.exports = UnifiedScraper;