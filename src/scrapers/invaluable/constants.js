/**
 * Constants for Invaluable scraper
 */

// API URLs
const API_BASE_URL = 'https://www.invaluable.com';
const CAT_RESULTS_ENDPOINT = '/api/search';
const SESSION_INFO_ENDPOINT = '/api/session-info';

// Pagination constants
const DEFAULT_HITS_PER_PAGE = 96;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_WAIT_BETWEEN_PAGES = 1000; // 1 second

// Default search params
const DEFAULT_SORT = 'sale_date|desc';

// Request constants
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

module.exports = {
  // API URLs
  API_BASE_URL,
  CAT_RESULTS_ENDPOINT,
  SESSION_INFO_ENDPOINT,
  
  // Pagination constants
  DEFAULT_HITS_PER_PAGE,
  DEFAULT_MAX_PAGES,
  DEFAULT_TIMEOUT,
  DEFAULT_WAIT_BETWEEN_PAGES,
  
  // Default search params
  DEFAULT_SORT,
  
  // Request constants
  USER_AGENT
}; 