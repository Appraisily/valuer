# Invaluable Scraper API

A powerful API service that provides structured data from Invaluable auction listings with pagination support and configurable options.

## Deployment

The service is deployed at: https://valuer-dev-856401495068.us-central1.run.app

## Architecture Overview

The application is built with Node.js and Express, and uses Puppeteer for browser automation. The core components are:

- **Unified Scraper**: Central scraping engine that handles browser management, URL construction, and pagination.
- **Search API**: REST endpoints for searching auction data.
- **Storage Service**: Optional storage of search results to Google Cloud Storage.

## How It Works: catResults Interception

This API uses a sophisticated approach to extract data from Invaluable:

1. **Request Interception**: The system uses Puppeteer to create an automated browser session to Invaluable's website.

2. **catResults Capture**: The API intercepts the JSON responses from Invaluable's internal `/catResults` endpoint, which contains the raw auction data.

3. **Pagination Handling**: When `fetchAllPages=true` is specified:
   - The API first captures the initial page of results
   - It then automatically navigates through subsequent pages (up to the `maxPages` limit)
   - For each page, it intercepts the `/catResults` response
   - All pages are combined into a single comprehensive response

4. **Data Processing**: The raw JSON data from the catResults endpoint is processed and standardized to provide a consistent response format.

5. **Response Format**: The final response includes all auction lots from all fetched pages, with detailed information about each item.

## Installation

```bash
# Clone the repository
git clone <repository-url>

# Navigate to the project directory
cd invaluable-scraper

# Install dependencies
npm install
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=8080
GCS_BUCKET=invaluable-data
DEBUG=false
HEADLESS=true
```

## Running the Application

```bash
# Start the server
npm start

# Or with nodemon for development
npm run dev
```

## API Endpoints

### Unified Search Endpoint

`GET /api/unified-search`

The unified search endpoint provides a consistent interface for all search operations with proper parameter handling.

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| query | string | Search query | "" |
| supercategory | string | Super category name | null |
| category | string | Category name | null |
| subcategory | string | Sub-category name | null |
| upcoming | boolean | Include upcoming auctions | false |
| priceResult[min] | number | Minimum price | 250 |
| priceResult[max] | number | Maximum price | null |
| fetchAllPages | boolean | Fetch multiple pages | false |
| maxPages | number | Maximum pages to fetch | 1 |
| saveToGcs | boolean | Save results to GCS | false |
| debug | boolean | Enable debug logging | false |

#### Example Request

```
GET /api/unified-search?query=antique&supercategory=Furniture&maxPages=5&saveToGcs=true
```

#### Example Response

```json
{
  "success": true,
  "timestamp": "2023-03-15T12:34:56.789Z",
  "parameters": {
    "query": "antique",
    "supercategoryName": "Furniture",
    "upcoming": false
  },
  "pagination": {
    "totalItems": 1250,
    "totalPages": 13,
    "itemsPerPage": 96,
    "currentPage": 1
  },
  "stats": {
    "totalProcessingTime": 5432,
    "pagesScraped": 5
  },
  "data": {
    "lots": [
      {
        "title": "Antique Victorian Mahogany Side Table",
        "date": "2023-04-01T14:00:00Z",
        "auctionHouse": "Example Auction House",
        "price": {
          "amount": 1200,
          "currency": "USD",
          "symbol": "$"
        },
        "image": "https://example.com/images/table.jpg",
        "lotNumber": "123",
        "saleType": "Auction",
        "id": "abc123",
        "auctionId": "xyz789",
        "url": "https://example.com/lot/abc123"
      },
      // More lots...
    ],
    "totalResults": 480
  },
  "timing": {
    "totalTime": 6789,
    "timeUnit": "ms"
  }
}
```

### Legacy Endpoints

The application maintains backward compatibility with legacy endpoints:

- `GET /api/search` - Original search endpoint
- `POST /api/scraper/start` - Start a scraping job

## Advanced Usage

### API Commands

```bash
# Example command to fetch 5 pages of auction data
curl -X POST https://valuer-dev-856401495068.us-central1.run.app/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{
    "query": "antique",
    "supercategory": "Furniture",
    "maxPages": 5,
    "priceMin": 250,
    "priceMax": 5000,
    "saveToGcs": true,
    "gcsBucket": "invaluable-data",
    "headless": true
  }'
```

### Running Tests

```bash
# Run tests
npm test

# Run GCS scraper test with specific parameters
npm run test:gcs -- --query="antique" --supercategory="Furniture" --maxPages=5
```

### Example Scripts

The repository includes example scripts to demonstrate key functionality:

```bash
# Run the unified scraper example (Windows)
run-unified-scraper.bat "antique tables" "Furniture" 3

# Test the catResults interception (Windows)
run-catresults-interception.bat "antique chairs" "Furniture"
```

### Debugging

Set the `DEBUG` environment variable to `true` to enable detailed logging.

## Improvements

The latest changes include:

1. **Unified Parameter Handling**: Consistent parameter handling across all endpoints
2. **Proper URL Construction**: URLs are built with all required parameters
3. **Centralized Browser Management**: Browser instances are managed efficiently
4. **Standardized Response Format**: Consistent response structure for all endpoints
5. **Enhanced Request Interception**: Reliable capture of catResults responses

## License

[MIT License](LICENSE)