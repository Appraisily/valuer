/**
 * Unified Scraper Example
 * 
 * This example demonstrates how to use the UnifiedScraper to obtain auction data
 * directly from Invaluable with proper request interception and pagination.
 */
require('dotenv').config();
const UnifiedScraper = require('../scrapers/invaluable/unified-scraper');

// Configure enhanced debugging
const DEBUG = process.env.DEBUG === 'true';
const SAVE_TO_GCS = process.env.SAVE_TO_GCS === 'true';

/**
 * Run a search with the unified scraper
 * @param {Object} params - Search parameters
 * @param {Object} options - Search options
 */
async function runSearch(params, options) {
  const scraper = new UnifiedScraper({
    debug: true, // Enable debugging for this example
    headless: process.env.HEADLESS !== 'false',
    gcsBucket: process.env.GCS_BUCKET || 'invaluable-data'
  });

  console.log('='.repeat(80));
  console.log(`🔍 STARTING SEARCH: "${params.query}" in category "${params.supercategoryName || 'all'}"`);
  console.log(`📄 Max Pages: ${options.maxPages}, Save to GCS: ${options.saveToGcs}`);
  console.log('='.repeat(80));

  try {
    // Initialize the scraper
    console.log('Initializing scraper...');
    await scraper.initialize();

    // Start timing
    const startTime = Date.now();

    // Perform the search
    console.log(`Running search with params:`, JSON.stringify(params, null, 2));
    const results = await scraper.search(params, options);
    
    // Calculate elapsed time
    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

    // Display results summary
    if (results && results.results && results.results.results && results.results.results[0]?.hits) {
      const hits = results.results.results[0].hits;
      console.log('\n='.repeat(80));
      console.log(`✅ SEARCH COMPLETED in ${elapsedSeconds}s`);
      console.log(`📊 RESULTS: Found ${hits.length} items`);
      
      // Display metadata if available
      if (results.results.results[0].meta) {
        const meta = results.results.results[0].meta;
        console.log(`📈 METADATA: Total hits: ${meta.totalHits}, Page: ${meta.page}/${Math.ceil(meta.totalHits/meta.hitsPerPage)}`);
      }
      
      // Display stats from pagination if available
      if (results.stats) {
        console.log(`⏱️ STATS: Pages scraped: ${results.stats.pagesScraped}, Processing time: ${results.stats.totalProcessingTime}ms`);
      }

      // Print sample items
      console.log('\n📋 SAMPLE ITEMS:');
      hits.slice(0, 3).forEach((hit, index) => {
        console.log(`\n[${index + 1}] ${hit.lotTitle}`);
        console.log(`    Price: ${hit.currencySymbol}${hit.priceResult} ${hit.currencyCode}`);
        console.log(`    Auction: ${hit.houseName}`);
        console.log(`    Date: ${hit.dateTimeLocal}`);
        console.log(`    URL: ${hit.itemLink}`);
      });
      
      console.log('\n='.repeat(80));
    } else {
      console.log('\n❌ NO RESULTS FOUND or invalid response format');
      console.log('Raw results structure:', JSON.stringify(Object.keys(results), null, 2));
    }
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    if (DEBUG) {
      console.error(error.stack);
    }
  } finally {
    // Clean up
    console.log('\nClosing browser...');
    await scraper.close();
    console.log('Browser closed');
  }
}

/**
 * Main function
 */
async function main() {
  // Define search parameters
  const searchParams = {
    query: process.argv[2] || 'antique furniture',
    supercategoryName: process.argv[3] || 'Furniture',
    priceResult: {
      min: parseInt(process.argv[4] || '250', 10),
      max: parseInt(process.argv[5] || '0', 10) || undefined
    },
    upcoming: false
  };

  // Define search options
  const searchOptions = {
    maxPages: parseInt(process.argv[6] || '2', 10),
    saveToGcs: SAVE_TO_GCS,
    debug: DEBUG
  };

  await runSearch(searchParams, searchOptions);
}

// Execute the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 