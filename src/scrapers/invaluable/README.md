# Invaluable Scraper Module

This module provides a unified approach to scraping auction data from Invaluable.com. It handles browser automation, request interception, pagination, and data storage.

## Key Components

### UnifiedScraper

The main entry point for all scraping operations. It provides a consistent interface for initializing the browser, performing searches, and handling pagination.

```javascript
const UnifiedScraper = require('./scrapers/invaluable/unified-scraper');
// Or use the default export from the index
const InvaluableScraper = require('./scrapers/invaluable');

// Create a new scraper instance
const scraper = new UnifiedScraper({
  debug: true,                     // Enable detailed logging
  headless: true,                  // Run in headless mode
  gcsEnabled: true,                // Enable Google Cloud Storage
  gcsBucket: 'my-bucket-name',     // GCS bucket name
  baseDelay: 2000,                 // Base delay between requests
  maxDelay: 10000,                 // Max delay after failures
  minDelay: 1000,                  // Min delay between requests
  defaultPriceMin: 250             // Default minimum price
});

// Initialize the browser
await scraper.initialize();

// Perform a search
const results = await scraper.search({
  query: 'antique chair',
  supercategoryName: 'Furniture',
  sort: 'sale_date|desc'
}, {
  maxPages: 5,                     // Scrape up to 5 pages
  saveToGcs: true                  // Save results to GCS
});

// Close the browser when done
await scraper.close();
```

### BrowserManager

Manages the Puppeteer browser instance with enhanced configuration for reliability in cloud environments.

### Pagination

Handles the complex pagination logic, including request interception, session management, and data extraction.

## Features

- **Robust Browser Management**: Configured for reliability in cloud environments
- **Request Interception**: Intercepts API responses to extract data directly
- **Pagination Support**: Handles multi-page scraping with built-in retry logic
- **Rate Limiting**: Adaptive rate limiting to avoid being blocked
- **GCS Integration**: Optional storage of results in Google Cloud Storage
- **Resumable Scraping**: Can resume scraping from where it left off
- **Comprehensive Error Handling**: Retries and graceful recovery from errors

## Usage Examples

### Basic Search

```javascript
const scraper = new UnifiedScraper();
await scraper.initialize();

const results = await scraper.search({
  query: 'antique chair',
  supercategoryName: 'Furniture'
});

console.log(`Found ${results.results[0].hits.length} items`);
await scraper.close();
```

### Category Scraping with Pagination

```javascript
const scraper = new UnifiedScraper({
  gcsEnabled: true,
  gcsBucket: 'invaluable-data'
});

await scraper.initialize();

const results = await scraper.search({
  supercategoryName: 'Furniture',
  sort: 'sale_date|desc'
}, {
  maxPages: 100,    // Scrape up to 100 pages
  saveToGcs: true   // Save results to GCS
});

console.log(`Scraped ${results.stats.totalItems} items across ${results.stats.completedPages} pages`);
await scraper.close();
```

## Configuration Options

The UnifiedScraper accepts these configuration options:

| Option | Description | Default |
|--------|-------------|---------|
| headless | Run browser in headless mode | true |
| userDataDir | Directory for Chrome user data | null |
| gcsEnabled | Enable Google Cloud Storage | false |
| gcsBucket | GCS bucket name | 'invaluable-data' |
| baseDelay | Base delay between requests | 2000 (2s) |
| maxDelay | Maximum delay after failures | 10000 (10s) |
| minDelay | Minimum delay between requests | 1000 (1s) |
| maxRetries | Maximum retry attempts | 3 |
| defaultPriceMin | Default minimum price | 250 |
| debug | Enable detailed logging | false |

## Search Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| query | Search keyword | 'antique chair' |
| supercategoryName | Main category | 'Furniture' |
| categoryName | Subcategory | 'Chairs' |
| subcategoryName | Sub-subcategory | 'Armchairs' |
| sort | Sort order | 'sale_date\|desc' |
| priceResult | Price range | { min: 500, max: 5000 } |
| upcoming | Show upcoming auctions | false |
| page | Start page (for pagination) | 1 |

## Search Options

| Option | Description | Default |
|--------|-------------|---------|
| maxPages | Maximum pages to scrape | 1 |
| saveToGcs | Save results to GCS | false |
| gcsBucket | Override the bucket name | from constructor |
| batchSize | Items per batch for GCS | 100 |

## Output Format

The search results follow this structure:

```javascript
{
  results: [{
    meta: {
      totalHits: 1234,     // Total number of matching items
      hitsPerPage: 96,     // Items per page
      page: 1,             // Current page
      // Other metadata
    },
    hits: [{
      lotId: "123456",     // Unique lot ID
      lotTitle: "Antique Victorian Chair",
      priceResult: { amount: 1500, text: "$1,500" },
      houseName: "Example Auction House",
      photoPath: "https://...", // Image URL
      // Other item details
    }, 
    // More items...
    ]
  }],
  stats: {               // Only for multi-page results
    totalItems: 500,     // Total items scraped
    completedPages: 6,   // Pages successfully scraped
    runningTimeMin: 3.5, // Total time in minutes
    // Other statistics
  },
  cookies: [...]         // Browser cookies
}
``` 