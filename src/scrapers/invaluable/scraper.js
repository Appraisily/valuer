const BrowserManager = require('./browser');
const { constructSearchUrl } = require('./url-builder');
const { formatCookies, extractMetadata } = require('./utils');
const { handleSearch } = require('./search-handler');
const { handlePagination } = require('./pagination-handler');

class InvaluableScraper {
  constructor() {
    this.browser = new BrowserManager();
    this.initialized = false;
    this.config = {
      NAVIGATION_TIMEOUT: 30000,
      DEFAULT_HITS_PER_PAGE: 96
    };
  }

  async initialize() {
    if (this.initialized) {
      console.log('Scraper ya inicializado');
      return;
    }

    try {
      console.log('Inicializando navegador...');
      await this.browser.initialize();
      this.initialized = true;
      console.log('Navegador inicializado correctamente');
    } catch (error) {
      console.error('Error al inicializar el navegador:', error);
      throw error;
    }
  }

  async close() {
    if (this.initialized) {
      try {
        await this.browser.close();
        this.initialized = false;
        console.log('Navegador cerrado correctamente');
      } catch (error) {
        console.error('Error al cerrar el navegador:', error);
        throw error;
      }
    }
  }

  async search(params = {}, cookies = []) {
    if (!this.initialized) {
      throw new Error('Scraper no inicializado. Llame a initialize() primero');
    }

    try {
      console.log('Iniciando búsqueda en Invaluable');
      const url = constructSearchUrl(params);
      return await handleSearch(this.browser, url, params, cookies, this.config);
    } catch (error) {
      console.error('Error de búsqueda:', error);
      throw error;
    }
  }

  async searchAllPages(params = {}, cookies = [], maxPages = 10, paginationHandler = null) {
    const startTime = Date.now();
    const timestamp = () => new Date().toISOString();
    const formatElapsedTime = (start) => {
      const elapsed = Date.now() - start;
      if (elapsed < 1000) return `${elapsed}ms`;
      if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
      return `${(elapsed/60000).toFixed(2)}min`;
    };

    console.log(`[${timestamp()}] 🔍 Starting searchAllPages with maxPages=${maxPages}`);
    
    // Check if scraper is initialized
    if (!this.initialized) {
      console.log(`[${timestamp()}] ⚠️ Scraper not initialized, calling initialize()`);
      await this.initialize();
    }

    try {
      console.log(`[${timestamp()}] 📄 Fetching first page with params: ${JSON.stringify(params)}`);
      const firstPageStartTime = Date.now();
      
      // Fetch first page
      const firstPageResults = await this.search(params, cookies);
      
      const firstPageElapsed = Date.now() - firstPageStartTime;
      console.log(`[${timestamp()}] ✅ First page fetched in ${formatElapsedTime(firstPageStartTime)} (${firstPageElapsed}ms)`);
      
      // Check if we have valid results
      if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
        console.log(`[${timestamp()}] ⚠️ No valid results found on first page`);
        return firstPageResults; // Return whatever we got
      }
      
      const totalHits = firstPageResults.results[0].meta?.totalHits || 0;
      const hitsPerPage = firstPageResults.results[0].meta?.hitsPerPage || 96;
      const estimatedPages = Math.ceil(totalHits / hitsPerPage);
      
      console.log(`[${timestamp()}] 📊 Found ${totalHits} total hits, ${hitsPerPage} per page (estimated ${estimatedPages} pages)`);
      console.log(`[${timestamp()}] 🚀 Starting pagination process (max ${maxPages} pages)`);
      
      // If maxPages is 1 or there's only one page, return first page results
      if (maxPages === 1 || estimatedPages <= 1) {
        console.log(`[${timestamp()}] ℹ️ Only fetching first page (maxPages=${maxPages}, estimatedPages=${estimatedPages})`);
        return firstPageResults;
      }

      // Use custom pagination handler if provided, or the default one
      const paginationFunc = paginationHandler || handlePagination;
      
      const paginationStartTime = Date.now();
      console.log(`[${timestamp()}] 🔄 Starting pagination handler (${paginationHandler ? 'custom' : 'default'})`);
      
      // Handle pagination
      const results = await paginationFunc(
        this.browser,
        params,
        firstPageResults,
        cookies,
        maxPages,
        this.config
      );
      
      const paginationElapsed = Date.now() - paginationStartTime;
      console.log(`[${timestamp()}] ✅ Pagination completed in ${formatElapsedTime(paginationStartTime)} (${paginationElapsed}ms)`);
      
      const totalElapsed = Date.now() - startTime;
      console.log(`[${timestamp()}] 🏁 searchAllPages completed in ${formatElapsedTime(startTime)} (${totalElapsed}ms)`);
      
      return results;
    } catch (error) {
      console.error(`[${timestamp()}] ❌ Error in searchAllPages: ${error.message}`);
      console.error(error.stack);
      throw error;
    }
  }
}

module.exports = InvaluableScraper; 