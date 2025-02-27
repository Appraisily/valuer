# Valuer - Invaluable Search API & Enhanced Scraper

A specialized Node.js tool for accessing and extracting data from Invaluable's auction listings. The project consists of two main components:

1. **API Service**: A RESTful API that intercepts and returns raw JSON responses from Invaluable's search endpoints
2. **Enhanced Scraper**: A robust scraper with pagination support and Google Cloud Storage integration

## Deployed Service

The service is currently deployed and accessible at:

**https://valuer-dev-856401495068.us-central1.run.app**

### Quick Tests

#### Direct Search API (Fastest Option):
```bash
curl "https://valuer-dev-856401495068.us-central1.run.app/api/search?query=furniture&fetchAllPages=true&maxPages=3"
```

#### Start Scraper Job:
```bash
curl -X POST https://valuer-dev-856401495068.us-central1.run.app/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{"category":"furniture", "maxPages": 3}'
```

#### Check Job Status:
```bash
curl https://valuer-dev-856401495068.us-central1.run.app/api/scraper/jobs
```

## Current State & Known Issues

The repository includes two main methods to access data:

1. **Direct Search API**: The `/api/search` endpoint provides immediate results and is the most reliable option, particularly in Cloud Run environments.

2. **Background Scraper**: The `/api/scraper/start` endpoint begins a background job but may encounter browser initialization issues in constrained environments.

### Known Issues in Cloud Run

Running Puppeteer/Chrome in Cloud Run has some limitations:
- Memory constraints can cause browser launch timeouts 
- Chrome sandbox restrictions may affect performance
- Headless mode is required and user data directories should be disabled

The direct search API (`/api/search`) is optimized for these constraints and provides the most reliable results.

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

## Current State

The repository now features a RESTful API that controls the scraper rather than running it automatically on startup. Key improvements:

- API-driven approach to start and monitor scraping jobs
- Default limit of 3 pages per job for safety (configurable)
- Cloud Run compatibility with proper port binding
- Job status tracking and management
- Improved error handling and browser initialization

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and active jobs |
| `/api/config` | GET | View current configuration |
| `/api/scraper/start` | POST | Start a new scraper job |
| `/api/scraper/jobs` | GET | List all jobs |
| `/api/scraper/job/:jobId` | GET | Get specific job status |

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

### Starting a Scraper Job

```bash
# Start a scraper job with 3 pages of furniture data
curl -X POST https://valuer-dev-856401495068.us-central1.run.app/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{"category":"furniture", "maxPages": 3}'

# Start a job with custom parameters
curl -X POST https://valuer-dev-856401495068.us-central1.run.app/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{
    "category": "art",
    "maxPages": 5,
    "baseDelay": 2000,
    "maxDelay": 5000
  }'
```

### Checking Job Status

```bash
# List all jobs
curl https://valuer-dev-856401495068.us-central1.run.app/api/scraper/jobs

# Check a specific job
curl https://valuer-dev-856401495068.us-central1.run.app/api/scraper/job/YOUR_JOB_ID
```

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

### Running the Scraper Locally

Run the API server:

```bash
npm start
```

Or run the scraper directly (not recommended for production):

```bash
npm run start:scraper
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