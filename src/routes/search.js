const express = require('express');
const router = express.Router();
const SearchStorageService = require('../utils/search-storage');

// Initialize SearchStorageService
const searchStorage = new SearchStorageService();

function formatPrice(hit) {
  return {
    amount: hit.priceResult,
    currency: hit.currencyCode,
    symbol: hit.currencySymbol
  };
}

function formatSearchResults(catResults) {
  if (!catResults?.results?.[0]?.hits) {
    return { lots: [], totalResults: 0, pagination: { totalItems: 0, totalPages: 0 } };
  }

  const hits = catResults.results[0].hits;
  const lots = hits.map(hit => ({
    title: hit.lotTitle,
    date: hit.dateTimeLocal,
    auctionHouse: hit.houseName,
    price: formatPrice(hit),
    image: hit.photoPath,
    lotNumber: hit.lotNumber,
    saleType: hit.saleType
  }));

  // Extract pagination metadata
  let totalItems = 0;
  let totalPages = 0;
  let itemsPerPage = 96; // Default value used by Invaluable

  // Check for metadata in different possible locations
  if (catResults.results?.[0]?.meta?.totalHits) {
    // Standard metadata location
    totalItems = catResults.results[0].meta.totalHits;
    itemsPerPage = catResults.results[0].meta.hitsPerPage || itemsPerPage;
  } else if (catResults.nbHits) {
    // Algolia direct response format
    totalItems = catResults.nbHits;
    itemsPerPage = catResults.hitsPerPage || itemsPerPage;
  } else if (catResults.results?.[0]?.nbHits) {
    // Alternative Algolia format
    totalItems = catResults.results[0].nbHits;
    itemsPerPage = catResults.results[0].hitsPerPage || itemsPerPage;
  }

  // Calculate total pages
  totalPages = Math.ceil(totalItems / itemsPerPage);

  return {
    lots,
    totalResults: lots.length,
    pagination: {
      totalItems,
      totalPages,
      itemsPerPage,
      currentPage: catResults.results?.[0]?.meta?.page || 1
    }
  };
}

function standardizeResponse(data, parameters = {}) {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    parameters: {
      ...parameters,
      // Convert price parameters to nested object if they exist
      ...(parameters['priceResult[min]'] || parameters['priceResult[max]']) && {
        priceResult: {
          min: parameters['priceResult[min]'],
          max: parameters['priceResult[max]']
        }
      }
    },
    // Include pagination metadata in the response
    pagination: data.pagination || {
      totalItems: 0,
      totalPages: 0,
      itemsPerPage: 0,
      currentPage: 1
    },
    data: {
      lots: data.lots || [],
      totalResults: data.totalResults || 0
    }
  };
}

// Get timestamp for logging
function getTimestamp() {
  return new Date().toISOString();
}

// Format elapsed time in ms to human-readable format
function formatElapsedTime(startTime) {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
  return `${(elapsed/60000).toFixed(2)}min`;
}

// Search endpoint
router.get('/', async (req, res) => {
  try {
    const { invaluableScraper } = req.app.locals;
    if (!invaluableScraper) {
      throw new Error('Scraper not initialized');
    }

    // Start timing the request
    const requestStartTime = Date.now();
    console.log(`[${getTimestamp()}] 🔍 Search request received: ${JSON.stringify(req.query)}`);

    // Extract search parameters
    const searchParams = { ...req.query };
    const fetchAllPages = searchParams.fetchAllPages === 'true';
    const maxPages = parseInt(searchParams.maxPages) || 10;
    
    // Remove pagination parameters from search params to avoid confusion
    delete searchParams.fetchAllPages;
    delete searchParams.maxPages;
    
    // Extract cookies
    const cookiesParam = req.query.cookies || req.headers['x-invaluable-cookies'];
    let cookies = [];
    
    if (cookiesParam) {
      try {
        cookies = typeof cookiesParam === 'string' ? JSON.parse(cookiesParam) : cookiesParam;
      } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error parsing cookies:`, error);
      }
    }
    
    // Determine if we should save results to GCS
    const saveToGcs = searchParams.saveToGcs === 'true';
    const category = searchParams.supercategoryName || searchParams.keyword || searchParams.query || 'general';
    
    // If user provided a specific page parameter, handle that specially
    const requestedPage = searchParams.page ? parseInt(searchParams.page) : null;
    
    // Log search configuration
    console.log(`[${getTimestamp()}] 🚀 Starting search with configuration:`);
    console.log(`[${getTimestamp()}] - Query: ${searchParams.query || 'N/A'}`);
    console.log(`[${getTimestamp()}] - Category: ${category}`);
    console.log(`[${getTimestamp()}] - Fetch all pages: ${fetchAllPages}`);
    console.log(`[${getTimestamp()}] - Max pages: ${maxPages}`);
    console.log(`[${getTimestamp()}] - Save to GCS: ${saveToGcs}`);
    console.log(`[${getTimestamp()}] - Specific page: ${requestedPage || 'none'}`);
    
    let result = null;
    
    // Simple path: If this is a single page request or a specific page is requested
    if (!fetchAllPages || requestedPage) {
      console.log(`[${getTimestamp()}] 📄 Performing single page search ${requestedPage ? `for page ${requestedPage}` : ''}`);
      const singlePageStartTime = Date.now();
      
      // Execute the single page search
      result = await invaluableScraper.search(searchParams, cookies);
      
      console.log(`[${getTimestamp()}] ✅ Single page search completed in ${formatElapsedTime(singlePageStartTime)}`);
      
      // Save the result to GCS if enabled
      if (saveToGcs && result) {
        try {
          const pageNum = requestedPage || 1;
          console.log(`[${getTimestamp()}] 💾 Saving search results to GCS for category: ${category}, page: ${pageNum}`);
          const gcsPath = await searchStorage.savePageResults(category, pageNum, result);
          console.log(`[${getTimestamp()}] ✅ Saved search results to GCS at: ${gcsPath}`);
        } catch (error) {
          console.error(`[${getTimestamp()}] ❌ Error saving search results to GCS:`, error);
        }
      }
    } 
    // Multi-page path: If fetchAllPages is true and no specific page is requested
    else {
      console.log(`[${getTimestamp()}] 📚 Starting multi-page search with up to ${maxPages} pages`);
      const multiPageStartTime = Date.now();
      
      // Get references to the original pagination function
      const { handlePagination } = require('../scrapers/invaluable/pagination');
      const originalRequestModule = require('../scrapers/invaluable/pagination/request-interceptor');
      
      // Create enhanced pagination handler with storage capability
      const handlePaginationWithStorage = async (browser, params, firstPageResults, initialCookies, maxPages, config) => {
        // Store original function to restore later
        const originalSetupInterception = originalRequestModule.setupRequestInterception;
        
        // For tracking
        const paginationStartTime = Date.now();
        const pagesStartTimes = {};
        const pagesElapsedTimes = {};
        let totalSuccessPages = 0;
        let totalFailedPages = 0;
        
        console.log(`[${getTimestamp()}] 📚 Beginning pagination process for up to ${maxPages} pages`);
        
        try {
          // Override the setupRequestInterception function to add GCS saving capability
          originalRequestModule.setupRequestInterception = async (page, navState, pageNum, callback) => {
            console.log(`[${getTimestamp()}] 🔄 Setting up interceptor for page ${pageNum}`);
            pagesStartTimes[pageNum] = Date.now();
            
            // Define a new wrapper callback that saves to GCS
            const wrappedCallback = async (response, status) => {
              const pageElapsed = Date.now() - pagesStartTimes[pageNum];
              pagesElapsedTimes[pageNum] = pageElapsed;
              
              // First call the original callback if provided
              if (callback) {
                await callback(response, status);
              }
              
              // Then save the response to GCS if enabled and valid
              if (saveToGcs && response && status === 200 && response.results && response.results[0]?.hits) {
                try {
                  // Determine the actual page number from the response or use the supplied pageNum
                  const actualPage = (response.results[0]?.meta?.page) || pageNum;
                  console.log(`[${getTimestamp()}] 💾 Saving page ${actualPage} results to GCS for category: ${category}`);
                  const gcsPath = await searchStorage.savePageResults(category, actualPage, response);
                  console.log(`[${getTimestamp()}] ✅ Saved page ${actualPage} to GCS at: ${gcsPath} (in ${formatElapsedTime(pagesStartTimes[pageNum])})`);
                } catch (error) {
                  console.error(`[${getTimestamp()}] ❌ Error saving page ${pageNum} results to GCS: ${error.message}`);
                  totalFailedPages++;
                }
              } else if (saveToGcs && (!response || status !== 200)) {
                console.error(`[${getTimestamp()}] ❌ Not saving page ${pageNum} - Invalid response or status: ${status}`);
                totalFailedPages++;
              }
              
              // Log successful page fetch
              if (response && status === 200 && response.results && response.results[0]?.hits) {
                const hitCount = response.results[0]?.hits?.length || 0;
                totalSuccessPages++;
                console.log(`[${getTimestamp()}] ✅ Page ${pageNum} fetched successfully in ${formatElapsedTime(pagesStartTimes[pageNum])} with ${hitCount} items`);
              } else {
                console.error(`[${getTimestamp()}] ❌ Page ${pageNum} failed with status: ${status}`);
                totalFailedPages++;
              }
            };
            
            // Call the original function with our wrapped callback
            return await originalSetupInterception(page, navState, pageNum, wrappedCallback);
          };
          
          // Call the original handlePagination with our modified request interceptor
          console.log(`[${getTimestamp()}] 🔄 Starting pagination handler with ${maxPages} max pages`);
          const results = await handlePagination(browser, params, firstPageResults, initialCookies, maxPages, config);
          
          // Log pagination completion
          const paginationElapsed = Date.now() - paginationStartTime;
          console.log(`[${getTimestamp()}] 🏁 Pagination completed in ${formatElapsedTime(paginationStartTime)}`);
          console.log(`[${getTimestamp()}] 📊 Pages stats: ${totalSuccessPages} successful, ${totalFailedPages} failed`);
          
          // Calculate average page time
          const pageTimeValues = Object.values(pagesElapsedTimes);
          if (pageTimeValues.length > 0) {
            const avgPageTime = pageTimeValues.reduce((sum, time) => sum + time, 0) / pageTimeValues.length;
            console.log(`[${getTimestamp()}] ⏱️ Average page fetch time: ${formatElapsedTime(Date.now() - avgPageTime)}`);
          }
          
          return results;
        } finally {
          // Always restore the original function when done
          originalRequestModule.setupRequestInterception = originalSetupInterception;
        }
      };
      
      try {
        // Execute the multi-page search
        result = await invaluableScraper.searchAllPages(
          searchParams, 
          cookies, 
          maxPages, 
          handlePaginationWithStorage // Pass our enhanced handler
        );
        
        console.log(`[${getTimestamp()}] ✅ Multi-page search completed in ${formatElapsedTime(multiPageStartTime)}`);
      } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error during multi-page search:`, error);
        throw error;
      }
    }
    
    if (!result) {
      console.log(`[${getTimestamp()}] ⚠️ No search results found`);
      return res.status(404).json({
        success: false,
        error: 'No search results found',
        message: 'The search did not return any results. Try different parameters or check that the cookies are valid.'
      });
    }
    
    const formattedResults = formatSearchResults(result);
    
    // Log pagination information
    const totalItems = formattedResults.pagination?.totalItems || 0;
    const totalPages = formattedResults.pagination?.totalPages || 0;
    const totalReturned = formattedResults.totalResults || 0;
    
    console.log(`[${getTimestamp()}] 📊 Search results stats: ${totalReturned} items returned of ${totalItems} total items (${totalPages} total pages)`);
    
    // Calculate and log final timing
    const totalRequestTime = Date.now() - requestStartTime;
    console.log(`[${getTimestamp()}] 🏁 Request completed in ${formatElapsedTime(requestStartTime)} (${totalRequestTime}ms)`);
    
    // Return standard response
    res.json(standardizeResponse(formattedResults, req.query));
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Search error:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch search results',
      message: error.message
    });
  }
});

// Direct API route to process direct API data
router.post('/direct', async (req, res) => {
  try {
    if (!req.body || !req.body.apiData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required data',
        message: 'The request must include apiData'
      });
    }
    
    // Get the API data and any search parameters
    const { apiData, searchParams = {} } = req.body;
    
    // Process the API data
    const formattedResults = formatSearchResults(apiData);
    
    // Return standard response
    res.json(standardizeResponse(formattedResults, searchParams));
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Error processing direct API data:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process API data',
      message: error.message
    });
  }
});

// Combine pages route to merge multiple page results
router.post('/combine-pages', async (req, res) => {
  try {
    if (!req.body || !req.body.pages || !Array.isArray(req.body.pages)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required data',
        message: 'The request must include an array of pages'
      });
    }
    
    const { pages, searchParams = {} } = req.body;
    console.log(`[${getTimestamp()}] 🔄 Combining ${pages.length} pages`);
    
    // Ensure we have at least one page
    if (pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Empty pages array',
        message: 'The pages array must contain at least one page of results'
      });
    }
    
    // Use the first page as a template and add hits from other pages
    const combinedResult = JSON.parse(JSON.stringify(pages[0]));
    
    // Ensure we have a valid hits array
    if (!combinedResult.results || !combinedResult.results[0] || !Array.isArray(combinedResult.results[0].hits)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page format',
        message: 'The first page does not have a valid hits array'
      });
    }
    
    // Keep track of unique item IDs to avoid duplicates
    const processedIds = new Set();
    
    // Add all hits from the first page
    combinedResult.results[0].hits.forEach(hit => {
      const itemId = hit.lotId || hit.id || JSON.stringify(hit);
      processedIds.add(itemId);
    });
    
    // Add hits from additional pages
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i];
      
      if (page.results && page.results[0] && Array.isArray(page.results[0].hits)) {
        page.results[0].hits.forEach(hit => {
          const itemId = hit.lotId || hit.id || JSON.stringify(hit);
          
          // Only add if we haven't seen this ID before
          if (!processedIds.has(itemId)) {
            combinedResult.results[0].hits.push(hit);
            processedIds.add(itemId);
          }
        });
      }
    }
    
    // Update total hits metadata
    if (combinedResult.results[0].meta) {
      combinedResult.results[0].meta.totalHits = combinedResult.results[0].hits.length;
    }
    
    console.log(`[${getTimestamp()}] ✅ Combined ${pages.length} pages with ${combinedResult.results[0].hits.length} total unique hits`);
    
    // Format and return the combined results
    const formattedResults = formatSearchResults(combinedResult);
    res.json(standardizeResponse(formattedResults, searchParams));
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Error combining pages:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to combine pages',
      message: error.message
    });
  }
});

module.exports = router;
