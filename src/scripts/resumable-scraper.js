/**
 * Resumable Scraper for Invaluable with Time-Limited Execution
 * 
 * This script is designed to be run by a cron job to scrape large categories
 * with thousands of pages by breaking the task into time-limited executions.
 * 
 * Features:
 * - Time-limited execution (stops gracefully before the specified runtime limit)
 * - Resumable from the last successful page
 * - Progress tracking and statistics
 * - Detailed logging
 * - Configurable batch size and rate limiting
 * - GCS storage integration
 * 
 * Usage:
 * node src/scripts/resumable-scraper.js --category=furniture --maxRuntime=55 --batchSize=100
 */
const path = require('path');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const BrowserManager = require('../scrapers/invaluable/browser');
const { buildSearchParams } = require('../scrapers/invaluable/utils');
const { handleFirstPage } = require('../scrapers/invaluable/pagination');
const PaginationManager = require('../scrapers/invaluable/pagination/pagination-manager');
const SearchStorageService = require('../utils/search-storage');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    acc[key] = value;
  }
  return acc;
}, {});

// Configuration with command line overrides
const CONFIG = {
  // Required parameters
  category: args.category || 'furniture',
  
  // Time constraints
  maxRuntime: parseInt(args.maxRuntime || '55', 10), // In minutes (default: 55 minutes)
  checkTimeInterval: parseInt(args.checkTimeInterval || '2', 10), // Check elapsed time every N pages
  
  // Scraping settings
  maxPages: parseInt(args.maxPages || '1781', 10), // Maximum pages for the entire category
  batchSize: parseInt(args.batchSize || '50', 10), // Pages to process per batch
  
  // Storage settings
  gcsEnabled: args.gcsEnabled !== 'false', // Default to true
  gcsBucket: process.env.STORAGE_BUCKET || args.gcsBucket || 'invaluable-html-archive',
  gcsPathPrefix: args.gcsPathPrefix || 'invaluable-data',
  
  // Rate limiting settings
  baseDelay: parseInt(args.baseDelay || '2000', 10), // Base delay between requests in ms
  maxDelay: parseInt(args.maxDelay || '15000', 10), // Maximum delay in ms
  minDelay: parseInt(args.minDelay || '1000', 10), // Minimum delay in ms
  
  // Browser settings
  headless: args.headless !== 'false', // Default to true for production
  
  // Logging settings
  logLevel: args.logLevel || 'info', // info, debug, error
  
  // Retry settings
  maxRetries: parseInt(args.maxRetries || '3', 10), // Maximum retries per page
  
  // Search parameters
  searchParams: {
    // Default search parameters, can be overridden by command line args
    sort: args.sort || 'auctionDateAsc',
    upcoming: args.upcoming === 'true' ? true : false,
  }
};

// Add any additional search parameters from command line
Object.keys(args).forEach(key => {
  if (!['category', 'maxRuntime', 'checkTimeInterval', 'maxPages', 'batchSize', 
        'gcsEnabled', 'gcsBucket', 'gcsPathPrefix', 'baseDelay', 'maxDelay', 
        'minDelay', 'headless', 'logLevel', 'maxRetries', 'sort', 'upcoming'].includes(key)) {
    CONFIG.searchParams[key] = args[key];
  }
});

// Progress tracking class
class ProgressTracker {
  constructor(options = {}) {
    this.category = options.category;
    this.totalPages = options.totalPages || 0;
    this.startTime = null;
    this.endTime = null;
    this.maxRuntime = options.maxRuntime || 55; // in minutes
    this.stats = {
      completedPages: new Set(),
      failedPages: new Set(),
      currentPage: options.startPage || 1,
      totalPagesProcessed: 0,
      successRate: 0,
      averageTimePerPage: 0,
      estimatedTimeRemaining: 0,
      runHistory: []
    };
    this.storage = options.storage;
    this.runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    this.progressFilePath = `${options.gcsPathPrefix}/${this.category}/scrape_progress.json`;
  }
  
  start() {
    this.startTime = new Date();
    console.log(`[${this.runId}] Starting scrape for category: ${this.category}`);
    console.log(`Maximum runtime: ${this.maxRuntime} minutes`);
  }
  
  end() {
    this.endTime = new Date();
    const runningTimeMin = (this.endTime - this.startTime) / 1000 / 60;
    
    // Add this run to history
    this.stats.runHistory.push({
      runId: this.runId,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      pagesProcessed: this.stats.completedPages.size,
      runningTimeMin
    });
    
    // Update success rate
    const totalAttempted = this.stats.completedPages.size + this.stats.failedPages.size;
    this.stats.successRate = totalAttempted > 0 
      ? (this.stats.completedPages.size / totalAttempted * 100).toFixed(2)
      : 0;
      
    // Update average time per page
    this.stats.averageTimePerPage = runningTimeMin > 0 && this.stats.completedPages.size > 0
      ? (runningTimeMin / this.stats.completedPages.size).toFixed(2)
      : 0;
      
    // Update estimated time remaining
    const remainingPages = this.totalPages - this.stats.currentPage;
    this.stats.estimatedTimeRemaining = remainingPages > 0 && this.stats.averageTimePerPage > 0
      ? (remainingPages * parseFloat(this.stats.averageTimePerPage)).toFixed(2)
      : 0;
      
    console.log(`[${this.runId}] Scrape completed in ${runningTimeMin.toFixed(2)} minutes`);
    console.log(`Pages processed: ${this.stats.completedPages.size}`);
    console.log(`Success rate: ${this.stats.successRate}%`);
    console.log(`Average time per page: ${this.stats.averageTimePerPage} minutes`);
    if (remainingPages > 0) {
      console.log(`Estimated time for remaining ${remainingPages} pages: ${this.stats.estimatedTimeRemaining} minutes`);
      console.log(`Progress: ${this.stats.currentPage}/${this.totalPages} (${(this.stats.currentPage / this.totalPages * 100).toFixed(2)}%)`);
    } else {
      console.log(`Scrape complete! All ${this.totalPages} pages processed.`);
    }
  }
  
  recordPageSuccess(pageNum) {
    this.stats.completedPages.add(pageNum);
    this.stats.currentPage = Math.max(this.stats.currentPage, pageNum + 1);
    this.stats.totalPagesProcessed = this.stats.completedPages.size;
  }
  
  recordPageFailure(pageNum) {
    this.stats.failedPages.add(pageNum);
  }
  
  shouldContinue() {
    // Check if we've reached the time limit
    const elapsedMinutes = (new Date() - this.startTime) / 1000 / 60;
    return elapsedMinutes < this.maxRuntime;
  }
  
  getElapsedMinutes() {
    return (new Date() - this.startTime) / 1000 / 60;
  }
  
  getRemainingMinutes() {
    return this.maxRuntime - this.getElapsedMinutes();
  }
  
  isCompleted() {
    return this.stats.currentPage > this.totalPages;
  }
  
  // Load progress data from GCS
  async loadProgress() {
    if (!this.storage) {
      console.log('Storage not configured, starting fresh');
      return false;
    }
    
    try {
      const bucket = this.storage.bucket;
      const file = bucket.file(this.progressFilePath);
      const [exists] = await file.exists();
      
      if (!exists) {
        console.log('No existing progress file found, starting fresh');
        return false;
      }
      
      console.log(`Loading progress from ${this.progressFilePath}`);
      const [content] = await file.download();
      const progressData = JSON.parse(content.toString());
      
      // Restore state
      this.totalPages = progressData.totalPages || this.totalPages;
      this.stats.currentPage = progressData.nextBatchStart || 1;
      this.stats.completedPages = new Set(progressData.completedPages || []);
      this.stats.failedPages = new Set(progressData.failedPages || []);
      this.stats.totalPagesProcessed = this.stats.completedPages.size;
      this.stats.runHistory = progressData.runHistory || [];
      
      console.log(`Loaded progress: resuming from page ${this.stats.currentPage}`);
      console.log(`Already completed: ${this.stats.completedPages.size} pages`);
      console.log(`Failed pages: ${this.stats.failedPages.size} pages`);
      
      return true;
    } catch (error) {
      console.error(`Error loading progress: ${error.message}`);
      return false;
    }
  }
  
  // Save progress data to GCS
  async saveProgress() {
    if (!this.storage) {
      console.log('Storage not configured, skipping progress save');
      return false;
    }
    
    try {
      const progressData = {
        category: this.category,
        totalPages: this.totalPages,
        lastUpdated: new Date().toISOString(),
        status: this.isCompleted() ? 'completed' : 'in_progress',
        completedPages: Array.from(this.stats.completedPages),
        failedPages: Array.from(this.stats.failedPages),
        nextBatchStart: this.stats.currentPage,
        statistics: {
          totalPagesProcessed: this.stats.totalPagesProcessed,
          successRate: this.stats.successRate,
          averageTimePerPage: this.stats.averageTimePerPage,
          estimatedTimeRemaining: this.stats.estimatedTimeRemaining
        },
        runHistory: this.stats.runHistory
      };
      
      const bucket = this.storage.bucket;
      const file = bucket.file(this.progressFilePath);
      
      await file.save(JSON.stringify(progressData, null, 2), {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'private, max-age=0',
        },
      });
      
      console.log(`Progress saved to ${this.progressFilePath}`);
      return true;
    } catch (error) {
      console.error(`Error saving progress: ${error.message}`);
      return false;
    }
  }
}

/**
 * Main function to run the resumable scraper
 */
async function runResumableScraper() {
  console.log('=== INVALUABLE RESUMABLE SCRAPER ===');
  console.log(`Category: ${CONFIG.category}`);
  console.log(`Max runtime: ${CONFIG.maxRuntime} minutes`);
  console.log(`Batch size: ${CONFIG.batchSize} pages`);
  console.log(`Storage: ${CONFIG.gcsEnabled ? 'GCS enabled' : 'GCS disabled'}`);
  console.log(`Bucket: ${CONFIG.gcsBucket}`);
  
  // Initialize storage services
  const storage = new Storage();
  const bucket = storage.bucket(CONFIG.gcsBucket);
  const searchStorage = new SearchStorageService({ bucketName: CONFIG.gcsBucket });
  
  // Initialize progress tracker
  const progressTracker = new ProgressTracker({
    category: CONFIG.category,
    maxRuntime: CONFIG.maxRuntime,
    storage: CONFIG.gcsEnabled ? { bucket } : null,
    gcsPathPrefix: CONFIG.gcsPathPrefix
  });
  
  // Load existing progress if available
  await progressTracker.loadProgress();
  
  // Initialize browser
  const browser = new BrowserManager({
    headless: CONFIG.headless
  });
  
  try {
    progressTracker.start();
    
    await browser.init();
    console.log('Browser initialized');
    
    // Build search parameters for the category
    const searchParams = buildSearchParams({ 
      query: CONFIG.category,
      ...CONFIG.searchParams
    });
    
    console.log('Search parameters:', searchParams);
    
    // Get the first page of results to determine total pages
    console.log(`Getting first page of results for ${CONFIG.category}...`);
    const { results: firstPageResults, initialCookies } = await handleFirstPage(browser, searchParams);
    
    if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0]?.hits) {
      throw new Error('Failed to get first page results');
    }
    
    // Extract pagination metadata
    let totalItems = 0;
    let totalPages = 0;
    let itemsPerPage = 96; // Default for Invaluable
    
    if (firstPageResults.results?.[0]?.meta?.totalHits) {
      totalItems = firstPageResults.results[0].meta.totalHits;
      itemsPerPage = firstPageResults.results[0].meta.hitsPerPage || itemsPerPage;
    } else if (firstPageResults.nbHits) {
      totalItems = firstPageResults.nbHits;
      itemsPerPage = firstPageResults.hitsPerPage || itemsPerPage;
    }
    
    // Calculate total pages
    totalPages = Math.ceil(totalItems / itemsPerPage);
    totalPages = Math.min(totalPages, CONFIG.maxPages); // Cap at maximum pages
    
    console.log(`Found ${totalItems} total items in ${totalPages} pages`);
    
    // Update progress tracker with total pages
    progressTracker.totalPages = totalPages;
    
    // Save the first page if it hasn't been saved yet
    if (!progressTracker.stats.completedPages.has(1)) {
      try {
        console.log(`Saving page 1 results to GCS for category: ${CONFIG.category}`);
        await searchStorage.savePageResults(CONFIG.category, 1, firstPageResults);
        progressTracker.recordPageSuccess(1);
        console.log(`Saved page 1 results to GCS`);
      } catch (error) {
        console.error(`Error saving page 1 results: ${error.message}`);
        progressTracker.recordPageFailure(1);
      }
    }
    
    // If scrape is already completed, exit early
    if (progressTracker.isCompleted()) {
      console.log(`Scrape already completed for ${CONFIG.category} (${totalPages} pages)`);
      return;
    }
    
    // Process remaining pages
    let currentPage = progressTracker.stats.currentPage;
    console.log(`Starting processing from page ${currentPage}`);
    
    // Calculate how many pages we can process in this run
    // based on average time per page from history or a conservative estimate
    let pagesInThisRun;
    if (progressTracker.stats.averageTimePerPage > 0) {
      const avgTimePerPage = parseFloat(progressTracker.stats.averageTimePerPage);
      pagesInThisRun = Math.floor(CONFIG.maxRuntime / avgTimePerPage);
    } else {
      // Conservative estimate: 3 pages per minute (20 seconds per page)
      pagesInThisRun = CONFIG.maxRuntime * 3;
    }
    
    // Cap pages to process at batch size or remaining pages
    pagesInThisRun = Math.min(
      pagesInThisRun,
      CONFIG.batchSize,
      totalPages - currentPage + 1
    );
    
    console.log(`Planning to process up to ${pagesInThisRun} pages in this run`);
    
    // Process pages in batches
    const batchEndPage = currentPage + pagesInThisRun - 1;
    console.log(`Processing batch: pages ${currentPage} to ${batchEndPage}`);
    
    // Process each page individually
    for (let pageNum = currentPage; pageNum <= batchEndPage; pageNum++) {
      // Check if we're out of time
      if (!progressTracker.shouldContinue()) {
        console.log(`Time limit reached (${CONFIG.maxRuntime} minutes). Stopping gracefully.`);
        break;
      }
      
      // Skip already completed pages
      if (progressTracker.stats.completedPages.has(pageNum)) {
        console.log(`Page ${pageNum} already completed, skipping`);
        continue;
      }
      
      console.log(`Processing page ${pageNum} (${progressTracker.getElapsedMinutes().toFixed(2)} minutes elapsed)`);
      
      try {
        // Build pagination parameters for this page
        const paginationParams = {
          ...searchParams,
          page: pageNum
        };
        
        // Request page results
        const pageResults = await requestPageResults(
          browser.getPage(),
          paginationParams,
          pageNum,
          initialCookies
        );
        
        // Validate results
        if (!pageResults || !pageResults.results || !pageResults.results[0]?.hits) {
          throw new Error(`Invalid results for page ${pageNum}`);
        }
        
        // Save results to GCS
        console.log(`Saving page ${pageNum} results to GCS for category: ${CONFIG.category}`);
        await searchStorage.savePageResults(CONFIG.category, pageNum, pageResults);
        
        // Record success
        progressTracker.recordPageSuccess(pageNum);
        console.log(`Successfully processed page ${pageNum}`);
        
        // Apply rate limiting
        const delay = CONFIG.baseDelay + Math.random() * 1000;
        console.log(`Waiting ${delay}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } catch (error) {
        console.error(`Error processing page ${pageNum}: ${error.message}`);
        progressTracker.recordPageFailure(pageNum);
        
        // Apply exponential backoff
        const backoffDelay = Math.min(CONFIG.baseDelay * Math.pow(2, progressTracker.stats.failedPages.size % 5), CONFIG.maxDelay);
        console.log(`Backing off for ${backoffDelay}ms after error`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
      
      // Check time every few pages
      if (pageNum % CONFIG.checkTimeInterval === 0) {
        console.log(`Time check: ${progressTracker.getElapsedMinutes().toFixed(2)}/${CONFIG.maxRuntime} minutes elapsed`);
        
        // Save progress periodically
        await progressTracker.saveProgress();
      }
    }
    
    // Final status update
    progressTracker.end();
    
    // Save final progress
    await progressTracker.saveProgress();
    
    // Return stats
    return {
      category: CONFIG.category,
      pagesProcessed: progressTracker.stats.completedPages.size,
      failedPages: progressTracker.stats.failedPages.size,
      currentPage: progressTracker.stats.currentPage,
      totalPages,
      isCompleted: progressTracker.isCompleted(),
      runTime: progressTracker.getElapsedMinutes().toFixed(2)
    };
    
  } catch (error) {
    console.error('Error during scraping:', error);
    
    // Save progress even in case of error
    progressTracker.end();
    await progressTracker.saveProgress();
    
    throw error;
  } finally {
    // Always close the browser
    await browser.close();
    console.log('Browser closed');
  }
}

/**
 * Import the page request function from pagination module
 * Need to import manually since it's not directly exported
 */
let requestPageResults;
try {
  // First try to get it from pagination index
  const paginationModule = require('../scrapers/invaluable/pagination');
  requestPageResults = paginationModule.requestPageResults;
  
  // If not available directly, use the module.exports object
  if (!requestPageResults && typeof paginationModule === 'object') {
    Object.keys(paginationModule).forEach(key => {
      if (key === 'requestPageResults') {
        requestPageResults = paginationModule[key];
      }
    });
  }
  
  // If still not available, try to get it from the raw module
  if (!requestPageResults) {
    const rawModule = require('../scrapers/invaluable/pagination/index');
    requestPageResults = rawModule.requestPageResults;
  }
} catch (error) {
  console.error(`Error loading requestPageResults function: ${error.message}`);
  process.exit(1);
}

// Ensure we got the function
if (!requestPageResults) {
  console.error('Could not find requestPageResults function. Make sure it is exported from the pagination module.');
  process.exit(1);
}

/**
 * Run the scraper if this file is called directly
 */
if (require.main === module) {
  runResumableScraper()
    .then(result => {
      console.log('Scraping completed:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runResumableScraper,
  CONFIG
}; 