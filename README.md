# Valuer - Invaluable Search API & Enhanced Scraper

A specialized Node.js tool for accessing and extracting data from Invaluable's auction listings. The project consists of two main components:

1. **API Service**: A RESTful API that intercepts and returns raw JSON responses from Invaluable's search endpoints
2. **Enhanced Scraper**: A robust scraper with pagination support and Google Cloud Storage integration

## Overview

This project provides powerful tools for searching and collecting data from Invaluable's catalog by:
- Automating browser interactions with Puppeteer
- Managing required cookies, headers and authentication
- Intercepting and capturing JSON responses
- Handling protection challenges
- Supporting comprehensive search parameters
- Enabling large-scale data collection with resumable operations

## Features

### API Service

#### Core Functionality
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

#### Technical Features
- **Browser Management**
  - Multi-tab processing
  - Resource blocking
  - Request interception
  - Human behavior simulation:
    - Random mouse movements
    - Natural scrolling patterns
    - Realistic timing delays
    - Dynamic viewport handling

- **API Features**
  - RESTful endpoint at `/api/search`
  - Dynamic parameter support
  - Real-time response capture
  - Comprehensive error handling
  - Detailed response logging

### Enhanced Scraper

- **Resumable Pagination**: Can stop and resume scraping at any point
- **Progress Tracking**: Detailed statistics and checkpoints
- **Adaptive Rate Limiting**: Smart delays to avoid detection
- **Fault Tolerance**: Auto-retry with exponential backoff
- **Google Cloud Storage Integration**: Store results directly to GCS

## Prerequisites

- Node.js (v14 or higher, v18+ recommended)
- Google Cloud SDK (for GCS integration and deployment)
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
git clone https://github.com/yourusername/valuer.git
cd valuer
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on the example:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the API server:
```bash
npm start
```

## API Documentation

### Search Endpoint

```
GET /api/search
```

#### Query Parameters
| Parameter | Description | Example |
|-----------|-------------|---------|
| `query` | Main search query | "Antique Victorian mahogany" |
| `keyword` | Additional keyword filter | "dining table" |
| `supercategoryName` | Category name | "Furniture", "Fine Art" |
| `priceResult[min]` | Minimum price | 1750 |
| `priceResult[max]` | Maximum price | 3250 |
| `houseName` | Auction house name | "DOYLE Auctioneers" |
| `upcoming` | Filter for upcoming auctions | true/false |

#### Example Requests
```bash
# Basic search
curl "http://localhost:8080/api/search?query=furniture"

# Search with price range
curl "http://localhost:8080/api/search?query=furniture&priceResult%5Bmin%5D=1750&priceResult%5Bmax%5D=3250"

# Search specific items
curl "http://localhost:8080/api/search?query=Antique+Victorian+mahogany+dining+table&priceResult%5Bmin%5D=1750&priceResult%5Bmax%5D=3250"

# Search specific auction house
curl "http://localhost:8080/api/search?houseName=DOYLE%20Auctioneers%20%26%20Appraisers&query=antique"
```

#### Example Response
```json
{
  "success": true,
  "timestamp": "2024-02-14T12:34:56.789Z",
  "parameters": {
    "query": "Antique Victorian mahogany dining table",
    "priceResult": {
      "min": "1750",
      "max": "3250"
    }
  },
  "data": {
    "lots": [...],
    "totalResults": 42
  }
}
```

## Enhanced Scraper Usage

The enhanced scraper provides tools for large-scale data collection with resilient pagination handling.

### Storage Structure

```
gs://invaluable-data/
  └── raw/
      └── [category]/
          ├── metadata.json       # Collection info, statistics
          ├── page_001-100.json   # Batched page results
          ├── page_101-200.json   # Batched page results
          └── ...
```

### Configuration

Edit `src/examples/invaluable-category-scraper.js` to customize:

- Category to scrape
- Maximum pages
- Batch size
- Rate limiting parameters
- Google Cloud Storage settings

### Running the Scraper

Run the example scraper:

```bash
npm start
```

Or programmatically:

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

## Deployment

### Docker

Build the image:
```bash
docker build -t valuer .
```

Run locally:
```bash
docker run -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  valuer
```

### Google Cloud Run

Deploy using Cloud Build:
```bash
gcloud builds submit --config cloudbuild.yaml
```

## Project Structure

```
├── src/
│   ├── server.js                     # Express server setup
│   ├── examples/
│   │   └── invaluable-category-scraper.js  # Example scraper
│   ├── scrapers/
│   │   └── invaluable/
│   │       ├── index.js              # Main scraper class
│   │       ├── browser.js            # Browser management
│   │       ├── auth.js               # Authentication handling
│   │       └── pagination/           # Pagination handling
│   │           └── pagination-manager.js  # Pagination manager
│   ├── routes/
│   │   └── search.js                 # Search endpoint
│   └── utils/                        # Utility functions
├── Dockerfile                         # Container configuration
├── cloudbuild.yaml                    # Cloud Build config
└── package.json                       # Dependencies
```

## Error Handling

The system handles various error scenarios:
- Network timeouts
- Protection challenges
- API failures
- Invalid responses
- Rate limiting
- Browser errors

## Troubleshooting

- **Rate limiting issues**: Try increasing the `baseDelay` and `maxDelay` parameters
- **Connection errors**: The scraper has built-in retry logic, but persistent issues may require proxy rotation
- **GCS permissions**: Ensure your service account has proper permissions for the bucket

## Google Cloud Storage Integration

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License