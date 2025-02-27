// run `node index.js` in the terminal

const express = require('express');
const { scrapeCategory, CONFIG } = require('./src/examples/invaluable-category-scraper');

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

// API to start a scraper job
app.post('/api/scraper/start', async (req, res) => {
  try {
    const jobId = new Date().toISOString();
    
    // Get configuration from request or use defaults
    const config = {
      ...CONFIG,
      ...req.body,
      // Default to 3 pages for safety as requested
      maxPages: req.body.maxPages || 3
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
  console.log(`Start a scraper job: POST http://localhost:${port}/api/scraper/start`);
});
