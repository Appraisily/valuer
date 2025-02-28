/**
 * Unified search route
 * 
 * This route provides a single consistent interface for all search operations,
 * using the unified scraper to handle parameter consistency and proper URL construction.
 */
const express = require('express');
const router = express.Router();
const UnifiedScraper = require('../scrapers/invaluable/unified-scraper');
const SearchStorageService = require('../utils/search-storage');

// Initialize services
const searchStorage = new SearchStorageService();
let scraper = null;

/**
 * Initialize the scraper on demand
 */
async function initializeScraper() {
  if (!scraper) {
    console.log('Initializing unified scraper...');
    try {
      scraper = new UnifiedScraper({
        debug: process.env.DEBUG === 'true',
        headless: process.env.HEADLESS !== 'false', // Default to headless
        gcsBucket: process.env.GCS_BUCKET || 'invaluable-data'
      });
      await scraper.initialize();
      console.log('Unified scraper initialized successfully');
    } catch (error) {
      console.error('Error initializing unified scraper:', error);
      throw error;
    }
  }
  return scraper;
}

/**
 * Format search results into a standardized format
 */
function formatSearchResults(catResults) {
  if (!catResults?.results?.[0]?.hits) {
    return { lots: [], totalResults: 0, pagination: { totalItems: 0, totalPages: 0 } };
  }

  const hits = catResults.results[0].hits;
  const lots = hits.map(hit => ({
    title: hit.lotTitle,
    date: hit.dateTimeLocal,
    auctionHouse: hit.houseName,
    price: {
      amount: hit.priceResult,
      currency: hit.currencyCode,
      symbol: hit.currencySymbol
    },
    image: hit.photoPath,
    lotNumber: hit.lotNumber,
    saleType: hit.saleType,
    id: hit.lotId || hit.id,
    auctionId: hit.saleId,
    url: hit.itemLink
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

/**
 * Create standardized response object
 */
function standardizeResponse(data, parameters = {}, stats = null) {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    parameters,
    pagination: data.pagination || {
      totalItems: 0,
      totalPages: 0,
      itemsPerPage: 0,
      currentPage: 1
    },
    stats: stats || {},
    data: {
      lots: data.lots || [],
      totalResults: data.totalResults || 0
    }
  };
}

/**
 * Endpoint for searching with pagination
 */
router.get('/', async (req, res) => {
  console.log(`[${new Date().toISOString()}] - Starting unified search`);
  const startTime = Date.now();
  
  try {
    // Extract and normalize query parameters
    const params = {
      query: req.query.query || '',
      // Ensure consistent parameter handling
      upcoming: req.query.upcoming === 'true' ? true : false,
      priceResult: {
        min: parseInt(req.query['priceResult[min]'] || req.query.minPrice || 250, 10),
        max: parseInt(req.query['priceResult[max]'] || req.query.maxPrice || 0, 10) || undefined
      },
      supercategoryName: req.query.supercategory || req.query.supercategoryName,
      categoryName: req.query.category || req.query.categoryName,
      subcategoryName: req.query.subcategory || req.query.subcategoryName
    };

    // Clean up empty or invalid values
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === undefined || params[key] === null) {
        delete params[key];
      }
    });

    // Handle pagination options
    const options = {
      fetchAllPages: req.query.fetchAllPages === 'true',
      maxPages: parseInt(req.query.maxPages || 1, 10),
      saveToGcs: req.query.saveToGcs === 'true',
      debug: req.query.debug === 'true'
    };

    // Log search parameters
    console.log(`[${new Date().toISOString()}] - Query: ${params.query}`);
    console.log(`[${new Date().toISOString()}] - Category: ${params.categoryName || 'all'}`);
    console.log(`[${new Date().toISOString()}] - Fetch all pages: ${options.fetchAllPages}`);
    console.log(`[${new Date().toISOString()}] - Max pages: ${options.maxPages}`);
    console.log(`[${new Date().toISOString()}] - Save to GCS: ${options.saveToGcs}`);

    // Make sure we only fetch multiple pages if explicitly requested
    if (options.fetchAllPages && options.maxPages <= 1) {
      options.maxPages = 10; // Default to 10 pages if fetchAllPages is true but no maxPages specified
    }

    console.log(`[${new Date().toISOString()}] 📚 Starting ${options.fetchAllPages ? 'multi-page' : 'single-page'} search with up to ${options.maxPages} pages`);

    // Initialize the scraper
    const scraper = await initializeScraper();

    // Perform the search
    const searchResult = await scraper.search(params, options);

    // Format the results
    const formattedResults = formatSearchResults(searchResult.results);

    // Save results to storage if enabled
    if (options.saveToGcs) {
      try {
        const searchId = await searchStorage.saveSearchResults(formattedResults.lots, {
          query: params.query,
          category: params.categoryName || 'all'
        });
        console.log(`[${new Date().toISOString()}] 💾 Search results saved with ID: ${searchId}`);
      } catch (storageError) {
        console.error(`[${new Date().toISOString()}] ❌ Error saving search results:`, storageError);
      }
    }

    // Send the response
    const response = standardizeResponse(formattedResults, params, searchResult.stats);
    const elapsedTime = Date.now() - startTime;
    response.timing = {
      totalTime: elapsedTime,
      timeUnit: 'ms'
    };

    console.log(`[${new Date().toISOString()}] ✅ Search completed in ${elapsedTime}ms`);
    res.json(response);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error in unified search:`, error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message
    });
  }
});

module.exports = router; 