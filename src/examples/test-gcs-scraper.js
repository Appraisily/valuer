/**
 * Test script for Invaluable scraper with GCS integration
 * Updated to use the UnifiedScraper
 * Limited to configurable pages for testing
 */
const path = require('path');
const UnifiedScraper = require('../scrapers/invaluable/unified-scraper');

// Test configuration - LIMITED TO FEW PAGES FOR TESTING
const CONFIG = {
  // Scraping parameters
  category: 'furniture',    // Default test category
  query: '',                // Default empty, can be provided via CLI
  maxPages: 3,              // Default: 3 pages for testing
  
  // Browser settings
  userDataDir: path.join(__dirname, '../../temp/chrome-data'),
  headless: true,           // Run headless for testing
  
  // Storage settings
  gcsEnabled: true,
  gcsBucket: 'invaluable-data',
  
  // Rate limiting - faster for testing
  baseDelay: 1500,
  maxDelay: 5000,
  minDelay: 1000,
  maxRetries: 2,
  
  // Debug settings
  debug: false
};

// Parse command line arguments
const parseArgs = () => {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value && value.startsWith('"') && value.endsWith('"')) {
        // Remove quotes if present
        args[key] = value.slice(1, -1);
      } else {
        args[key] = value || true;
      }
    }
  });
  return args;
};

const args = parseArgs();
console.log('Command line arguments:', args);

// Update config with command line arguments
if (args.query) {
  CONFIG.query = args.query;
  console.log(`Using query: "${CONFIG.query}"`);
}
if (args.supercategory) {
  CONFIG.supercategoryName = args.supercategory;
  console.log(`Using supercategory: "${CONFIG.supercategoryName}"`);
}
if (args.maxPages) {
  CONFIG.maxPages = parseInt(args.maxPages, 10) || CONFIG.maxPages;
  console.log(`Using maxPages: ${CONFIG.maxPages}`);
}
if (args.debug) {
  CONFIG.debug = args.debug === 'true';
  console.log(`Debug mode: ${CONFIG.debug}`);
}

/**
 * Run test scraper function
 */
async function testGcsScraper() {
  console.log('=== STARTING GCS INTEGRATION TEST ===');
  console.log(`Category: ${CONFIG.category}`);
  console.log(`Query: ${CONFIG.query || '(none)'}`);
  console.log(`Pages to fetch: ${CONFIG.maxPages}`);
  console.log(`GCS Bucket: ${CONFIG.gcsBucket}`);
  
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
    await scraper.initialize();
    console.log('Browser initialized');
    
    // Prepare search parameters
    const searchParams = {
      query: CONFIG.query || "",
      supercategoryName: CONFIG.supercategoryName || "",
      categoryName: CONFIG.category,
      subcategoryName: CONFIG.subcategoryName || "",
      priceResult: {
        min: CONFIG.priceMin || 250,
        max: CONFIG.priceMax || undefined
      },
      upcoming: false
    };
    
    console.log(`Search params: ${JSON.stringify(searchParams)}`);
    
    // Execute search with pagination
    console.log(`Searching with max ${CONFIG.maxPages} pages...`);
    const results = await scraper.search(searchParams, {
      maxPages: CONFIG.maxPages,
      saveToGcs: CONFIG.gcsEnabled,
      debug: CONFIG.debug
    });
    
    // Print summary
    if (results?.results?.results?.[0]?.hits) {
      const hits = results.results.results[0].hits;
      const meta = results.results.results[0].meta || {};
      
      console.log('\n===== TEST COMPLETE =====');
      console.log(`Category: ${CONFIG.category}`);
      console.log(`Query: ${CONFIG.query || '(none)'}`);
      console.log(`Total items found: ${hits.length}`);
      console.log(`Total hits reported: ${meta.totalHits || 'unknown'}`);
      
      if (results.stats) {
        console.log(`Pages scraped: ${results.stats.pagesScraped}`);
        console.log(`Processing time: ${results.stats.totalProcessingTime}ms`);
      }
      
      if (CONFIG.gcsEnabled) {
        console.log(`GCS data saved to: gs://${CONFIG.gcsBucket}/raw/${CONFIG.category}/`);
      }
      
      // Print sample
      console.log('\n--- SAMPLE ITEMS ---');
      hits.slice(0, 3).forEach((hit, i) => {
        console.log(`\n[${i+1}] ${hit.lotTitle}`);
        console.log(`    Price: ${hit.currencySymbol}${hit.priceResult} ${hit.currencyCode}`);
        console.log(`    Auction: ${hit.houseName}`);
        console.log(`    Date: ${hit.dateTimeLocal}`);
      });
    } else {
      console.log('\n❌ NO RESULTS FOUND');
      console.log('Results structure:', Object.keys(results || {}).join(', '));
    }
    
    console.log('\n=====================');
    return results;
  } catch (error) {
    console.error('Error during test:', error);
    throw error;
  } finally {
    // Always close the browser
    await scraper.close();
    console.log('Browser closed');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testGcsScraper()
    .then(() => {
      console.log('GCS integration test completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = testGcsScraper; 