/**
 * URL builder module for the Invaluable scraper
 */
const { API_BASE_URL, DEFAULT_SORT } = require('./constants');

/**
 * Constructs a search URL based on the provided parameters
 * @param {Object} params - Search parameters
 * @returns {string} Complete URL for search
 */
function constructSearchUrl(params = {}) {
  const baseUrl = `${API_BASE_URL}/search`;
  const searchParams = new URLSearchParams();

  // Handle nested price range parameters
  if (params.priceResult) {
    if (params.priceResult.min) {
      searchParams.append('priceResult[min]', params.priceResult.min);
    }
    if (params.priceResult.max) {
      searchParams.append('priceResult[max]', params.priceResult.max);
    }
  }

  // Add query parameters if present
  if (params.query) {
    searchParams.append('query', params.query);
  }

  // Add keyword parameter (should match query if both are used)
  if (params.keyword) {
    searchParams.append('keyword', params.keyword);
  }

  // Always set upcoming=false to focus on past auctions unless explicitly set
  const upcomingValue = params.upcoming !== undefined ? params.upcoming : false;
  searchParams.append('upcoming', upcomingValue.toString());

  // Add category parameters if present
  if (params.supercategoryName) {
    searchParams.append('supercategoryName', params.supercategoryName);
  }
  if (params.categoryName) {
    searchParams.append('categoryName', params.categoryName);
  }
  if (params.subcategoryName) {
    searchParams.append('subcategoryName', params.subcategoryName);
  }

  // Add sorting parameter (default to sale_date|desc if not provided)
  searchParams.append('sort', params.sort || DEFAULT_SORT);

  // Add pagination parameter if present
  if (params.page && params.page > 1) {
    searchParams.append('page', params.page);
  }

  // Build the complete URL
  let url = baseUrl;
  const queryString = searchParams.toString();
  
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

module.exports = {
  constructSearchUrl
}; 