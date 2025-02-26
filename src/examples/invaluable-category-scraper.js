/**
 * Example Invaluable Category Scraper using the enhanced PaginationManager
 * 
 * This example demonstrates how to use the PaginationManager to scrape an entire category
 * with resumable pagination, progress tracking, rate limiting, and GCS storage.
 */
const path = require('path');
const http = require('http');
const url = require('url');
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

// Indicador de si el scraper está en ejecución actualmente
let scrapeInProgress = false;

/**
 * Inicia un servidor HTTP simple para Cloud Run
 * Necesario para que Cloud Run considere el servicio como "saludable"
 */
function startHttpServer() {
  const port = process.env.PORT || 8080;
  
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    res.setHeader('Content-Type', 'application/json');
    
    // Endpoint de salud para Cloud Run
    if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/') {
      res.statusCode = 200;
      res.end(JSON.stringify({
        status: 'ok',
        message: 'Invaluable Scraper is running',
        scraping: scrapingStatus.running,
        stats: scrapingStatus
      }));
    } 
    // Endpoint para iniciar el scraper con parámetros personalizados
    else if (parsedUrl.pathname === '/start' && req.method === 'POST') {
      if (scrapeInProgress) {
        res.statusCode = 409; // Conflict
        res.end(JSON.stringify({ 
          error: 'Scraper already running',
          stats: scrapingStatus
        }));
        return;
      }
      
      // Leer datos del cuerpo POST
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        let params = {};
        try {
          params = JSON.parse(body);
        } catch (e) {
          // Si no es JSON válido, intentar parsear como query params
          body.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
              params[key] = decodeURIComponent(value);
            }
          });
        }
        
        // Actualizar configuración con parámetros personalizados
        const customConfig = { ...CONFIG };
        
        if (params.category) customConfig.category = params.category;
        if (params.maxPages) customConfig.maxPages = parseInt(params.maxPages, 10);
        if (params.startPage) customConfig.startPage = parseInt(params.startPage, 10);
        
        // Iniciar el scraper con la configuración personalizada
        scrapeInProgress = true;
        scrapeCategory(customConfig)
          .then(() => {
            console.log('Scraping completed successfully');
            scrapeInProgress = false;
          })
          .catch(error => {
            console.error('Scraping failed:', error);
            scrapeInProgress = false;
          });
        
        res.statusCode = 202; // Accepted
        res.end(JSON.stringify({ 
          status: 'started',
          message: 'Scraper started successfully',
          config: customConfig
        }));
      });
    } 
    // Endpoint para detener el scraper
    else if (parsedUrl.pathname === '/stop' && req.method === 'POST') {
      // Aquí se podría implementar la lógica para detener el scraper
      // Esto requeriría modificar el scrapeCategory para que verifique alguna señal de detención
      res.statusCode = 501; // Not Implemented
      res.end(JSON.stringify({ error: 'Stop functionality not implemented yet' }));
    }
    else {
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
 * @param {Object} config - Configuración personalizada para el scraper
 */
async function scrapeCategory(config = CONFIG) {
  console.log(`Starting Invaluable category scraper for: ${config.category}`);
  console.log(`Will scrape up to ${config.maxPages} pages with batch size of ${config.batchSize}`);
  
  // Actualizar estado
  scrapingStatus.running = true;
  scrapingStatus.category = config.category;
  scrapingStatus.startTime = new Date().toISOString();
  
  // Initialize browser with configuración optimizada para contenedor
  const browser = new BrowserManager({
    userDataDir: config.userDataDir,
    headless: config.headless,
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
      category: config.category,
      sortBy: 'item_title_asc',  // Consistent ordering helps with pagination
    });
    
    // Get the first page of results
    console.log(`Getting first page of results for ${config.category}...`);
    const { results: firstPageResults, initialCookies } = await handleFirstPage(browser, searchParams);
    
    if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
      const errorMsg = 'Failed to get first page results';
      scrapingStatus.error = errorMsg;
      throw new Error(errorMsg);
    }
    
    const totalHits = firstPageResults.results[0].meta?.totalHits || 0;
    const totalPages = Math.ceil(totalHits / 96);
    console.log(`Found ${totalHits} total items in ${config.category}`);
    
    // Actualizar estado
    scrapingStatus.totalPages = Math.min(totalPages, config.maxPages);
    scrapingStatus.currentPage = 1;
    scrapingStatus.itemsCollected = firstPageResults.results[0].hits.length;
    
    // Initialize the pagination manager
    const paginationManager = new PaginationManager({
      category: config.category,
      query: searchParams.keyword || config.category,
      maxPages: config.maxPages,
      startPage: config.startPage,
      checkpointInterval: config.checkpointInterval,
      checkpointDir: config.checkpointDir,
      gcsEnabled: config.gcsEnabled,
      gcsBucket: config.gcsBucket,
      gcsCredentials: config.gcsCredentials,
      batchSize: config.batchSize,
      baseDelay: config.baseDelay,
      maxDelay: config.maxDelay,
      minDelay: config.minDelay,
      maxRetries: config.maxRetries,
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
    console.log(`Category: ${config.category}`);
    console.log(`Total items collected: ${stats.totalItems}`);
    console.log(`Pages processed: ${stats.completedPages} of ${Math.min(Math.ceil(totalHits / 96), config.maxPages)}`);
    console.log(`Failed pages: ${stats.failedPages}`);
    console.log(`Success rate: ${stats.successRate}`);
    console.log(`Total time: ${stats.runningTimeMin.toFixed(2)} minutes`);
    console.log(`Items per minute: ${stats.itemsPerMinute}`);
    
    if (config.gcsEnabled) {
      console.log(`Batches saved to GCS: ${stats.batchesSaved}`);
      console.log(`GCS Bucket: gs://${config.gcsBucket}/raw/${config.category}/`);
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
  
  // Si NODE_ENV no es producción, iniciar automáticamente el scraper
  if (process.env.NODE_ENV !== 'production') {
    scrapeCategory()
      .then(() => {
        console.log('Scraping completed successfully');
        // En desarrollo, podemos salir
        if (process.env.NODE_ENV === 'development') {
          process.exit(0);
        }
      })
      .catch(error => {
        console.error('Scraping failed:', error);
        // En desarrollo, podemos salir con error
        if (process.env.NODE_ENV === 'development') {
          process.exit(1);
        }
      });
  } else {
    console.log('Running in production mode. Use /start endpoint to start scraping.');
  }
}

module.exports = {
  scrapeCategory,
  CONFIG
}; 