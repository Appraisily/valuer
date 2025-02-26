# Invaluable Search API

A specialized Node.js API that provides access to Invaluable's search results by intercepting and returning the raw JSON responses from their catResults endpoint. Built with Puppeteer and Express, this API handles all the complexities of browser automation, cookie management, and request interception.

## Overview

This API provides a simple interface to search Invaluable's catalog by:
- Automating browser interactions
- Managing required cookies and headers
- Intercepting and capturing JSON responses
- Handling protection challenges
- Supporting all Invaluable search parameters
- **Paginating through multiple pages of results**

## Features

### Core Functionality
- **Dynamic Parameter Support**
  - Accepts all Invaluable search parameters
  - Constructs proper search URLs
  - Maintains query parameter integrity
  - Supports price range filtering with `priceResult[min]` and `priceResult[max]`

- **Browser Automation**
  - Puppeteer with Stealth Plugin
  - Cookie management
  - Request interception
  - Resource optimization
  - Protection handling

- **Response Capture**
  - JSON response interception
  - Response validation
  - Error handling
  - Size-based filtering
  - Detailed logging of result counts

- **Pagination Support**
  - Fetch specific pages using the `page` parameter
  - Automatically fetch multiple pages with `fetchAllPages=true`
  - Limit maximum pages with `maxPages` parameter
  - Combine results from multiple pages

### Technical Features

#### Browser Management
- Multi-tab processing
- Resource blocking
- Request interception
- Human behavior simulation:
  - Random mouse movements
  - Natural scrolling patterns
  - Realistic timing delays
  - Dynamic viewport handling

#### API Features
- RESTful endpoint at `/api/search`
- Dynamic parameter support
- Real-time response capture
- Comprehensive error handling
- Detailed response logging

## Prerequisites

- Node.js (v18 or higher)
- Google Cloud SDK (for deployment)
- Docker (for containerization)

## Environment Variables

Required variables in `.env`:
```
GOOGLE_CLOUD_PROJECT=your-project-id
STORAGE_BUCKET=invaluable-html-archive
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd invaluable-search-api
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

## API Documentation

### Search Endpoint

```
GET /api/search
```

Query Parameters:
- `query`: Search query (e.g., "Antique Victorian mahogany dining table")
- `keyword`: Additional keyword filter
- `supercategoryName`: Category name (e.g., "Furniture", "Fine Art")
- `priceResult[min]`: Minimum price
- `priceResult[max]`: Maximum price
- `houseName`: Auction house name
- `upcoming`: Filter for upcoming auctions (true/false)
- `page`: Specific page number to fetch (1-based indexing)
- `fetchAllPages`: Set to 'true' to fetch multiple pages automatically
- `maxPages`: Maximum number of pages to fetch when using `fetchAllPages`

### Example Requests:

#### Basic Search
```bash
curl "http://localhost:8080/api/search?query=furniture"
```

#### Search with Price Range
```bash
curl "http://localhost:8080/api/search?query=furniture&priceResult%5Bmin%5D=1750&priceResult%5Bmax%5D=3250"
```

#### Multi-Page Search (Fetch 3 Pages)
```bash
curl "http://localhost:8080/api/search?query=furniture&fetchAllPages=true&maxPages=3"
```

#### Specific Page Request
```bash
curl "http://localhost:8080/api/search?query=furniture&page=2"
```

#### Advanced Search with Multiple Parameters
```bash
curl "http://localhost:8080/api/search?query=Antique+Victorian+mahogany+dining+table&priceResult%5Bmin%5D=1750&priceResult%5Bmax%5D=3250&fetchAllPages=true&maxPages=3"
```

#### Search Specific Auction House
```bash
curl "http://localhost:8080/api/search?houseName=DOYLE%20Auctioneers%20%26%20Appraisers&query=antique"
```

### Example Response:
```json
{
  "success": true,
  "timestamp": "2024-02-14T12:34:56.789Z",
  "parameters": {
    "query": "Antique Victorian mahogany dining table",
    "priceResult": {
      "min": "1750",
      "max": "3250"
    },
    "fetchAllPages": "true",
    "maxPages": "3"
  },
  "pagination": {
    "currentPage": 3,
    "totalPages": 12,
    "totalResults": 287
  },
  "data": {
    "pages": [
      {
        "lots": [...],  // Page 1 results
        "totalResults": 287
      },
      {
        "lots": [...],  // Page 2 results
        "totalResults": 287
      },
      {
        "lots": [...],  // Page 3 results
        "totalResults": 287
      }
    ],
    "combinedLots": [...],  // All lots from all pages combined
    "totalResults": 287
  }
}
```

## Deployment

### Docker

Build the image:
```bash
docker build -t invaluable-search-api .
```

Run locally:
```bash
docker run -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  invaluable-search-api
```

### Google Cloud Run

Deploy using Cloud Build:
```bash
gcloud builds submit --config cloudbuild.yaml
```

## Project Structure

```
├── src/
│   ├── server.js                 # Express server setup
│   ├── scrapers/
│   │   └── invaluable/
│   │       ├── index.js         # Main scraper class
│   │       ├── browser.js       # Browser management
│   │       ├── auth.js          # Authentication handling
│   │       └── utils.js         # Utility functions
│   └── routes/
│       └── search.js            # Search endpoint
├── Dockerfile                    # Container configuration
├── cloudbuild.yaml              # Cloud Build config
└── package.json                 # Dependencies
```

## Error Handling

The system handles various error scenarios:
- Network timeouts
- Protection challenges
- API failures
- Invalid responses
- Rate limiting
- Browser errors

## Testing Pagination

To test pagination across multiple pages, use the following commands:

### Test First Page
```bash
curl "http://localhost:8080/api/search?query=antique&supercategoryName=Furniture"
```

### Test Second Page
```bash
curl "http://localhost:8080/api/search?query=antique&supercategoryName=Furniture&page=2"
```

### Test Third Page
```bash
curl "http://localhost:8080/api/search?query=antique&supercategoryName=Furniture&page=3"
```

### Fetch Three Pages Automatically
```bash
curl "http://localhost:8080/api/search?query=antique&supercategoryName=Furniture&fetchAllPages=true&maxPages=3"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License

# Enhanced Invaluable Scraper

An improved scraper for Invaluable with features for reliable large-scale data collection.

## Features

- **Resumable Pagination**: Can stop and resume scraping at any point
- **Progress Tracking**: Detailed statistics and checkpoints
- **Adaptive Rate Limiting**: Smart delays to avoid detection
- **Fault Tolerance**: Auto-retry with exponential backoff
- **Google Cloud Storage Integration**: Store results directly to GCS

## Storage Structure

```
gs://invaluable-data/
  └── raw/
      └── [category]/
          ├── metadata.json       # Collection info, statistics
          ├── page_001-100.json   # Batched page results
          ├── page_101-200.json   # Batched page results
          └── ...
```

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up Google Cloud credentials:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-file.json"
```

## Configuration

Edit `src/examples/invaluable-category-scraper.js` to customize:

- Category to scrape
- Maximum pages
- Batch size
- Rate limiting parameters
- Google Cloud Storage settings

## Usage

Run the example scraper:

```bash
npm start
```

Or use the pagination manager in your own code:

```javascript
const PaginationManager = require('./src/scrapers/invaluable/pagination/pagination-manager');

// Initialize the pagination manager
const paginationManager = new PaginationManager({
  category: 'furniture',
  maxPages: 4000,
  gcsEnabled: true,
  gcsBucket: 'invaluable-data',
  batchSize: 100,
});

// Use it in your scraper
const results = await paginationManager.processPagination(
  browser,
  searchParams,
  firstPageResults,
  initialCookies
);
```

## Key Components

- **PaginationManager**: Handles resumable pagination, checkpoints, and rate limiting
- **StorageManager**: Manages saving data to Google Cloud Storage

## Troubleshooting

- **Rate limiting issues**: Try increasing the `baseDelay` and `maxDelay` parameters
- **Connection errors**: The scraper has built-in retry logic, but persistent issues may require proxy rotation
- **GCS permissions**: Ensure your service account has proper permissions for the bucket