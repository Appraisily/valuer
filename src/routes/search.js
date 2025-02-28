const express = require('express');
const router = express.Router();

function formatPrice(hit) {
  return {
    amount: hit.priceResult,
    currency: hit.currencyCode,
    symbol: hit.currencySymbol
  };
}

function formatSearchResults(catResults) {
  if (!catResults?.results?.[0]?.hits) {
    return { lots: [], totalResults: 0 };
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

  return {
    lots,
    totalResults: lots.length
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
    data: data
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

    console.log('Starting search with parameters:', searchParams);
    
    let result;
    if (fetchAllPages) {
      console.log(`Fetching all pages (up to ${maxPages})`);
      result = await invaluableScraper.searchAllPages(searchParams, cookies, maxPages);
    } else {
      result = await invaluableScraper.search(searchParams, cookies);
    }
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No search results found',
        message: 'The search did not return any results. Try different parameters or check that the cookies are valid.'
      });
    }
    
    const formattedResults = formatSearchResults(result);
    res.json(standardizeResponse(formattedResults, {
      ...searchParams,
      fetchAllPages: fetchAllPages ? 'true' : 'false',
      maxPages: maxPages
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
    
    const formattedResults = formatSearchResults(apiData);
    res.json(standardizeResponse(formattedResults, searchParams));
    
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
    res.json(standardizeResponse(formattedResults, searchParams));
    
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
