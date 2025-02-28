/**
 * CatResults Request Interception Example
 * 
 * This script demonstrates how the improved UnifiedScraper 
 * intercepts catResults responses from Invaluable.
 */
require('dotenv').config();
const puppeteer = require('puppeteer');
const { constructSearchUrl } = require('../scrapers/invaluable/url-builder');

// Configuration
const DEBUG = true;
const HEADLESS = process.env.HEADLESS !== 'false';

/**
 * Log with timestamp
 */
function log(message, data) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Intercept Invaluable catResults responses
 */
async function interceptCatResults() {
  log('Starting catResults interception demo');
  
  // Track intercepted responses
  const interceptedResponses = {};
  
  // Launch browser
  log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    // Create a new page
    const page = await browser.newPage();
    
    // Setup request interception
    log('Setting up request interception');
    await page.setRequestInterception(true);
    
    // Define patterns for catResults endpoints
    const catResultsPatterns = [
      "**/catResults*",
      "**/api/search/catResults*",
      "**/algoliaSearch*"
    ];
    
    // Handle requests (allow all to continue)
    page.on('request', request => {
      request.continue();
    });
    
    // Handle responses to capture catResults data
    page.on('response', async response => {
      const url = response.url();
      
      // Check if this is a catResults response
      const isCatResults = catResultsPatterns.some(pattern => {
        return url.includes(pattern.replace(/\*/g, ''));
      });
      
      if (isCatResults) {
        log(`Intercepted catResults response: ${url}`);
        
        try {
          // Get response content
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const responseJson = await response.json();
            
            // Store the response data
            interceptedResponses[url] = responseJson;
            
            // Extract page number from URL if available
            const pageMatch = url.match(/[?&]page=(\d+)/);
            const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
            
            // Display basic stats from the response
            if (responseJson.results && responseJson.results[0] && responseJson.results[0].hits) {
              const hits = responseJson.results[0].hits;
              const totalHits = responseJson.results[0].meta?.totalHits || 'unknown';
              
              log(`Captured catResults for page ${pageNum}`, {
                url: url,
                status: response.status(),
                hitsCount: hits.length,
                totalHits: totalHits
              });
              
              // Show first item as example
              if (hits.length > 0) {
                log('First item example:', {
                  title: hits[0].lotTitle,
                  price: `${hits[0].currencySymbol}${hits[0].priceResult} ${hits[0].currencyCode}`,
                  auction: hits[0].houseName,
                  date: hits[0].dateTimeLocal
                });
              }
            }
          }
        } catch (error) {
          log(`Error processing catResults response: ${error.message}`);
        }
      }
    });
    
    // Define search parameters
    const searchParams = {
      query: process.argv[2] || 'antique furniture',
      supercategoryName: process.argv[3] || 'Furniture',
      priceResult: {
        min: 250,
      },
      upcoming: false
    };
    
    // Build the search URL
    const searchUrl = constructSearchUrl(searchParams);
    log(`Navigating to search URL: ${searchUrl}`);
    
    // Navigate to the URL and wait for results
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    log('Initial page loaded. Waiting for API responses...');
    
    // Give time for any delayed API calls
    await page.waitForTimeout(2000);
    
    // Check if we've intercepted any responses
    const responseCount = Object.keys(interceptedResponses).length;
    
    if (responseCount === 0) {
      log('No catResults responses intercepted. Trying to trigger search results...');
      
      // Try to trigger search results by scrolling
      await page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      
      // Wait a bit more
      await page.waitForTimeout(3000);
      
      // Check again
      const updatedResponseCount = Object.keys(interceptedResponses).length;
      
      if (updatedResponseCount === 0) {
        log('Still no catResults responses intercepted. Demonstration failed.');
      } else {
        log(`Successfully intercepted ${updatedResponseCount} catResults responses after scrolling!`);
      }
    } else {
      log(`Successfully intercepted ${responseCount} catResults responses!`);
    }
    
    // Try paginating to the next page
    log('Attempting to navigate to page 2...');
    
    // Add page=2 to the URL
    const page2Url = searchUrl + (searchUrl.includes('?') ? '&page=2' : '?page=2');
    log(`Navigating to page 2: ${page2Url}`);
    
    await page.goto(page2Url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Give time for any delayed API calls
    await page.waitForTimeout(2000);
    
    // Final count of intercepted responses
    const finalResponseCount = Object.keys(interceptedResponses).length;
    log(`Final count: ${finalResponseCount} catResults responses intercepted`);
    
    // Show all URLs we've intercepted
    log('Intercepted URLs:', Object.keys(interceptedResponses));
    
  } catch (error) {
    log(`Error during demonstration: ${error.message}`);
    console.error(error);
  } finally {
    // Clean up
    await browser.close();
    log('Browser closed. Demonstration complete.');
  }
}

// Run the demonstration
interceptCatResults().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 