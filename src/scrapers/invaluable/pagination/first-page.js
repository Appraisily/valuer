/**
 * Module to handle the first page of search results
 */
const { constructSearchUrl } = require('../url-builder');
const { getTimestamp, formatElapsedTime, wait } = require('./utilities');
const { DEFAULT_TIMEOUT } = require('../constants');

/**
 * Handles the first page of search results
 * @param {Object} browser - Browser manager instance
 * @param {Object} params - Search parameters
 * @param {Array} cookies - Browser cookies
 * @returns {Promise<Object>} Object containing search results and cookies
 */
const handleFirstPage = async (browser, params, cookies = []) => {
  const startTime = Date.now();
  console.log(`[${getTimestamp()}] 🔍 handleFirstPage: Processing first page of results`);
  
  try {
    // Create a new page - check if browser is a BrowserManager or a plain puppeteer Browser
    const page = browser.createTab ? 
      await browser.createTab('firstPage') : 
      await browser.newPage();
    
    // Set cookies if provided
    if (cookies && cookies.length > 0) {
      console.log(`[${getTimestamp()}] 🍪 Setting ${cookies.length} cookies`);
      await page.setCookie(...cookies);
    }
    
    // Build the search URL
    const searchUrl = constructSearchUrl(params);
    
    console.log(`[${getTimestamp()}] 🌐 Navigating to: ${searchUrl}`);
    
    // Set up a listener for the JSON response
    let searchResults = null;
    page.on('response', async (response) => {
      const url = response.url();
      
      // Only process JSON responses from the catalog results endpoint
      if ((url.includes('/api/search') || url.includes('/cat-results')) && 
          response.headers()['content-type']?.includes('application/json')) {
        try {
          const json = await response.json();
          searchResults = json;
          console.log(`[${getTimestamp()}] ✅ Received search results JSON`);
          
          // Extract basic stats
          const hits = json?.results?.[0]?.hits || [];
          const totalHits = json?.results?.[0]?.meta?.totalHits || 0;
          const hitsPerPage = json?.results?.[0]?.meta?.hitsPerPage || 0;
          
          console.log(`[${getTimestamp()}] 📊 First page stats: ${hits.length} items displayed, ${totalHits} total hits, ${Math.ceil(totalHits / hitsPerPage)} total pages`);
        } catch (error) {
          console.error(`[${getTimestamp()}] ❌ Error parsing JSON response: ${error.message}`);
        }
      }
    });
    
    // Navigate to the search URL
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: DEFAULT_TIMEOUT });
    
    // Wait a bit to ensure all responses are processed
    await wait(page, 1000);
    
    // Get all cookies from the page
    const pageCookies = await page.cookies();
    
    // Close the page - use the appropriate method depending on browser type
    if (browser.closeTab) {
      await browser.closeTab('firstPage');
    } else {
      await page.close();
    }
    
    if (!searchResults) {
      console.error(`[${getTimestamp()}] ❌ No search results obtained from first page`);
      throw new Error('No search results obtained from first page');
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[${getTimestamp()}] ✅ First page processed successfully in ${formatElapsedTime(startTime)} (${elapsed}ms)`);
    
    // Return both results and cookies in the expected format
    return {
      results: searchResults,
      initialCookies: pageCookies
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[${getTimestamp()}] ❌ Error in handleFirstPage after ${formatElapsedTime(startTime)}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  handleFirstPage
}; 