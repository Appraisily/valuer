/**
 * Page request handling for pagination
 */
const { getTimestamp } = require('./utilities');
const { buildRequestHeaders } = require('./session-manager');
const { API_BASE_URL, CAT_RESULTS_ENDPOINT } = require('../constants');

/**
 * Builds payload for results request
 * @param {Object} params - Search parameters
 * @param {Number} pageNum - Page number
 * @param {Object} navState - Navigation state
 * @returns {Object} - Request payload
 */
const buildResultsPayload = (params, pageNum, navState = {}) => {
  // Build base payload
  const payload = {
    page: pageNum || 1,
    hitsPerPage: 96,
    query: params.query || '',
    supercategoryName: params.supercategoryName || '',
    categoryName: params.categoryName || '',
    subcategoryName: params.subcategoryName || '',
    sort: params.sort || 'sale_date|desc'
  };

  // Add additional navigation state parameters if available
  if (navState.refId) payload.refId = navState.refId;
  if (navState.searchContext) payload.searchContext = navState.searchContext;
  if (navState.searcher) payload.searcher = navState.searcher;

  return payload;
};

/**
 * Performs API request
 * @param {Object} page - Page instance
 * @param {String} url - URL for request
 * @param {Object} headers - Request headers
 * @param {Object} payload - Request payload
 * @returns {Promise<Object>} - API response
 */
const makeApiRequest = async (page, url, headers, payload) => {
  return page.evaluate(
    async (url, headers, payload) => {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        
        if (!resp.ok) {
          return { 
            error: resp.status, 
            message: resp.statusText,
            url: resp.url
          };
        }
        
        return await resp.json();
      } catch (error) {
        return { 
          error: true, 
          message: error.toString(),
          url: url
        };
      }
    },
    url,
    headers,
    payload
  );
};

/**
 * Requests results for a specific page
 * @param {Object} page - Page instance
 * @param {Number} pageNum - Page number
 * @param {Object} params - Search parameters
 * @param {Object} navState - Navigation state
 * @returns {Promise<Object>} - Page results
 */
const requestPageResults = async (page, pageNum, params, navState) => {
  try {
    console.log(`[${getTimestamp()}] 📄 Requesting results for page ${pageNum}...`);
    
    // Build payload for request
    const payload = buildResultsPayload(params, pageNum, navState);
    console.log(`[${getTimestamp()}] 🔍 Request payload for page ${pageNum}:`, JSON.stringify(payload));
    
    // Build headers
    const headers = buildRequestHeaders(navState.cookies);
    
    // Try first with absolute URL
    let url = `${API_BASE_URL}${CAT_RESULTS_ENDPOINT}`;
    console.log(`[${getTimestamp()}] 🔗 Making API request to: ${url}`);
    let response = await makeApiRequest(page, url, headers, payload);
    
    // If fails with absolute URL, try with relative URL
    if (response && response.error) {
      console.log(`[${getTimestamp()}] ⚠️ Absolute URL request failed, trying with relative URL...`);
      url = CAT_RESULTS_ENDPOINT;
      response = await makeApiRequest(page, url, headers, payload);
    }
    
    // Verify valid response (adapted for Invaluable's specific structure)
    if (response && response.results && response.results[0]?.hits) {
      const hitCount = response.results[0].hits.length;
      const meta = response.results[0].meta || {};
      console.log(`[${getTimestamp()}] ✅ Retrieved ${hitCount} results for page ${pageNum} (${meta.page || pageNum} of ${Math.ceil((meta.totalHits || 0) / (meta.hitsPerPage || 96))})`);
      return response;
    } else {
      console.error(`[${getTimestamp()}] ⚠️ Invalid response for page ${pageNum}:`, response);
      return null;
    }
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Error requesting results for page ${pageNum}: ${error.message}`);
    return null;
  }
};

module.exports = {
  requestPageResults,
  makeApiRequest,
  buildResultsPayload
}; 