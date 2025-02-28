# Codebase Cleanup Plan

This document outlines the plan for cleaning up the Invaluable scraper codebase to standardize on the UnifiedScraper implementation and remove redundant code.

## Files Already Deleted ✅

- `src/scrapers/invaluable/scraper.js` - Replaced by UnifiedScraper
- `src/scrapers/invaluable/search-handler.js` - Functionality moved to UnifiedScraper
- `src/scrapers/invaluable/pagination-handler.js` (root level) - Different from the one in the pagination folder, redundant

## Files to Keep (Currently Active)

These files should be kept as they are core to the new implementation:

- `src/scrapers/invaluable/unified-scraper.js` - The new centralized scraper
- `src/scrapers/invaluable/browser.js` - Core browser management
- `src/scrapers/invaluable/url-builder.js` - URL construction, used by UnifiedScraper
- `src/scrapers/invaluable/constants.js` - Important constants
- `src/scrapers/invaluable/utils.js` - Utility functions
- `src/scrapers/invaluable/index.js` - Main entry point (already updated)

## Example Files (Already Updated) ✅

These example files are already using the UnifiedScraper:

- `src/examples/unified-scraper-example.js` - Basic example using UnifiedScraper
- `src/examples/invaluable-category-scraper.js` - Category scraping with UnifiedScraper
- `src/examples/test-gcs-scraper.js` - GCS integration example with UnifiedScraper

## Pagination Directory Cleanup (Pending)

The pagination directory needs a thorough review. Some files might have overlapping functionality:

1. Keep:
   - `pagination/pagination-manager.js` - Core pagination functionality
   - `pagination/index.js` - Exports the pagination API
   - `pagination/first-page.js` - Handles first page scraping

2. Consider Refactoring:
   - `pagination/navigation-params.js` - May need to be integrated into UnifiedScraper
   - `pagination/page-manager.js` - Integration needed
   - `pagination/request-interceptor.js` - Important for intercepting API responses
   - `pagination/session-manager.js` - May have duplicated functionality

3. Potentially Remove:
   - `pagination/cookie-manager.js` - Functionality may be in session-manager
   - `pagination/results-processor.js` - May be redundant with UnifiedScraper
   - Other files with duplicated functionality should be evaluated

## Additional Recommendations

1. **API Route Refactoring**:
   - Review all routes in `src/routes/` to ensure they're using UnifiedScraper
   - Consider creating a more RESTful API structure for scraper operations

2. **Documentation Enhancement**:
   - Add JSDoc comments to all UnifiedScraper methods
   - Create a comprehensive README.md for the scraper module
   - Add examples for common use cases

3. **Testing Framework**:
   - Create unit tests for the UnifiedScraper
   - Add integration tests for the complete scraping workflow
   - Set up CI/CD pipeline for running tests

4. **Error Handling Improvements**:
   - Implement more robust error handling in the UnifiedScraper
   - Add retry mechanisms for common failure scenarios
   - Add logging for better traceability

5. **Performance Optimization**:
   - Profile the scraper for performance bottlenecks
   - Optimize browser resource usage
   - Consider adding caching for frequently accessed data

## Next Steps

1. Review each file in the pagination directory thoroughly before modifying
2. Update the main README.md to document the new structure and how to use UnifiedScraper
3. Create comprehensive API documentation
4. Set up a proper testing framework
5. Optimize for performance in cloud environments 