/**
 * Module to handle the first page of search results
 */
const { buildSearchParams } = require('../../../utils');

// Utility functions for logging
const getTimestamp = () => new Date().toISOString();
const formatElapsedTime = (startTime) => {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
  return `${(elapsed/60000).toFixed(2)}min`;
};

/**
 * Handles the first page of search results
 * @param {Object} browser - Puppeteer browser instance
 * @param {Object} params - Search parameters
 * @param {Array} cookies - Browser cookies
 * @returns {Promise<Object>} Search results for the first page
 */
const handleFirstPage = async (browser, params, cookies = []) => {
  const startTime = Date.now();
  console.log(`[${getTimestamp()}] 🔍 handleFirstPage: Processing first page of results`);
  
  try {
    // Create a new page
    const page = await browser.newPage();
    
    // Set cookies if provided
    if (cookies && cookies.length > 0) {
      console.log(`[${getTimestamp()}] 🍪 Setting ${cookies.length} cookies`);
      await page.setCookie(...cookies);
    }
    
    // Build the search URL
    const searchParams = buildSearchParams(params);
    const searchUrl = `https://www.invaluable.com/search/items?${searchParams}`;
    
    console.log(`[${getTimestamp()}] 🌐 Navigating to: ${searchUrl}`);
    
    // Set up a listener for the JSON response
    let searchResults = null;
    page.on('response', async (response) => {
      const url = response.url();
      
      // Only process JSON responses from the catalog results endpoint
      if (url.includes('/cat-results') && response.headers()['content-type']?.includes('application/json')) {
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
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait a bit to ensure all responses are processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Close the page
    await page.close();
    
    if (!searchResults) {
      console.error(`[${getTimestamp()}] ❌ No search results obtained from first page`);
      throw new Error('No search results obtained from first page');
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[${getTimestamp()}] ✅ First page processed successfully in ${formatElapsedTime(startTime)} (${elapsed}ms)`);
    
    return searchResults;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[${getTimestamp()}] ❌ Error in handleFirstPage after ${formatElapsedTime(startTime)}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  handleFirstPage
}; 