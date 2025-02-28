/**
 * Script to start a scraper job with specific parameters
 * Run with: node src/examples/scrape-command.js
 */
const http = require('http');

// Configuration
const config = {
  query: 'antique',
  category: 'furniture',
  maxPages: 5,
  saveToGcs: true,
  gcsBucket: 'invaluable-data',
  baseDelay: 2000,
  maxDelay: 30000,
  minDelay: 1000
};

/**
 * Start the scraper job
 */
async function startScraperJob() {
  try {
    console.log('Starting scraper job with config:', config);
    
    // Use native http module instead of fetch
    const postData = JSON.stringify(config);
    
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/api/scraper/start',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const responseData = JSON.parse(data);
            console.log('Response from server:', responseData);
            
            if (responseData.success) {
              console.log('\nScraper job started successfully!');
              console.log(`Query: ${config.query}`);
              console.log(`Category: ${config.category}`);
              console.log(`Pages to scrape: ${config.maxPages}`);
              console.log(`Data will be saved to GCS bucket: ${config.gcsBucket}`);
              console.log('\nThe server is now running in the background processing this request.');
              console.log('Check the server logs for progress updates.');
            } else {
              console.error('Failed to start scraper job:', responseData.message);
            }
            
            resolve(responseData);
          } catch (error) {
            console.error('Error parsing response:', error.message);
            reject(error);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('Error making request:', error.message);
        reject(error);
      });
      
      // Write the data to the request body
      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('Error starting scraper job:', error.message);
  }
}

// Execute the function
startScraperJob(); 