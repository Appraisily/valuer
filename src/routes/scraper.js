/**
 * Scraper routes - Endpoints to manage data scraping operations
 * Updated to use the UnifiedScraper for all operations
 */
const express = require('express');
const router = express.Router();
const UnifiedScraper = require('../scrapers/invaluable/unified-scraper');
const SearchStorageService = require('../utils/search-storage');

// Initialize storage service
const searchStorage = new SearchStorageService();

/**
 * Start a scraping job and return the initial results
 * @param {Object} params - Scraping parameters
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Scraping results and statistics
 */
async function startScrapingJob(params, options) {
  console.log(`Starting scraping job for category: ${params.supercategoryName || params.categoryName || 'all'}`);
  console.log(`Will scrape up to ${options.maxPages} pages`);
  
  const scraper = new UnifiedScraper({
    debug: options.debug || false,
    headless: options.headless !== false,
    gcsBucket: options.gcsBucket || 'invaluable-data',
    baseDelay: options.baseDelay || 2000,
    maxDelay: options.maxDelay || 10000,
    minDelay: options.minDelay || 1000,
    maxRetries: options.maxRetries || 3
  });
  
  try {
    console.log('Initializing browser...');
    await scraper.initialize();
    console.log('Browser initialized for scraping job');
    
    console.log(`Getting${options.maxPages > 1 ? ' multiple pages' : ' first page'} of results for ${params.query || 'all items'}...`);
    
    // Perform the search with unified scraper
    const results = await scraper.search(params, options);
    
    // Save results if enabled
    if (options.saveToGcs && results.results?.results?.[0]?.hits?.length > 0) {
      try {
        // Format the results for storage
        const lots = results.results.results[0].hits.map(hit => ({
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
        
        // Save to storage
        const searchId = await searchStorage.saveSearchResults(lots, {
          query: params.query || '',
          category: params.supercategoryName || params.categoryName || 'all'
        });
        
        console.log(`Saved ${lots.length} results to storage with ID: ${searchId}`);
      } catch (storageError) {
        console.error('Error saving to storage:', storageError);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error during scraping job:', error);
    throw error;
  } finally {
    // Always close the browser when done
    try {
      await scraper.close();
      console.log('Scraping job browser closed');
    } catch (closeError) {
      console.error('Error closing browser:', closeError);
    }
  }
}

// Endpoint to start a scraping job
router.post('/start', express.json(), async (req, res) => {
  try {
    // Get parameters from request body with defaults
    const {
      category = 'furniture',
      query = '',
      supercategory = null,
      subcategory = null,
      maxPages = 10,
      priceMin = 250,
      priceMax = null,
      upcoming = false,
      gcsBucket = 'invaluable-data',
      debug = false,
      headless = true,
      saveToGcs = true
    } = req.body;
    
    // Validate required parameters
    if (!category && !supercategory && !query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'At least one of: category, supercategory, or query is required'
      });
    }
    
    // Build standardized parameters for the UnifiedScraper
    const scrapingParams = {
      query,
      upcoming,
      priceResult: {
        min: priceMin,
        max: priceMax || undefined
      }
    };
    
    // Handle category parameters with priority
    if (supercategory) scrapingParams.supercategoryName = supercategory;
    if (category) scrapingParams.categoryName = category;
    if (subcategory) scrapingParams.subcategoryName = subcategory;
    
    // Options for the scraper
    const scrapingOptions = {
      maxPages: parseInt(maxPages, 10),
      saveToGcs,
      gcsBucket,
      debug,
      headless
    };
    
    // Start scraping asynchronously and send initial response
    startScrapingJob(scrapingParams, scrapingOptions)
      .then(results => {
        console.log(`Scraping job completed successfully, found ${results.results?.results?.[0]?.hits?.length || 0} items`);
        
        // Log metrics if available
        if (results.stats) {
          console.log(`Processed ${results.stats.pagesScraped || 1} pages in ${results.stats.totalProcessingTime || 0}ms`);
        }
      })
      .catch(error => {
        console.error('Scraping job failed:', error.message);
      });
    
    // Return immediate response to client
    res.json({
      success: true,
      message: 'Scraping job started successfully',
      parameters: scrapingParams,
      options: scrapingOptions
    });
    
  } catch (error) {
    console.error('Error handling scraper request:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message
    });
  }
});

// Endpoint to get scraping job status (for future implementation)
router.get('/status/:jobId', async (req, res) => {
  // This would be implemented with a job tracking system
  res.json({
    success: true,
    message: 'Job status API not yet implemented',
    jobId: req.params.jobId
  });
});

module.exports = router; 