/**
 * Example Invaluable Category Scraper using the enhanced PaginationManager
 * 
 * This example demonstrates how to use the PaginationManager to scrape an entire category
 * with resumable pagination, progress tracking, rate limiting, and GCS storage.
 */
const path = require('path');
const http = require('http');
const BrowserManager = require('../scrapers/invaluable/browser');
const { buildSearchParams } = require('../scrapers/invaluable/utils');
const { handleFirstPage } = require('../scrapers/invaluable/pagination');
const PaginationManager = require('../scrapers/invaluable/pagination/pagination-manager');

// Configuration
const CONFIG = {
  // Scraping settings
  category: 'furniture',      // Category to scrape
  maxPages: 4000,             // Maximum pages to scrape
  startPage: 1,               // Page to start from (useful for resuming)
  
  // Browser settings
  userDataDir: path.join(__dirname, '../../temp/chrome-data'),
  headless: true,            // Set to true for production and container environments
  
  // Storage settings
  gcsEnabled: true,           // Enable Google Cloud Storage
  gcsBucket: 'invaluable-data',
  batchSize: 100,             // Number of pages per batch file
  // If using explicit credentials file or object (optional)
  // gcsCredentials: require('../path/to/credentials.json'), 
  
  // Rate limiting settings
  baseDelay: 2000,            // Base delay between requests in ms
  maxDelay: 30000,            // Maximum delay in ms
  minDelay: 1000,             // Minimum delay in ms
  maxRetries: 3,              // Maximum retries per page
  
  // Checkpoint settings
  checkpointInterval: 5,      // Save checkpoint every N pages
  checkpointDir: path.join(__dirname, '../../temp/checkpoints'),
};

// Estado global para el servidor HTTP
let scrapingStatus = {
  running: false,
  category: '',
  currentPage: 0,
  totalPages: 0,
  itemsCollected: 0,
  startTime: null,
  error: null
};

/**
 * Inicia un servidor HTTP simple para Cloud Run
 * Necesario para que Cloud Run considere el servicio como "saludable"
 */
function startHttpServer() {
  const port = process.env.PORT || 8080;
  
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    
    if (req.url === '/health' || req.url === '/') {
      // Endpoint de salud para Cloud Run
      res.statusCode = 200;
      res.end(JSON.stringify({
        status: 'ok',
        message: 'Invaluable Scraper is running',
        scraping: scrapingStatus.running,
        stats: scrapingStatus
      }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  server.listen(port, () => {
    console.log(`HTTP server listening on port ${port}`);
  });
  
  return server;
}

/**
 * Main scraper function
 */
async function scrapeCategory() {
  console.log(`Starting Invaluable category scraper for: ${CONFIG.category}`);
  console.log(`Will scrape up to ${CONFIG.maxPages} pages with batch size of ${CONFIG.batchSize}`);
  
  // Actualizar estado
  scrapingStatus.running = true;
  scrapingStatus.category = CONFIG.category;
  scrapingStatus.startTime = new Date().toISOString();
  
  // Initialize browser with configuración optimizada para contenedor
  const browser = new BrowserManager({
    userDataDir: CONFIG.userDataDir,
    headless: CONFIG.headless,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ]
  });
  
  try {
    await browser.initialize();
    console.log('Browser initialized');
    
    // Build search parameters for the category
    const searchParams = buildSearchParams({ 
      category: CONFIG.category,
      sortBy: 'item_title_asc',  // Consistent ordering helps with pagination
    });
    
    // Get the first page of results
    console.log(`Getting first page of results for ${CONFIG.category}...`);
    const { results: firstPageResults, initialCookies } = await handleFirstPage(browser, searchParams);
    
    if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
      const errorMsg = 'Failed to get first page results';
      scrapingStatus.error = errorMsg;
      throw new Error(errorMsg);
    }
    
    const totalHits = firstPageResults.results[0].meta?.totalHits || 0;
    const totalPages = Math.ceil(totalHits / 96);
    console.log(`Found ${totalHits} total items in ${CONFIG.category}`);
    
    // Actualizar estado
    scrapingStatus.totalPages = Math.min(totalPages, CONFIG.maxPages);
    scrapingStatus.currentPage = 1;
    scrapingStatus.itemsCollected = firstPageResults.results[0].hits.length;
    
    // Initialize the pagination manager
    const paginationManager = new PaginationManager({
      category: CONFIG.category,
      query: searchParams.keyword || CONFIG.category,
      maxPages: CONFIG.maxPages,
      startPage: CONFIG.startPage,
      checkpointInterval: CONFIG.checkpointInterval,
      checkpointDir: CONFIG.checkpointDir,
      gcsEnabled: CONFIG.gcsEnabled,
      gcsBucket: CONFIG.gcsBucket,
      gcsCredentials: CONFIG.gcsCredentials,
      batchSize: CONFIG.batchSize,
      baseDelay: CONFIG.baseDelay,
      maxDelay: CONFIG.maxDelay,
      minDelay: CONFIG.minDelay,
      maxRetries: CONFIG.maxRetries,
      onProgress: (stats) => {
        // Actualizar estado con el progreso
        scrapingStatus.currentPage = stats.completedPages;
        scrapingStatus.itemsCollected = stats.totalItems;
      }
    });
    
    // Process pagination
    console.log('Starting pagination process...');
    const allResults = await paginationManager.processPagination(
      browser,
      searchParams,
      firstPageResults,
      initialCookies
    );
    
    // Print summary statistics
    const stats = paginationManager.getStats();
    console.log('\n===== SCRAPING COMPLETE =====');
    console.log(`Category: ${CONFIG.category}`);
    console.log(`Total items collected: ${stats.totalItems}`);
    console.log(`Pages processed: ${stats.completedPages} of ${Math.min(Math.ceil(totalHits / 96), CONFIG.maxPages)}`);
    console.log(`Failed pages: ${stats.failedPages}`);
    console.log(`Success rate: ${stats.successRate}`);
    console.log(`Total time: ${stats.runningTimeMin.toFixed(2)} minutes`);
    console.log(`Items per minute: ${stats.itemsPerMinute}`);
    
    if (CONFIG.gcsEnabled) {
      console.log(`Batches saved to GCS: ${stats.batchesSaved}`);
      console.log(`GCS Bucket: gs://${CONFIG.gcsBucket}/raw/${CONFIG.category}/`);
    }
    
    // Actualizar estado final
    scrapingStatus.running = false;
    scrapingStatus.finishedAt = new Date().toISOString();
    scrapingStatus.stats = stats;
    
    return stats;
  } catch (error) {
    console.error('Error during scraping:', error);
    scrapingStatus.running = false;
    scrapingStatus.error = error.message;
    throw error;
  } finally {
    // Always close the browser
    await browser.close();
    console.log('Browser closed');
  }
}

/**
 * Run the scraper if this file is called directly
 */
if (require.main === module) {
  // Iniciar el servidor HTTP primero (necesario para Cloud Run)
  const server = startHttpServer();
  
  scrapeCategory()
    .then(() => {
      console.log('Scraping completed successfully');
      // En producción, puede ser mejor mantener el proceso en ejecución
      // Si estamos en desarrollo, podemos salir
      if (process.env.NODE_ENV === 'development') {
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      // En producción, puede ser mejor mantener el proceso en ejecución
      // Si estamos en desarrollo, podemos salir con error
      if (process.env.NODE_ENV === 'development') {
        process.exit(1);
      }
    });
}

module.exports = {
  scrapeCategory,
  CONFIG
}; 