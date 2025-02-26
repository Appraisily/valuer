/**
 * Direct catResults API Implementation
 * This module handles direct API requests to the catResults endpoint
 * for both first page and pagination requests, with GCS saving capability
 */
const { buildRequestHeaders, buildResultsPayload } = require('./request-interceptor');
const { extractNavigationParams } = require('./navigation-params');
const StorageManager = require('../../../utils/storage-manager');

// Constants for API URLs
const API_BASE_URL = 'https://www.invaluable.com';
const CAT_RESULTS_ENDPOINT = '/catResults';

/**
 * Handles the first page request directly using catResults API
 * This is a more efficient approach than depending on page navigation
 * 
 * @param {Object} browser - Browser manager instance
 * @param {Object} params - Search parameters
 * @returns {Promise<Object>} First page results and cookies
 */
async function handleFirstPageDirect(browser, params) {
  console.log('Getting first page results using direct catResults API request...');
  
  // Create a new tab for the API request
  const page = await browser.createTab('api-request');
  
  try {
    // First navigate to invaluable.com to establish cookies and session
    console.log('Setting up session context...');
    await page.goto('https://www.invaluable.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Get cookies after initial navigation
    const initialCookies = await page.cookies();
    console.log(`Got ${initialCookies.length} initial cookies`);
    
    // Build request payload for first page (page 0 in Algolia format)
    const payload = buildResultsPayload(params, 1, { cookies: initialCookies });
    console.log('Built payload for catResults request');
    
    // Build request headers with cookies
    const headers = buildRequestHeaders(initialCookies);
    
    // Make direct API request to catResults
    console.log('Making direct API request to catResults...');
    const firstPageResults = await page.evaluate(
      async (url, headers, payload) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            credentials: 'include'
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
          }
          
          return await response.json();
        } catch (error) {
          console.error('Error in API request:', error);
          return { error: error.message };
        }
      },
      `${API_BASE_URL}${CAT_RESULTS_ENDPOINT}`,
      headers,
      payload
    );
    
    // Check if request was successful
    if (!firstPageResults || firstPageResults.error || !firstPageResults.results) {
      console.error('Failed to get first page results:', firstPageResults?.error || 'Unknown error');
      throw new Error('Failed to get first page results');
    }
    
    // Get updated cookies after the request
    const updatedCookies = await page.cookies();
    console.log(`Got ${updatedCookies.length} cookies after request`);
    
    // Add cookies to the results for use in pagination
    firstPageResults.cookies = updatedCookies;
    
    // Extract navigation parameters (refId, searchContext, etc.)
    const navParams = extractNavigationParams(firstPageResults);
    console.log('Extracted navigation parameters:', 
      navParams.refId ? 'refId: ✓' : 'refId: ✗',
      navParams.searchContext ? 'searchContext: ✓' : 'searchContext: ✗'
    );
    
    // Log success with stats
    const hitsCount = firstPageResults.results?.[0]?.hits?.length || 0;
    const totalHits = firstPageResults.results?.[0]?.meta?.totalHits || 0;
    console.log(`Successfully retrieved first page with ${hitsCount} items (total: ${totalHits})`);
    
    return {
      results: firstPageResults,
      initialCookies: updatedCookies,
      navigationParams: navParams
    };
    
  } catch (error) {
    console.error('Error in handleFirstPageDirect:', error);
    throw error;
  } finally {
    // Clean up: close the tab
    await browser.closeTab('api-request');
  }
}

/**
 * Retrieves a specific page of results using the catResults API directly
 * @param {Object} browser - Browser manager instance
 * @param {number} pageNum - Page number (1-indexed)
 * @param {Object} params - Search parameters
 * @param {Object} navState - Navigation state with cookies and context
 * @returns {Promise<Object>} Page results
 */
async function getPageDirect(browser, pageNum, params, navState) {
  console.log(`Getting page ${pageNum} using direct catResults API...`);
  
  // Create a tab if not provided
  const tabId = `api-page-${pageNum}`;
  const page = await browser.createTab(tabId);
  
  try {
    // Set cookies for authenticated request
    if (navState.cookies && navState.cookies.length > 0) {
      await page.setCookie(...navState.cookies);
    }
    
    // Build request payload with the page number
    const payload = buildResultsPayload(params, pageNum, navState);
    
    // Build request headers with cookies
    const headers = buildRequestHeaders(navState.cookies);
    
    // Make direct API request to catResults
    console.log(`Making catResults API request for page ${pageNum}...`);
    const pageResults = await page.evaluate(
      async (url, headers, payload) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            credentials: 'include'
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
          }
          
          return await response.json();
        } catch (error) {
          console.error('Error in API request:', error);
          return { error: error.message };
        }
      },
      `${API_BASE_URL}${CAT_RESULTS_ENDPOINT}`,
      headers,
      payload
    );
    
    // Update cookies
    const updatedCookies = await page.cookies();
    navState.cookies = updatedCookies;
    
    // Log results
    const hitsCount = pageResults.results?.[0]?.hits?.length || 0;
    if (hitsCount > 0) {
      console.log(`✅ Successfully retrieved page ${pageNum} with ${hitsCount} items`);
    } else {
      console.log(`⚠️ Page ${pageNum} returned ${hitsCount} items`);
    }
    
    // Add cookies to results for later use
    pageResults.cookies = updatedCookies;
    
    return pageResults;
    
  } catch (error) {
    console.error(`Error getting page ${pageNum}:`, error);
    throw error;
  } finally {
    // Clean up: close the tab
    await browser.closeTab(tabId);
  }
}

/**
 * Saves scraped data to GCS
 * @param {string} bucket - GCS bucket name
 * @param {string} category - Category name
 * @param {Object} data - Data to save
 * @param {number} batchNum - Batch number
 * @param {Array} pageRange - Range of pages in this batch [start, end]
 */
async function saveToGcs(bucket, category, data, batchNum, pageRange) {
  const storage = new StorageManager({ bucketName: bucket });
  
  try {
    // File path format: raw/[category]/page_001-100.json
    const pageStart = (pageRange[0]).toString().padStart(3, '0');
    const pageEnd = (pageRange[1]).toString().padStart(3, '0');
    const filePath = `raw/${category}/page_${pageStart}-${pageEnd}.json`;
    
    console.log(`Saving batch ${batchNum} (pages ${pageStart}-${pageEnd}) to GCS...`);
    await storage.saveJson(filePath, data);
    console.log(`✅ Successfully saved batch to gs://${bucket}/${filePath}`);
    
    return true;
  } catch (error) {
    console.error(`Error saving to GCS:`, error);
    return false;
  }
}

/**
 * Saves metadata about the scraping job to GCS
 * @param {string} bucket - GCS bucket name
 * @param {string} category - Category name
 * @param {Object} stats - Scraping statistics
 */
async function saveMetadataToGcs(bucket, category, stats) {
  const storage = new StorageManager({ bucketName: bucket });
  
  try {
    // File path for metadata
    const filePath = `raw/${category}/metadata.json`;
    
    // Build metadata object
    const metadata = {
      category,
      stats,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`Saving metadata to GCS...`);
    await storage.saveJson(filePath, metadata);
    console.log(`✅ Successfully saved metadata to gs://${bucket}/${filePath}`);
    
    return true;
  } catch (error) {
    console.error(`Error saving metadata to GCS:`, error);
    return false;
  }
}

module.exports = {
  handleFirstPageDirect,
  getPageDirect,
  saveToGcs,
  saveMetadataToGcs
}; 