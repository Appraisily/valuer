/**
 * Direct Pagination Controller for Invaluable
 * 
 * Uses direct catResults API requests to paginate through all results
 * and save them to Google Cloud Storage
 */
const { handleFirstPageDirect, getPageDirect, saveToGcs, saveMetadataToGcs } = require('./direct-api');

/**
 * Process pagination using direct catResults API requests with GCS integration
 * 
 * @param {Object} browser - Browser manager instance
 * @param {Object} config - Configuration options
 * @param {Object} params - Search parameters
 * @returns {Promise<Object>} - Pagination results and statistics
 */
async function paginateWithCatResults(browser, config, params) {
  console.log(`Starting direct catResults pagination for category: ${config.category}`);
  
  // Initialize statistics tracking
  const stats = {
    startTime: new Date().toISOString(),
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalItems: 0,
    completedPages: [],
    failedPages: [],
    batchesSaved: 0
  };
  
  try {
    // Step 1: Get the first page results
    console.log('Getting first page results...');
    const { results: firstPageResults, initialCookies, navigationParams } = 
      await handleFirstPageDirect(browser, params);
    
    stats.totalRequests++;
    stats.successfulRequests++;
    
    // If first page fails, exit early
    if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
      throw new Error('Failed to get first page results');
    }
    
    // Initialize navigation state with cookies and parameters
    const navState = {
      ...navigationParams,
      cookies: initialCookies
    };
    
    // Calculate total pages
    const hitsPerPage = firstPageResults.results[0].meta?.hitsPerPage || 96;
    const totalHits = firstPageResults.results[0].meta?.totalHits || 0;
    const totalPages = Math.ceil(totalHits / hitsPerPage);
    const pagesToProcess = Math.min(totalPages, config.maxPages || 10);
    
    console.log(`Found ${totalHits} total items in ${totalPages} pages (processing up to ${pagesToProcess})`);
    
    // Update statistics with first page results
    stats.totalItems += firstPageResults.results[0].hits.length;
    stats.completedPages.push(1);
    
    // Initialize batch data
    let currentBatch = 1;
    let batchData = JSON.parse(JSON.stringify(firstPageResults));
    let batchStartPage = 1;
    let batchPages = 1;
    
    // Save first page to GCS if only 1 page exists and GCS is enabled
    if (pagesToProcess === 1 && config.saveToGcs) {
      await saveToGcs(
        config.gcsBucket, 
        config.category, 
        batchData, 
        currentBatch, 
        [batchStartPage, batchStartPage]
      );
      stats.batchesSaved++;
    }
    
    // Step 2: Process remaining pages
    for (let pageNum = 2; pageNum <= pagesToProcess; pageNum++) {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, config.baseDelay || 2000));
      
      // Get the current page results
      console.log(`\n----- Processing page ${pageNum} of ${pagesToProcess} -----`);
      stats.totalRequests++;
      
      try {
        const pageResults = await getPageDirect(browser, pageNum, params, navState);
        
        // Check if the results are valid
        if (!pageResults || !pageResults.results || !pageResults.results[0]?.hits?.length) {
          console.error(`Failed to get valid results for page ${pageNum}`);
          stats.failedRequests++;
          stats.failedPages.push(pageNum);
          continue;
        }
        
        // Add to statistics
        stats.successfulRequests++;
        stats.completedPages.push(pageNum);
        stats.totalItems += pageResults.results[0].hits.length;
        
        // Add to the current batch
        batchData.results[0].hits.push(...pageResults.results[0].hits);
        batchPages++;
        
        console.log(`Added page ${pageNum} to batch ${currentBatch}, now contains ${batchData.results[0].hits.length} items`);
        
        // Check if we need to save this batch and start a new one
        const batchSize = config.batchSize || 100;
        if (batchPages >= batchSize || pageNum === pagesToProcess) {
          if (config.saveToGcs) {
            // Save current batch
            console.log(`Saving batch ${currentBatch} with ${batchPages} pages...`);
            
            await saveToGcs(
              config.gcsBucket, 
              config.category, 
              batchData, 
              currentBatch, 
              [batchStartPage, batchStartPage + batchPages - 1]
            );
            
            stats.batchesSaved++;
            
            // If not the last page, prepare for next batch
            if (pageNum < pagesToProcess) {
              currentBatch++;
              batchStartPage = pageNum + 1;
              batchPages = 0;
              
              // Reset batch data with structure but no hits
              batchData = JSON.parse(JSON.stringify(firstPageResults));
              batchData.results[0].hits = [];
            }
          }
        }
        
      } catch (error) {
        console.error(`Error processing page ${pageNum}:`, error);
        stats.failedRequests++;
        stats.failedPages.push(pageNum);
      }
    }
    
    // Complete statistics
    stats.endTime = new Date().toISOString();
    stats.totalPages = pagesToProcess;
    stats.successRate = stats.successfulRequests / stats.totalRequests;
    stats.runningTimeMs = new Date(stats.endTime) - new Date(stats.startTime);
    stats.runningTimeMin = stats.runningTimeMs / 60000;
    
    // Save metadata if GCS is enabled
    if (config.saveToGcs) {
      await saveMetadataToGcs(config.gcsBucket, config.category, stats);
    }
    
    // Log completion summary
    console.log('\n===== DIRECT PAGINATION COMPLETE =====');
    console.log(`Category: ${config.category}`);
    console.log(`Total items collected: ${stats.totalItems}`);
    console.log(`Pages processed: ${stats.completedPages.length} of ${pagesToProcess}`);
    console.log(`Failed pages: ${stats.failedPages.length}`);
    console.log(`Success rate: ${(stats.successRate * 100).toFixed(2)}%`);
    console.log(`Total time: ${stats.runningTimeMin.toFixed(2)} minutes`);
    
    if (config.saveToGcs) {
      console.log(`GCS data path: gs://${config.gcsBucket}/raw/${config.category}/`);
      console.log(`Batches saved: ${stats.batchesSaved}`);
    }
    
    // Return results container and stats
    return {
      results: batchData,
      stats: stats
    };
    
  } catch (error) {
    console.error('Error in direct pagination:', error);
    
    // Complete statistics even on error
    stats.endTime = new Date().toISOString();
    stats.runningTimeMs = new Date(stats.endTime) - new Date(stats.startTime);
    stats.runningTimeMin = stats.runningTimeMs / 60000;
    stats.error = error.message;
    
    // Try to save error metadata if GCS is enabled
    if (config.saveToGcs) {
      try {
        await saveMetadataToGcs(config.gcsBucket, config.category, {
          ...stats,
          status: 'error',
          errorMessage: error.message
        });
      } catch (metaError) {
        console.error('Error saving error metadata:', metaError);
      }
    }
    
    throw error;
  }
}

module.exports = {
  paginateWithCatResults
}; 