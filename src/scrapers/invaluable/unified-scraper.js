/**
 * Unified Scraper Module for Invaluable
 * 
 * This module provides a centralized approach to scraping Invaluable.com,
 * with consistent parameter handling and a unified interface for all scraping operations.
 */
const BrowserManager = require('./browser');
const { constructSearchUrl } = require('./url-builder');
const { handleFirstPage } = require('./pagination');
const PaginationManager = require('./pagination/pagination-manager');
const { buildSearchParams } = require('./utils');
const { DEFAULT_MAX_PAGES, API_BASE_URL } = require('./constants');

class UnifiedScraper {
  constructor(config = {}) {
    this.config = {
      // Browser settings
      headless: true,
      userDataDir: config.userDataDir,
      
      // Storage settings
      gcsEnabled: config.gcsEnabled || false,
      gcsBucket: config.gcsBucket || 'invaluable-data',
      
      // Rate limiting
      baseDelay: config.baseDelay || 2000,
      maxDelay: config.maxDelay || 10000,
      minDelay: config.minDelay || 1000,
      maxRetries: config.maxRetries || 3,
      
      // Default parameter values
      defaultPriceMin: 250,
      defaultUpcoming: false,
      defaultSort: 'sale_date|desc',
      
      // Other settings
      debug: config.debug || false
    };
    
    this.browser = null;
    this.initialized = false;
    this.interceptedResponses = {};
    this.catResultsPatterns = [
      "**/catResults*",
      "**/api/search/catResults*",
      "**/algoliaSearch*"
    ];
  }
  
  /**
   * Log debug messages if debug is enabled
   * @param {string} message - The message to log
   * @param {Object} data - Optional data to log
   */
  debug(message, data) {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [UnifiedScraper] ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }
  
  /**
   * Initialize the browser
   */
  async initialize() {
    if (this.initialized) {
      this.debug('Browser already initialized');
      return;
    }
    
    let retries = 0;
    const maxRetries = 3;
    let lastError = null;
    
    while (retries < maxRetries) {
      try {
        this.debug(`Initializing browser${retries > 0 ? ` (attempt ${retries + 1}/${maxRetries})` : ''}...`);
        
        // Add more debugging for browser initialization
        console.log(`[UnifiedScraper] Browser initialization attempt ${retries + 1}/${maxRetries}`);
        
        this.browser = new BrowserManager({
          headless: this.config.headless,
          userDataDir: this.config.userDataDir
        });
        
        await this.browser.initialize();
        this.initialized = true;
        this.debug('Browser initialized successfully');
        return;
      } catch (error) {
        lastError = error;
        console.error(`[UnifiedScraper] Error initializing browser (attempt ${retries + 1}/${maxRetries}):`, error.message);
        
        // Log more detailed error information
        console.error(`[UnifiedScraper] Additional error details:`, {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
          cause: error.cause
        });
        
        // Close browser if it was partially created
        if (this.browser) {
          try {
            await this.browser.close();
          } catch (closeError) {
            console.error('[UnifiedScraper] Error closing browser after failed initialization:', closeError.message);
          }
          this.browser = null;
        }
        
        retries++;
        
        if (retries < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delayMs = Math.min(2000 * Math.pow(2, retries), 10000);
          console.log(`[UnifiedScraper] Retrying in ${delayMs/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // All retries failed
    console.error('[UnifiedScraper] All browser initialization attempts failed');
    throw lastError || new Error('Failed to initialize browser after multiple attempts');
  }
  
  /**
   * Close the browser instance
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.initialized = false;
    }
  }
  
  /**
   * Set up request interception for a page to capture catResults responses
   * @param {Page} page - Puppeteer page object
   */
  async setupRequestInterception(page) {
    this.debug('Setting up request interception');
    
    // Clear previously intercepted responses
    this.interceptedResponses = {};
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    // Handle requests
    page.on('request', request => {
      // Let all requests through, we'll intercept responses
      request.continue();
    });
    
    // Handle responses
    page.on('response', async response => {
      const url = response.url();
      
      // Check if this is a catResults response
      const isCatResults = this.catResultsPatterns.some(pattern => {
        return url.includes(pattern.replace(/\*/g, ''));
      });
      
      if (isCatResults) {
        this.debug(`Intercepted catResults response: ${url}`);
        
        try {
          // Get response content
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const responseJson = await response.json();
            
            // Store the response data
            this.interceptedResponses[url] = responseJson;
            
            // Extract page number from URL if available
            const pageMatch = url.match(/[?&]page=(\d+)/);
            const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
            
            this.debug(`Captured catResults for page ${pageNum}`, {
              url,
              status: response.status(),
              resultCount: responseJson.results?.[0]?.hits?.length || 0
            });
          }
        } catch (error) {
          console.error(`Error processing catResults response: ${error.message}`);
        }
      }
    });
  }
  
  /**
   * Build standardized search parameters with proper defaults
   * @param {Object} params - Input search parameters
   * @returns {Object} Standardized search parameters
   */
  buildSearchParams(params = {}) {
    // Start with the base params
    const searchParams = {
      query: params.query || '',
      upcoming: params.upcoming !== undefined ? params.upcoming : this.config.defaultUpcoming,
      sort: params.sort || this.config.defaultSort
    };
    
    // Handle keyword - ensure it matches query if not explicitly specified
    if (params.keyword) {
      searchParams.keyword = params.keyword;
    } else if (params.query) {
      searchParams.keyword = params.query;
    }
    
    // Handle price range 
    if (!params.priceResult && this.config.defaultPriceMin) {
      searchParams.priceResult = { min: this.config.defaultPriceMin };
    } else if (params.priceResult) {
      searchParams.priceResult = params.priceResult;
    }
    
    // Handle category parameters
    if (params.supercategoryName) searchParams.supercategoryName = params.supercategoryName;
    if (params.categoryName) searchParams.categoryName = params.categoryName;
    if (params.subcategoryName) searchParams.subcategoryName = params.subcategoryName;
    if (params.category) searchParams.category = params.category;
    
    // Handle pagination
    if (params.page && params.page > 1) {
      searchParams.page = params.page;
    }
    
    return searchParams;
  }
  
  /**
   * Navigate to the search URL and wait for results to load
   * @param {Page} page - Puppeteer page object
   * @param {string} url - URL to navigate to
   * @returns {Promise<Object>} Search results
   */
  async navigateAndGetResults(page, url) {
    this.debug(`Navigating to: ${url}`);
    
    // Set up request interception
    await this.setupRequestInterception(page);
    
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Give a bit more time for any delayed Ajax requests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract cookies from the page
    const cookies = await page.cookies();
    this.debug(`Captured ${cookies.length} cookies`);
    
    // Get the most recent catResults response
    const catResultsUrls = Object.keys(this.interceptedResponses);
    
    if (catResultsUrls.length === 0) {
      this.debug('No catResults responses were intercepted');
      
      // Try to trigger search results loading by interacting with the page
      this.debug('Attempting to trigger search results loading...');
      await page.evaluate(() => {
        // Scroll down a bit to trigger lazy loading
        window.scrollBy(0, 500);
      });
      
      // Wait a bit more using setTimeout instead of waitForTimeout
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check again for catResults responses
      const updatedCatResultsUrls = Object.keys(this.interceptedResponses);
      if (updatedCatResultsUrls.length === 0) {
        throw new Error('No search results found. No catResults responses were intercepted.');
      }
    }
    
    // Get the latest intercepted response
    const latestResultUrl = catResultsUrls[catResultsUrls.length - 1];
    const results = this.interceptedResponses[latestResultUrl];
    
    this.debug(`Got search results with ${results.results?.[0]?.hits?.length || 0} items`);
    
    return { results, cookies };
  }
  
  /**
   * Perform a search with pagination using request interception
   * @param {Object} params - Search parameters
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(params = {}, options = {}) {
    try {
      // Ensure browser is initialized
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Set up options with defaults
      const searchOptions = {
        maxPages: options.maxPages || DEFAULT_MAX_PAGES,
        saveToGcs: options.saveToGcs !== undefined ? options.saveToGcs : this.config.gcsEnabled,
        gcsBucket: options.gcsBucket || this.config.gcsBucket,
        ...options
      };
      
      this.debug('Starting search with params:', params);
      this.debug('Options:', searchOptions);
      
      // Build search parameters with appropriate defaults
      const searchParams = this.buildSearchParams(params);
      
      // Format to the expected structure for the existing functions
      const formattedParams = buildSearchParams(searchParams);
      
      this.debug('Formatted search params:', formattedParams);
      
      // Create a new browser tab
      const page = await this.browser.createTab();
      
      try {
        // Construct the search URL
        const searchUrl = constructSearchUrl(searchParams);
        this.debug(`Constructed search URL: ${searchUrl}`);
        
        // Navigate to the search URL and get results
        const { results: firstPageResults, cookies: initialCookies } = 
          await this.navigateAndGetResults(page, searchUrl);
        
        if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
          throw new Error('Failed to get first page results');
        }
        
        // Log information about the first page results
        this.debug(`First page results:`, {
          totalHits: firstPageResults.results[0].meta?.totalHits || 'unknown',
          hitsOnPage: firstPageResults.results[0].hits?.length || 0
        });
        
        // If only the first page is requested, return it
        if (searchOptions.maxPages <= 1) {
          return {
            results: firstPageResults,
            cookies: initialCookies,
            stats: {
              totalProcessingTime: 0,
              pagesScraped: 1
            }
          };
        }
        
        // For multi-page searches, use the pagination manager
        this.debug(`Initializing pagination manager for multi-page search (up to ${searchOptions.maxPages} pages)`);
        
        // Initialize pagination manager for multi-page searches
        const paginationManager = new PaginationManager({
          category: formattedParams.category || 'default',
          query: formattedParams.query || '',
          maxPages: searchOptions.maxPages,
          startPage: 1,
          gcsEnabled: searchOptions.saveToGcs,
          gcsBucket: searchOptions.gcsBucket,
          batchSize: options.batchSize || 100,
          baseDelay: this.config.baseDelay,
          maxDelay: this.config.maxDelay,
          minDelay: this.config.minDelay,
          maxRetries: this.config.maxRetries
        });
        
        // Process pagination
        const results = await paginationManager.processPagination(
          this.browser,
          formattedParams,
          firstPageResults,
          initialCookies
        );
        
        // Get statistics
        const stats = paginationManager.getStats();
        
        return {
          results,
          stats,
          cookies: initialCookies
        };
      } finally {
        // Close the tab
        await this.browser.closeTab(page);
      }
    } catch (error) {
      console.error('[UnifiedScraper] Error during search:', error);
      throw error;
    }
  }
}

module.exports = UnifiedScraper; 