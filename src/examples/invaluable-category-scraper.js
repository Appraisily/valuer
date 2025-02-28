/**
 * Example Invaluable Category Scraper using the UnifiedScraper
 * 
 * This example demonstrates how to use the UnifiedScraper to scrape an entire category
 * with pagination, progress tracking, rate limiting, and GCS storage.
 */
const path = require('path');
const UnifiedScraper = require('../scrapers/invaluable/unified-scraper');

// Configuration
const CONFIG = {
  // Scraping parameters
  category: 'furniture',      // Category to scrape
  query: '',                  // Optional search query
  maxPages: 4000,             // Maximum pages to scrape
  
  // Browser settings
  userDataDir: path.join(__dirname, '../../temp/chrome-data'),
  headless: false,            // Set to true for production
  
  // Storage settings
  gcsEnabled: true,           // Enable Google Cloud Storage
  gcsBucket: 'invaluable-data',
  
  // Rate limiting settings
  baseDelay: 2000,            // Base delay between requests
  maxDelay: 30000,            // Maximum delay after retries
  minDelay: 1000,             // Minimum delay between requests
  maxRetries: 3,              // Maximum retry attempts
  
  // Debug settings
  debug: false                // Enable debug logging
};

// Parse command line arguments
const parseArgs = () => {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value === undefined) {
        args[key] = true;
      } else if (value.startsWith('"') && value.endsWith('"')) {
        args[key] = value.slice(1, -1);
      } else {
        args[key] = value;
      }
    }
  });
  return args;
};

// Apply command line arguments
const args = parseArgs();
console.log('Command line arguments:', args);

if (args.category) CONFIG.category = args.category;
if (args.query) CONFIG.query = args.query;
if (args.maxPages) CONFIG.maxPages = parseInt(args.maxPages, 10);
if (args.headless) CONFIG.headless = args.headless === 'true';
if (args.debug) CONFIG.debug = args.debug === 'true';

/**
 * Run the scraper for a specific category
 */
async function scrapeCategoryWithUnifiedScraper() {
  console.log('\n=== STARTING CATEGORY SCRAPER ===');
  console.log(`Category: ${CONFIG.category}`);
  console.log(`Query: ${CONFIG.query || '(none)'}`);
  console.log(`Pages to scrape: ${CONFIG.maxPages}`);
  console.log(`Headless mode: ${CONFIG.headless}`);
  console.log(`GCS storage: ${CONFIG.gcsEnabled ? 'Enabled' : 'Disabled'}`);
  if (CONFIG.gcsEnabled) {
    console.log(`GCS Bucket: ${CONFIG.gcsBucket}`);
  }
  
  // Initialize unified scraper
  const scraper = new UnifiedScraper({
    debug: CONFIG.debug,
    headless: CONFIG.headless,
    gcsBucket: CONFIG.gcsBucket,
    baseDelay: CONFIG.baseDelay,
    maxDelay: CONFIG.maxDelay,
    minDelay: CONFIG.minDelay,
    maxRetries: CONFIG.maxRetries,
    userDataDir: CONFIG.userDataDir
  });
  
  try {
    // Initialize browser
    console.log('\nInitializing browser...');
    await scraper.initialize();
    console.log('Browser initialized');
    
    // Prepare search parameters
    const searchParams = {
      categoryName: CONFIG.category,
      query: CONFIG.query || '',
      upcoming: false,
      priceResult: {
        min: 250,  // Default minimum price
        max: undefined
      }
    };
    
    console.log(`Search parameters: ${JSON.stringify(searchParams)}`);
    
    // Execute search with pagination
    console.log(`\nStarting search with pagination (max ${CONFIG.maxPages} pages)...`);
    const startTime = Date.now();
    
    const results = await scraper.search(searchParams, {
      maxPages: CONFIG.maxPages,
      saveToGcs: CONFIG.gcsEnabled,
      debug: CONFIG.debug
    });
    
    // Calculate elapsed time
    const elapsedTime = Date.now() - startTime;
    const elapsedMinutes = (elapsedTime / 60000).toFixed(2);
    
    // Print summary
    console.log('\n=== SCRAPING COMPLETE ===');
    console.log(`Category: ${CONFIG.category}`);
    console.log(`Query: ${CONFIG.query || '(none)'}`);
    
    if (results?.results?.results?.[0]?.hits) {
      const items = results.results.results[0].hits;
      const meta = results.results.results[0].meta || {};
      
      console.log(`Items found: ${items.length}`);
      console.log(`Total hits reported: ${meta.totalHits || 'unknown'}`);
      
      if (results.stats) {
        console.log(`Pages scraped: ${results.stats.pagesScraped}`);
        console.log(`Processing time: ${results.stats.totalProcessingTime}ms`);
      }
    } else {
      console.log('No results found or invalid response format');
    }
    
    console.log(`Total elapsed time: ${elapsedMinutes} minutes`);
    
    if (CONFIG.gcsEnabled) {
      console.log(`\nResults saved to GCS:`);
      console.log(`gs://${CONFIG.gcsBucket}/raw/${CONFIG.category}/`);
    }
    
    return results;
  } catch (error) {
    console.error('Error during scraping:', error);
    throw error;
  } finally {
    // Always close the browser
    console.log('\nClosing browser...');
    await scraper.close();
    console.log('Browser closed');
  }
}

// Run the scraper if this file is executed directly
if (require.main === module) {
  scrapeCategoryWithUnifiedScraper()
    .then(() => {
      console.log('Category scraping completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}

module.exports = scrapeCategoryWithUnifiedScraper; 