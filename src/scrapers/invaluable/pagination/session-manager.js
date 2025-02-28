/**
 * Session management for pagination
 */
const { getTimestamp } = require('./utilities');
const { API_BASE_URL, SESSION_INFO_ENDPOINT } = require('../constants');

/**
 * Builds request headers with cookies
 * @param {Object|Array} cookies - Cookies to include in headers
 * @returns {Object} - Headers for API requests
 */
const buildRequestHeaders = (cookies) => {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
  };
  
  // Add cookies if provided
  if (cookies) {
    if (Array.isArray(cookies)) {
      // Convert array of cookie objects to cookie string
      const cookieString = cookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
      
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }
    } else if (typeof cookies === 'string') {
      // Use cookie string directly
      headers['Cookie'] = cookies;
    }
  }
  
  return headers;
};

/**
 * Requests session information to keep cookies fresh
 * @param {Object} page - Page instance
 * @param {Object} navState - Navigation state
 * @returns {Promise<Object>} - Session info response
 */
const requestSessionInfo = async (page, navState) => {
  try {
    console.log(`[${getTimestamp()}] 🔄 Requesting session information...`);
    
    const url = `${API_BASE_URL}${SESSION_INFO_ENDPOINT}`;
    const headers = buildRequestHeaders(navState.cookies);
    
    const response = await page.evaluate(
      async (url, headers) => {
        try {
          const resp = await fetch(url, {
            method: 'GET',
            headers,
            credentials: 'include'
          });
          
          if (!resp.ok) return { error: resp.status, message: resp.statusText };
          
          return await resp.json();
        } catch (error) {
          return { error: true, message: error.toString() };
        }
      },
      url,
      headers
    );
    
    if (response && !response.error) {
      console.log(`[${getTimestamp()}] ✅ Session information obtained successfully`);
    } else {
      console.error(`[${getTimestamp()}] ⚠️ Failed to get session information: ${response?.message || 'Unknown error'}`);
    }
    
    return response;
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Error requesting session information: ${error.message}`);
    return null;
  }
};

/**
 * Updates navigation state with cookies from a response
 * @param {Object} page - Page instance
 * @param {Object} navState - Navigation state to update
 * @returns {Promise<boolean>} - Success status
 */
const updateSessionCookies = async (page, navState) => {
  try {
    console.log(`[${getTimestamp()}] 🍪 Updating session cookies...`);
    
    // Get all cookies from current page
    const cookies = await page.cookies();
    
    if (cookies && cookies.length > 0) {
      // Update navigation state with new cookies
      navState.cookies = cookies;
      console.log(`[${getTimestamp()}] ✅ Updated session with ${cookies.length} cookies`);
      return true;
    } else {
      console.log(`[${getTimestamp()}] ⚠️ No cookies found to update session`);
      return false;
    }
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Error updating session cookies: ${error.message}`);
    return false;
  }
};

module.exports = {
  requestSessionInfo,
  updateSessionCookies,
  buildRequestHeaders
}; 