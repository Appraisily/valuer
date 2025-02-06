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
    
    // Add all provided parameters
    Object.entries(params).forEach(([key, value]) => {
      // Skip parameters we already set
      if (value !== undefined && value !== null && 
          !['upcoming', 'query', 'keyword', 'priceResult'].includes(key)) {
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
        await page.setRequestInterception(true);
        
        // Intercept catResults response
        page.on('response', async response => {
          const url = response.url();
          if (url.includes('catResults') && response.status() === 200) {
            console.log('Intercepted catResults response');
            try {
              const text = await response.text();
              catResults = JSON.parse(text);
              if (catResults && catResults.results && catResults.results[0].hits) {
                const hits = catResults.results[0].hits;
                console.log(`Found ${hits.length} results:`);
                hits.forEach(hit => {
                  console.log(`
Item: ${hit.lotTitle}
Date: ${hit.dateTimeLocal}
House: ${hit.houseName}
Price: ${hit.currencySymbol}${hit.priceResult}
Image: ${hit.photoPath}
-------------------`);
                });
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
            headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            
            if (reqUrl.includes('catResults')) {
              headers['Accept'] = 'application/json';
              headers['Content-Type'] = 'application/json';
            }
            
            // Block unnecessary resources
            if (request.resourceType() === 'image' || 
                request.resourceType() === 'stylesheet' || 
                request.resourceType() === 'font') {
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
        await page.setCookie(...cookies);
        
        // Navigate to search URL
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: NAVIGATION_TIMEOUT
        });
                
        return catResults;
        
      } finally {
        await this.browser.closeTab('search');
      }
      
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }
}

module.exports = InvaluableScraper;