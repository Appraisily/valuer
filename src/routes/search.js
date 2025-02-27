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

// Search endpoint
router.get('/', async (req, res) => {
  try {
    const { invaluableScraper } = req.app.locals;
    if (!invaluableScraper) {
      throw new Error('Scraper not initialized');
    }

    // Check for direct API data in request
    if (req.query.directApiData) {
      try {
        console.log('Using direct API data provided in request');
        const apiData = JSON.parse(req.query.directApiData);
        const formattedResults = formatSearchResults(apiData);
        return res.json(standardizeResponse(formattedResults, req.query));
      } catch (error) {
        console.error('Error parsing direct API data:', error);
        // Continue with normal scraping if direct data parsing fails
      }
    }

    // Use cookies from request if provided
    const cookies = req.query.cookies ? 
      JSON.parse(req.query.cookies) : 
      [
        {
          name: 'AZTOKEN-PROD',
          value: req.query.aztoken || '4F562873-F229-4346-A846-37E9A451FA9E',
          domain: '.invaluable.com'
        },
        {
          name: 'cf_clearance',
          value: req.query.cf_clearance || 'Yq4QHU.y14z93vU3CmLCK80CU7Pq6pgupmW0eM8k548-1738320515-1.2.1.1-ZFXBFgIPHghfvwwfhRbZx27.6zPihqfQ4vGP0VY1v66mKc.wwAOVRiRJhK6ouVt_.wMB30bkeY0r9NK.KUTU4gu7GzZxbyh0EH_gE36kcnHDvGATrI_vFs9y1XHq3PgtlHmBUflqgjcS6x9MC5YpXoeELPYiT0k59IPMn..1cHED7zV6T78hILKinjM6hZ.ZeQwetIN6SPmuvXb7V2z2ddJa64Vg_zUi.euce0SjjJr5ti7tHWoFsTV1DO1MkFwDfUpy1yTCdESho.EwyRgfdfRAlx6njkTmlWNkp1aXcXU',
          domain: '.invaluable.com'
        }
      ];

    // Create clean query params object by removing our special parameters
    const searchParams = {...req.query};
    delete searchParams.directApiData;
    delete searchParams.cookies;
    delete searchParams.aztoken;
    delete searchParams.cf_clearance;
    
    // Check if we should fetch all pages
    const fetchAllPages = req.query.fetchAllPages === 'true';
    delete searchParams.fetchAllPages;
    
    // Get max pages to fetch if specified
    const maxPages = parseInt(req.query.maxPages) || 10;
    delete searchParams.maxPages;
    
    // Check if we should save to GCS
    const saveToGcs = req.query.saveToGcs === 'true';
    delete searchParams.saveToGcs;
    
    // Get category/search term for storage
    const category = searchParams.query || 'uncategorized';

    console.log('Starting search with parameters:', searchParams);
    
    let result;
    if (fetchAllPages) {
      console.log(`Fetching all pages (up to ${maxPages})`);
      
      // First, get the first page of results
      const firstPageResult = await invaluableScraper.search(searchParams, cookies);
      
      // Save the first page if enabled
      if (saveToGcs && firstPageResult) {
        try {
          console.log(`Saving first page results to GCS for category: ${category}, page: 1`);
          const gcsPath = await searchStorage.savePageResults(category, 1, firstPageResult);
          console.log(`Saved first page results to GCS at: ${gcsPath}`);
        } catch (error) {
          console.error('Error saving first page results to GCS:', error);
        }
      }
      
      // Hook into the pagination process to save each page
      const originalHandlePagination = require('../scrapers/invaluable/pagination').handlePagination;
      
      // Create a wrapper function that captures each page and saves it
      const handlePaginationWithStorage = async (browser, params, firstPageResults, initialCookies, maxPages, config) => {
        // Set up request interceptor to capture and save each page
        const originalSetupRequestInterception = require('../scrapers/invaluable/pagination/request-interceptor').setupRequestInterception;
        const { setupRequestInterception } = require('../scrapers/invaluable/pagination/request-interceptor');
        
        // Store the original function
        require('../scrapers/invaluable/pagination/request-interceptor').setupRequestInterception = 
          async (page, navState, pageNum, callback) => {
            // Call the original function with an enhanced callback
            return originalSetupRequestInterception(page, navState, pageNum, async (response, status) => {
              // Process with the original callback first
              if (callback) await callback(response, status);
              
              // Then save the response if it's a valid page result and GCS saving is enabled
              if (saveToGcs && response && response.results && response.results[0]?.hits) {
                try {
                  // Extract the current page number from the response
                  const currentPage = response.results[0]?.meta?.page || pageNum;
                  console.log(`Saving page ${currentPage} results to GCS for category: ${category}`);
                  const gcsPath = await searchStorage.savePageResults(category, currentPage, response);
                  console.log(`Saved page ${currentPage} results to GCS at: ${gcsPath}`);
                } catch (error) {
                  console.error(`Error saving page results to GCS: ${error.message}`);
                }
              }
            });
          };
          
        try {
          // Call the original function
          const results = await originalHandlePagination(browser, params, firstPageResults, initialCookies, maxPages, config);
          
          // Restore the original function
          require('../scrapers/invaluable/pagination/request-interceptor').setupRequestInterception = originalSetupRequestInterception;
          
          return results;
        } catch (error) {
          // Ensure the original function is restored even if there's an error
          require('../scrapers/invaluable/pagination/request-interceptor').setupRequestInterception = originalSetupRequestInterception;
          throw error;
        }
      };
      
      // Replace the original function with our wrapper
      require('../scrapers/invaluable/pagination').handlePagination = handlePaginationWithStorage;
      
      // Now run the search with all pages
      try {
        result = await invaluableScraper.searchAllPages(searchParams, cookies, maxPages);
      } finally {
        // Restore the original function when done
        require('../scrapers/invaluable/pagination').handlePagination = originalHandlePagination;
      }
    } else {
      // Single page search
      result = await invaluableScraper.search(searchParams, cookies);
      
      // Save the single page if enabled
      if (saveToGcs && result) {
        try {
          console.log(`Saving search results to GCS for category: ${category}, page: 1`);
          const gcsPath = await searchStorage.savePageResults(category, 1, result);
          console.log(`Saved search results to GCS at: ${gcsPath}`);
        } catch (error) {
          console.error('Error saving search results to GCS:', error);
        }
      }
    }
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No search results found',
        message: 'The search did not return any results. Try different parameters or check that the cookies are valid.'
      });
    }
    
    const formattedResults = formatSearchResults(result);
    
    // Log pagination information
    if (formattedResults.pagination) {
      console.log(`Search found ${formattedResults.pagination.totalItems} total items across ${formattedResults.pagination.totalPages} pages`);
    }
    
    res.json(standardizeResponse(formattedResults, {
      ...searchParams,
      fetchAllPages: fetchAllPages ? 'true' : 'false',
      maxPages: maxPages,
      saveToGcs: saveToGcs ? 'true' : 'false'
    }));
    
  } catch (error) {
    console.error('Error in search route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch search results',
      message: error.message 
    });
  }
});

// New endpoint to accept direct API data from client-side interception
router.post('/direct', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    // Validate request
    if (!req.body || !req.body.apiData) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Request must include apiData field'
      });
    }
    
    console.log('Received direct API data submission');
    const apiData = req.body.apiData;
    const searchParams = req.body.searchParams || {};
    
    // Check if we should save to GCS
    const saveToGcs = req.body.saveToGcs === true;
    
    // Get category/search term for storage
    const category = searchParams.query || 'uncategorized';
    
    const formattedResults = formatSearchResults(apiData);
    
    // Save to GCS if enabled
    if (saveToGcs) {
      try {
        const currentPage = formattedResults.pagination?.currentPage || 1;
        console.log(`Saving direct API data to GCS for category: ${category}, page: ${currentPage}`);
        
        // Store the raw results in GCS
        const gcsPath = await searchStorage.savePageResults(category, currentPage, apiData);
        console.log(`Saved direct API data to GCS at: ${gcsPath}`);
      } catch (error) {
        console.error('Error saving direct API data to GCS:', error);
        // Continue with response even if storage fails
      }
    }
    
    res.json(standardizeResponse(formattedResults, {
      ...searchParams,
      saveToGcs: saveToGcs ? 'true' : 'false'
    }));
    
  } catch (error) {
    console.error('Error handling direct API data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process API data',
      message: error.message 
    });
  }
});

// New endpoint to combine multiple pages of API data
router.post('/combine-pages', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    // Validate request
    if (!req.body || !Array.isArray(req.body.pages) || req.body.pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Request must include a non-empty array of pages'
      });
    }
    
    console.log(`Combining ${req.body.pages.length} pages of API data`);
    const pages = req.body.pages;
    const searchParams = req.body.searchParams || {};
    
    // Check if we should save to GCS
    const saveToGcs = req.body.saveToGcs === true;
    
    // Get category/search term for storage
    const category = searchParams.query || 'uncategorized';
    
    // Use the first page as the base
    let combinedData = JSON.parse(JSON.stringify(pages[0]));
    
    // Add hits from other pages
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i];
      if (page && page.results && page.results[0] && page.results[0].hits) {
        combinedData.results[0].hits = [
          ...combinedData.results[0].hits,
          ...page.results[0].hits
        ];
      }
    }
    
    // Update metadata
    if (combinedData.results && combinedData.results[0]) {
      const totalItems = combinedData.results[0].hits.length;
      if (combinedData.results[0].meta) {
        combinedData.results[0].meta.totalHits = totalItems;
      }
    }
    
    const formattedResults = formatSearchResults(combinedData);
    
    // Save individual pages to GCS if enabled
    if (saveToGcs) {
      try {
        console.log(`Saving ${pages.length} individual page results to GCS for category: ${category}`);
        
        // Save each page individually
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const pageNumber = (page.results?.[0]?.meta?.page) || (i + 1);
          
          // Store the raw page results in GCS
          const gcsPath = await searchStorage.savePageResults(category, pageNumber, page);
          console.log(`Saved page ${pageNumber} results to GCS at: ${gcsPath}`);
        }
      } catch (error) {
        console.error('Error saving combined pages to GCS:', error);
        // Continue with response even if storage fails
      }
    }
    
    res.json(standardizeResponse(formattedResults, {
      ...searchParams,
      saveToGcs: saveToGcs ? 'true' : 'false',
      combinedPages: pages.length
    }));
    
  } catch (error) {
    console.error('Error combining API data pages:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to combine API data pages',
      message: error.message 
    });
  }
});

module.exports = router;
