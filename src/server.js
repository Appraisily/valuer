const express = require('express');
const cors = require('cors');
const searchRouter = require('./routes/search');
const InvaluableScraper = require('./scrapers/invaluable');

const port = process.env.PORT || 8080;
const app = express();

const invaluableScraper = new InvaluableScraper();
let isInitializing = false;

// Graceful shutdown handler
async function shutdown() {
  console.log('Shutting down gracefully...');
  try {
    await invaluableScraper.close();
  } catch (error) {
    console.error('Error closing scraper:', error);
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Add health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Invaluable Search API is running' });
});

app.use(cors());
app.use(express.json());

async function initializeScraper() {
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isInitializing = true;
  console.log('Starting Invaluable scraper initialization...');

  try {
    await invaluableScraper.initialize();
    app.locals.invaluableScraper = invaluableScraper;
    console.log('Invaluable scraper initialized successfully');
  } catch (error) {
    console.error('Error initializing Invaluable scraper:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
}

// Initialize scraper and set up routes
async function startServer() {
  try {
    await initializeScraper();
    
    app.use('/api/search', searchRouter);
    
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server is now listening on port ${port}`);
    });

    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();