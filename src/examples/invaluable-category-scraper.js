/**
 * Example Invaluable Category Scraper using the enhanced PaginationManager
 * 
 * This example demonstrates how to use the PaginationManager to scrape an entire category
 * with resumable pagination, progress tracking, rate limiting, and GCS storage.
 */
const path = require('path');
const fs = require('fs');
const BrowserManager = require('../scrapers/invaluable/browser');
const { buildSearchParams } = require('../scrapers/invaluable/utils');
const { handleFirstPage } = require('../scrapers/invaluable/pagination');
const PaginationManager = require('../scrapers/invaluable/pagination/pagination-manager');

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../../temp/chrome-data');
try {
  if (!fs.existsSync(path.join(__dirname, '../../temp'))) {
    fs.mkdirSync(path.join(__dirname, '../../temp'));
  }
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
} catch (err) {
  console.warn('Warning: Could not create temp directory:', err.message);
  // Continue anyway, as we can run headless without a user data dir
}

// Check if running in Cloud Run
const isCloudRun = process.env.K_SERVICE ? true : false;

// Configuration
const CONFIG = {
  // Scraping settings
  category: 'furniture',      // Category to scrape
  maxPages: 3,                // Maximum pages to scrape (reduced default to 3)
  startPage: 1,               // Page to start from (useful for resuming)
  
  // Browser settings
  userDataDir: isCloudRun ? null : tempDir,
  headless: true,             // Always headless in production
  
  // Storage settings
  gcsEnabled: true,           // Enable Google Cloud Storage
  gcsBucket: process.env.STORAGE_BUCKET || 'invaluable-html-archive',
  batchSize: 100,             // Number of pages per batch file
  
  // Rate limiting settings - reduced for better stability
  baseDelay: 1500,            // Base delay between requests
  maxDelay: 4000,             // Maximum delay
  minDelay: 1000,             // Minimum delay in ms
  maxRetries: 3,              // Maximum retries per page
  
  // Checkpoint settings
  checkpointInterval: 5,      // Save checkpoint every N pages
  checkpointDir: path.join(__dirname, '../../temp/checkpoints'),
};

// Print config without sensitive info
console.log('∅∅∅');
for (const [key, value] of Object.entries(CONFIG)) {
  if (typeof value !== 'object') {
    console.log(`${key}: ${value},`);
  } else if (value !== null) {
    console.log(`${key}: '${value}',`);
  }
}
console.log('∅∅∅');

/**
 * Main scraper function
 */
async function scrapeCategory(config = CONFIG) {
  // Use the passed config or default to CONFIG
  const mergedConfig = { ...CONFIG, ...config };
  
  console.log(`Starting Invaluable category scraper for: ${mergedConfig.category}`);
  console.log(`Will scrape up to ${mergedConfig.maxPages} pages with batch size of ${mergedConfig.batchSize}`);
  
  // Initialize browser
  const browser = new BrowserManager({
    userDataDir: mergedConfig.userDataDir,
    headless: mergedConfig.headless,
  });
  
  try {
    await browser.initialize();
    console.log('Browser initialized');
    
    // Build search parameters for the category
    const searchParams = buildSearchParams({ 
      category: mergedConfig.category,
      sortBy: 'item_title_asc',  // Consistent ordering helps with pagination
    });
    
    // Get the first page of results
    console.log(`Getting first page of results for ${mergedConfig.category}...`);
    const { results: firstPageResults, initialCookies } = await handleFirstPage(browser, searchParams);
    
    if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
      throw new Error('Failed to get first page results');
    }
    
    const totalHits = firstPageResults.results[0].meta?.totalHits || 0;
    console.log(`Found ${totalHits} total items in ${mergedConfig.category}`);
    
    // Initialize the pagination manager
    const paginationManager = new PaginationManager({
      category: mergedConfig.category,
      query: searchParams.keyword || mergedConfig.category,
      maxPages: mergedConfig.maxPages,
      startPage: mergedConfig.startPage,
      checkpointInterval: mergedConfig.checkpointInterval,
      checkpointDir: mergedConfig.checkpointDir,
      gcsEnabled: mergedConfig.gcsEnabled,
      gcsBucket: mergedConfig.gcsBucket,
      gcsCredentials: mergedConfig.gcsCredentials,
      batchSize: mergedConfig.batchSize,
      baseDelay: mergedConfig.baseDelay,
      maxDelay: mergedConfig.maxDelay,
      minDelay: mergedConfig.minDelay,
      maxRetries: mergedConfig.maxRetries,
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
    console.log(`Category: ${mergedConfig.category}`);
    console.log(`Total items collected: ${stats.totalItems}`);
    console.log(`Pages processed: ${stats.completedPages} of ${Math.min(Math.ceil(totalHits / 96), mergedConfig.maxPages)}`);
    console.log(`Failed pages: ${stats.failedPages}`);
    console.log(`Success rate: ${stats.successRate}`);
    console.log(`Total time: ${stats.runningTimeMin.toFixed(2)} minutes`);
    console.log(`Items per minute: ${stats.itemsPerMinute}`);
    
    if (mergedConfig.gcsEnabled) {
      console.log(`Batches saved to GCS: ${stats.batchesSaved}`);
      console.log(`GCS Bucket: gs://${mergedConfig.gcsBucket}/raw/${mergedConfig.category}/`);
    }
    
    return stats;
  } catch (error) {
    console.error('Error during scraping:', error);
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
  scrapeCategory()
    .then(() => {
      console.log('Scraping completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}

module.exports = {
  scrapeCategory,
  CONFIG
}; 