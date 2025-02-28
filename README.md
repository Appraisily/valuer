# Invaluable Search API

A specialized Node.js API that provides access to Invaluable's search results by intercepting and returning the raw JSON responses from their catResults endpoint. Built with Puppeteer and Express, this API handles all the complexities of browser automation, cookie management, and request interception.

## Overview

This API provides a simple interface to search Invaluable's catalog by:
- Automating browser interactions
- Managing required cookies and headers
- Intercepting and capturing JSON responses
- Handling protection challenges
- Supporting all Invaluable search parameters

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

- **Automatic Pagination**
  - Dynamically determines total number of pages from initial API response
  - Automatically scrapes all available pages without requiring `maxPages` parameter
  - Skips already processed pages when resuming interrupted scraping sessions
  - Reports comprehensive statistics including total items, pages processed, and pages skipped
  - Optimizes first page processing by using metadata from initial request

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
- `fetchAllPages`: Set to `true` to automatically fetch all pages of results
- `maxPages`: Maximum number of pages to fetch when using `fetchAllPages` (optional, system will auto-determine if not provided)
- `saveToGcs`: Set to `true` to save results to Google Cloud Storage

Example Requests:
```bash
# Basic search
curl "http://localhost:8080/api/search?query=furniture"

# Search with price range
curl "http://localhost:8080/api/search?query=furniture&priceResult%5Bmin%5D=1750&priceResult%5Bmax%5D=3250"

# Search specific items
curl "http://localhost:8080/api/search?query=Antique+Victorian+mahogany+dining+table&priceResult%5Bmin%5D=1750&priceResult%5Bmax%5D=3250"

# Search specific auction house
curl "http://localhost:8080/api/search?houseName=DOYLE%20Auctioneers%20%26%20Appraisers&query=antique"

# Search with pagination - specify max pages
curl "https://valuer-dev-856401495068.us-central1.run.app/api/search?query=furniture&fetchAllPages=true&maxPages=3"

# Search with automatic pagination - system determines total pages
curl "https://valuer-dev-856401495068.us-central1.run.app/api/search?query=furniture&fetchAllPages=true"
```

### Pagination and Data Interception Process

When using the endpoint with pagination parameters (like `https://valuer-dev-856401495068.us-central1.run.app/api/search?query=furniture&fetchAllPages=true`), the API works as follows:

1. **Request Interception**: The system uses Puppeteer to create an automated browser session to Invaluable's website.

2. **Initial Page Metadata**: If no `maxPages` parameter is provided, the system first makes a request to fetch just the first page of results to extract metadata about total items and number of pages.

3. **Automatic Pagination**: Based on the metadata from the first page, the system calculates the total number of pages available (typically around 96 items per page) and sets this as the `maxPages` value.

4. **catResults Capture**: The API intercepts the JSON responses from Invaluable's internal `/catResults` endpoint, which contains the raw auction data.

5. **Skip Processing**: The system checks if each page has already been processed and stored in Google Cloud Storage, allowing it to skip reprocessing of existing pages when resuming interrupted scraping jobs.

6. **Pagination Handling**: 
   - The API first captures the initial page of results
   - It then automatically navigates through subsequent pages (up to the calculated total pages)
   - For each page, it intercepts the `/catResults` response
   - All pages are combined into a single comprehensive response

7. **Data Processing**: The raw JSON data from the catResults endpoint is processed and standardized to provide a consistent response format.

8. **Response Format**: The final response includes all auction lots from all fetched pages, with detailed information about each item and metadata about the scraping process.

Example Response with Scraping Summary:
```json
{
  "success": true,
  "timestamp": "2024-02-14T12:34:56.789Z",
  "parameters": {
    "query": "furniture",
    "fetchAllPages": "true",
    "maxPages": 1824
  },
  "pagination": {
    "totalItems": 175072,
    "totalPages": 1824,
    "itemsPerPage": 96,
    "currentPage": 1
  },
  "scrapingSummary": {
    "pagesProcessed": 1824,
    "skippedExistingPages": 951,
    "totalPagesFound": 1824,
    "automaticPagination": true
  },
  "data": {
    "lots": [...],
    "totalResults": 175072
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

## Automatic Pagination

The latest version of the API includes automatic pagination, which eliminates the need to specify the `maxPages` parameter. The system will dynamically determine the total number of pages from the initial API response metadata and scrape all available pages.

### How It Works

1. When you make a request with `fetchAllPages=true` but without specifying `maxPages`, the system:
   - Makes an initial API request to fetch just the first page
   - Extracts the total number of items and the items per page from the metadata
   - Calculates the total number of pages by dividing these values
   - Uses this calculated value as the `maxPages` parameter

2. The system then proceeds to fetch all pages, automatically skipping any that have already been processed and stored in Google Cloud Storage.

3. The response includes detailed statistics in the `scrapingSummary` field.

### Example Command

This command will automatically determine the total number of pages for the "furniture" query and scrape all pages, skipping any that already exist in storage:

```bash
curl "https://valuer-dev-856401495068.us-central1.run.app/api/search?query=furniture&fetchAllPages=true&saveToGcs=true"
```

### Example Subcategory Command

Similarly, you can use automatic pagination with furniture subcategories:

```bash
curl "https://valuer-dev-856401495068.us-central1.run.app/api/furniture/scrape/Chairs?fetchAllPages=true"
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

### Using Existing Service Account Credentials

If you're already using a Google Cloud service account in your application, you can use the same credentials for the scraper:

1. **Using Application Default Credentials**: If your application is already authenticated (running on GCP or using ADC), the scraper will automatically use these credentials.

2. **Using an Existing Service Account**: Modify the configuration to include your credentials:

```javascript
// In your configuration:
const CONFIG = {
  // ...other settings
  gcsEnabled: true,
  gcsBucket: 'your-bucket-name',
  gcsCredentials: require('./path/to/service-account.json') // Or pass credentials object directly
};
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