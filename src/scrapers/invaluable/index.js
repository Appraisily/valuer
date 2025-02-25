const BrowserManager = require('./browser');

const NAVIGATION_TIMEOUT = 30000;

class InvaluableScraper {
  constructor() {
    this.browser = new BrowserManager();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      console.log('Scraper already initialized');
      return;
    }

    try {
      console.log('Initializing browser...');
      await this.browser.initialize();
      this.initialized = true;
      console.log('Browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async close() {
    if (this.initialized) {
      try {
        await this.browser.close();
        this.initialized = false;
        console.log('Browser closed successfully');
      } catch (error) {
        console.error('Error closing browser:', error);
        throw error;
      }
    }
  }

  constructSearchUrl(params = {}) {
    const baseUrl = 'https://www.invaluable.com/search';
    const searchParams = new URLSearchParams();

    // Handle nested price range parameters
    if (params.priceResult) {
      if (params.priceResult.min) {
        searchParams.append('priceResult[min]', params.priceResult.min);
      }
      if (params.priceResult.max) {
        searchParams.append('priceResult[max]', params.priceResult.max);
      }
    }
    
    // Add required furniture search parameters
    searchParams.append('upcoming', 'false');
    searchParams.append('query', params.query || 'furniture');
    searchParams.append('keyword', params.keyword || params.query || 'furniture');
    
    // Handle pagination parameters
    if (params.page && !isNaN(params.page)) {
      searchParams.append('page', params.page);
    }
    
    // Add all provided parameters
    Object.entries(params).forEach(([key, value]) => {
      // Skip parameters we already set
      if (value !== undefined && value !== null && 
          !['upcoming', 'query', 'keyword', 'priceResult', 'page'].includes(key)) {
        searchParams.append(key, value);
      }
    });

    return `${baseUrl}?${searchParams.toString()}`;
  }

  async search(params = {}, cookies = []) {
    if (!this.initialized) {
      throw new Error('Scraper not initialized. Call initialize() first');
    }

    try {
      console.log('Starting Invaluable search');
      
      const url = this.constructSearchUrl(params);
      console.log('Search URL:', url);
      
      const page = await this.browser.createTab('search');
      let catResults = null;
      
      try {
        // Set up API interception
        await page.setRequestInterception(true);
        
        // Track if we've found results
        let foundResults = false;
        let maxAttempts = 3;
        let attempts = 0;
        
        // Intercept catResults response
        page.on('response', async response => {
          const responseUrl = response.url();
          if (responseUrl.includes('catResults') && response.status() === 200) {
            console.log('Intercepted catResults response');
            try {
              const text = await response.text();
              catResults = JSON.parse(text);
              if (catResults && catResults.results && catResults.results[0].hits) {
                const hits = catResults.results[0].hits;
                console.log(`Found ${hits.length} results`);
                foundResults = true;
              }
            } catch (error) {
              console.error('Error parsing catResults:', error.message);
              console.log('Raw response text:', text.substring(0, 200) + '...');
            }
          }
        });
        
        // Handle requests
        page.on('request', request => {
          try {
            const reqUrl = request.url();
            const headers = request.headers();
            
            // Add cookies to all requests
            if (cookies && cookies.length > 0) {
              headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            }
            
            if (reqUrl.includes('catResults')) {
              headers['Accept'] = 'application/json';
              headers['Content-Type'] = 'application/json';
              console.log('Enhancing catResults request with headers');
            }
            
            // Block unnecessary resources to reduce detection chance
            if (request.resourceType() === 'image' || 
                request.resourceType() === 'stylesheet' || 
                request.resourceType() === 'font' ||
                request.resourceType() === 'media' ||
                reqUrl.includes('google') ||
                reqUrl.includes('analytics') ||
                reqUrl.includes('facebook') ||
                reqUrl.includes('ads')) {
              request.abort();
              return;
            }
            
            request.continue({ headers });
          } catch (error) {
            if (!error.message.includes('Request is already handled')) {
              console.error('Request handling error:', error);
            }
            request.continue();
          }
        });

        // Set cookies
        if (cookies && cookies.length > 0) {
          await page.setCookie(...cookies);
        }
        
        // Attempt navigation with retries
        while (attempts < maxAttempts && !foundResults) {
          attempts++;
          console.log(`Navigation attempt ${attempts} of ${maxAttempts}`);
          
          try {
            // Navigate to search URL
            await page.goto(url, {
              waitUntil: 'networkidle2', 
              timeout: NAVIGATION_TIMEOUT
            });
            
            // Handle potential Cloudflare challenge
            await this.browser.handleProtection();
            
            // Wait specifically for API call to complete
            await page.waitForResponse(
              response => response.url().includes('catResults') && response.status() === 200,
              { timeout: NAVIGATION_TIMEOUT }
            ).catch(err => console.log('No catResults response detected in timeframe'));
            
            // If we already intercepted results, we're done
            if (foundResults) break;
            
            // Try to manually trigger search request if no results yet
            if (!foundResults) {
              console.log('Attempting to manually trigger search API request...');
              await page.evaluate(async (searchUrl) => {
                // Try to extract search parameters
                const url = new URL(searchUrl);
                const params = {};
                for (const [key, value] of url.searchParams.entries()) {
                  params[key] = value;
                }
                
                // Attempt to manually trigger API call
                try {
                  const response = await fetch('/api/v2/search/catResults', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                      params: params
                    })
                  });
                  console.log('Manual API call status:', response.status);
                } catch (error) {
                  console.log('Manual API call failed:', error);
                }
              }, url);
              
              // Give time for the manual request to complete
              await page.waitForTimeout(5000);
            }
          } catch (error) {
            console.error(`Navigation attempt ${attempts} failed:`, error.message);
            // Wait before retrying
            await page.waitForTimeout(2000);
          }
        }
        
        return catResults;
        
      } finally {
        await this.browser.closeTab('search');
      }
      
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  async searchAllPages(params = {}, cookies = [], maxPages = 10) {
    if (!this.initialized) {
      throw new Error('Scraper not initialized. Call initialize() first');
    }

    try {
      console.log('Starting paginated search for all results');
      
      let currentPage = 1;
      let hasMoreResults = true;
      let allResults = null;
      
      // Continue fetching pages until we have no more results or reach maxPages
      while (hasMoreResults && currentPage <= maxPages) {
        console.log(`Fetching page ${currentPage}...`);
        
        // Set the current page in parameters
        const pageParams = { ...params, page: currentPage };
        
        // Fetch the current page
        const pageResults = await this.search(pageParams, cookies);
        
        // If we got results, process them
        if (pageResults && pageResults.results && pageResults.results[0] && pageResults.results[0].hits) {
          const hitsCount = pageResults.results[0].hits.length;
          console.log(`Found ${hitsCount} results on page ${currentPage}`);
          
          // Initialize our accumulated results object if this is the first page
          if (!allResults) {
            allResults = JSON.parse(JSON.stringify(pageResults));
          } else {
            // Append hits from this page to our accumulated results
            allResults.results[0].hits = [
              ...allResults.results[0].hits,
              ...pageResults.results[0].hits
            ];
          }
          
          // If we got fewer results than the standard page size (usually 96),
          // or we got exactly 0 results, we've reached the end
          if (hitsCount < 96 || hitsCount === 0) {
            hasMoreResults = false;
            console.log(`Reached end of results at page ${currentPage} with ${hitsCount} items`);
          } else {
            // Move to the next page
            currentPage++;
          }
        } else {
          // No valid results on this page, end the loop
          hasMoreResults = false;
          console.log(`No valid results on page ${currentPage}, ending pagination`);
        }
        
        // Short delay between pages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (allResults && allResults.results && allResults.results[0]) {
        const totalItems = allResults.results[0].hits.length;
        console.log(`Pagination complete. Total items collected: ${totalItems}`);
        
        // Update the metadata to reflect the total number of results
        if (allResults.results[0].meta) {
          allResults.results[0].meta.totalHits = totalItems;
        }
      }
      
      return allResults;
    } catch (error) {
      console.error('Error during paginated search:', error);
      throw error;
    }
  }
}

module.exports = InvaluableScraper;