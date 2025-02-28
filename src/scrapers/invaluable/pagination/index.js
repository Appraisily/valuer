/**
 * Pagination module for Invaluable scraper
 * This file serves as the entry point for the pagination functionality,
 * importing and re-exporting components from specialized modules.
 */

// Import from utility modules
const { wait, getTimestamp, formatElapsedTime } = require('./utilities');
const { requestSessionInfo } = require('./session-manager');
const { requestPageResults } = require('./page-manager');
const { handlePagination } = require('./pagination-handler');

// Import constants
const {
  API_BASE_URL,
  SESSION_INFO_ENDPOINT,
  CAT_RESULTS_ENDPOINT
} = require('../constants');

/**
 * Main pagination handler - provides interface for pagination functionality
 */
module.exports = {
  // Core pagination function
  handlePagination,
  
  // Utility functions
  wait,
  getTimestamp,
  formatElapsedTime,
  
  // Session management
  requestSessionInfo,
  
  // Page request handling
  requestPageResults,
  
  // Constants
  API_BASE_URL,
  SESSION_INFO_ENDPOINT,
  CAT_RESULTS_ENDPOINT
}; 