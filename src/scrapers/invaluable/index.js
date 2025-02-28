/**
 * Entry point for Invaluable scraper module
 * 
 * This file serves as the main entry point for the Invaluable scraper.
 * It exports the UnifiedScraper implementation which provides a consistent
 * interface for scraping Invaluable.com with proper parameter handling,
 * robust browser management, and standardized output.
 * 
 * The UnifiedScraper replaces the previous scraper implementation and should
 * be used for all new scraping operations.
 */

const UnifiedScraper = require('./unified-scraper');

// Export the UnifiedScraper as the default export for backward compatibility
// This allows existing code to continue working by importing from the root path
// Example: const InvaluableScraper = require('./scrapers/invaluable');
module.exports = UnifiedScraper;