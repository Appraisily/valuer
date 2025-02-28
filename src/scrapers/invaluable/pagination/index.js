/**
 * Pagination Module Index (Compatibility Layer)
 * 
 * This file exists primarily to provide backward compatibility during the transition
 * to the UnifiedScraper. It exports key pagination functionality from the pagination
 * module which is used by the UnifiedScraper.
 */

// Export necessary components for backward compatibility
const { handleFirstPage } = require('./first-page');
const PaginationManager = require('./pagination-manager');
const RequestInterceptor = require('./request-interceptor');
const PageManager = require('./page-manager');
const SessionManager = require('./session-manager');
const { handlePagination } = require('./pagination-handler');
const { requestPageResults } = require('./page-manager');

// Expose the pagination module components
module.exports = {
  handleFirstPage,
  PaginationManager,
  RequestInterceptor,
  PageManager,
  SessionManager,
  handlePagination,
  requestPageResults
}; 