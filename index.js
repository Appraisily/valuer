// run `node index.js` in the terminal

const express = require('express');
const { scrapeCategory, CONFIG } = require('./src/examples/invaluable-category-scraper');
const BrowserManager = require('./src/scrapers/invaluable/browser');
const { buildSearchParams } = require('./src/scrapers/invaluable/utils');
const { handleFirstPage } = require('./src/scrapers/invaluable/pagination');

const app = express();
const port = process.env.PORT || 8080;

// For parsing application/json
app.use(express.json());

// Keep track of running scraper jobs
const activeJobs = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Invaluable Scraper API is running',
    activeJobs: Array.from(activeJobs.keys())
  });
});

// API to get default configuration
app.get('/api/config', (req, res) => {
  res.json({
    currentConfig: CONFIG,
    activeJobs: Array.from(activeJobs.keys())
  });
});

// The previously working search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const maxPages = req.query.maxPages ? parseInt(req.query.maxPages) : 3;
    const fetchAllPages = req.query.fetchAllPages === 'true';
    
    console.log(`Search request for query: ${req.query.query}, maxPages: ${maxPages}, fetchAllPages: ${fetchAllPages}`);
    
    // Initialize browser
    const browser = new BrowserManager({
      headless: true,
      // Don't use userDataDir in Cloud Run
      userDataDir: process.env.K_SERVICE ? null : './temp/chrome-data'
    });
    
    try {
      await browser.initialize();
      console.log('Browser initialized for search');
      
      // Build search parameters from the request query
      const searchParams = buildSearchParams(req.query);
      
      // Get first page results
      console.log(`Getting search results for: ${JSON.stringify(searchParams)}`);
      const { results, initialCookies } = await handleFirstPage(browser, searchParams);
      
      if (!results) {
        throw new Error('Failed to get search results');
      }
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        parameters: req.query,
        data: results
      });
      
    } catch (error) {
      console.error('Error during search:', error);
      res.status(500).json({
        success: false,
        message: 'Search failed',
        error: error.message
      });
    } finally {
      // Always close the browser
      if (browser) {
        await browser.close();
        console.log('Browser closed after search');
      }
    }
  } catch (error) {
    console.error('Error in search endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// API to start a scraper job
app.post('/api/scraper/start', async (req, res) => {
  try {
    const jobId = new Date().toISOString();
    
    // Get configuration from request or use defaults
    const config = {
      ...CONFIG,
      ...req.body,
      // Default to 3 pages for safety as requested
      maxPages: req.body.maxPages || 3,
      // Force headless true in Cloud Run
      headless: true,
      // Don't use userDataDir in Cloud Run
      userDataDir: process.env.K_SERVICE ? null : CONFIG.userDataDir
    };
    
    console.log(`Starting job ${jobId} with config:`, config);
    
    // Store job info
    activeJobs.set(jobId, {
      status: 'running',
      startTime: new Date(),
      config
    });
    
    // Return immediately with job ID
    res.json({
      success: true,
      message: 'Scraper job started',
      jobId,
      config
    });
    
    // Run the scraper in the background
    scrapeCategory(config)
      .then(stats => {
        activeJobs.set(jobId, {
          status: 'completed',
          startTime: activeJobs.get(jobId).startTime,
          endTime: new Date(),
          config,
          stats
        });
        
        console.log(`Job ${jobId} completed successfully`);
      })
      .catch(error => {
        activeJobs.set(jobId, {
          status: 'failed',
          startTime: activeJobs.get(jobId).startTime,
          endTime: new Date(),
          config,
          error: error.message
        });
        
        console.error(`Job ${jobId} failed:`, error);
      });
      
  } catch (error) {
    console.error('Error starting scraper job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start scraper',
      error: error.message
    });
  }
});

// API to get job status
app.get('/api/scraper/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!activeJobs.has(jobId)) {
    return res.status(404).json({
      success: false,
      message: 'Job not found'
    });
  }
  
  res.json({
    success: true,
    job: activeJobs.get(jobId)
  });
});

// API to list all jobs
app.get('/api/scraper/jobs', (req, res) => {
  const jobs = {};
  
  for (const [jobId, jobInfo] of activeJobs.entries()) {
    jobs[jobId] = jobInfo;
  }
  
  res.json({
    success: true,
    jobs
  });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Invaluable Scraper API running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/`);
  console.log(`Direct search: http://localhost:${port}/api/search?query=furniture&maxPages=3`);
  console.log(`Start a scraper job: POST http://localhost:${port}/api/scraper/start`);
});
