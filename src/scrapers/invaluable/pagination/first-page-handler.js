/**
 * Implementation of handleFirstPage function that can be
 * imported by other modules that expect this interface
 * 
 * This is a compatibility layer for our new direct-api approach
 */
const { handleFirstPageDirect } = require('./direct-api');

/**
 * Handles getting the first page of search results
 * 
 * @param {Object} browser - Browser manager instance
 * @param {Object} params - Search parameters
 * @param {Array} cookies - Optional initial cookies
 * @returns {Promise<Object>} - First page results and cookies
 */
async function handleFirstPage(browser, params, cookies = []) {
  console.log('handleFirstPage: Using direct catResults API implementation');
  
  try {
    // Use our direct implementation
    const result = await handleFirstPageDirect(browser, params);
    
    // Return in the expected format
    return {
      results: result.results,
      initialCookies: result.initialCookies
    };
  } catch (error) {
    console.error('Error in handleFirstPage:', error);
    throw error;
  }
}

module.exports = {
  handleFirstPage
}; 