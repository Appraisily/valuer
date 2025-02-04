# Invaluable Furniture Scraper

A specialized Node.js web scraper for extracting furniture auction data from Invaluable.com. Built with Puppeteer, Express, and featuring an intelligent dynamic price range system that automatically optimizes data extraction based on auction house size and response characteristics.

## Overview

This scraper is designed to capture both HTML content and API responses from Invaluable's furniture auction listings, with specific focus on:
- Dynamic price range optimization
- Real-time data persistence
- Protection/challenge handling
- Comprehensive API response capture
- Auction house-specific optimizations

## Features

### Core Functionality
- **Dynamic Price Range Optimization**
  - Automatic range splitting based on response size
  - Smart initial segmentation:
    - Small auctions (≤1,000 items): 3 segments
    - Medium auctions (≤5,000 items): 5 segments
    - Large auctions (>5,000 items): 8 segments
  - Adaptive splitting logic:
    - Splits ranges when response size >600KB
    - Preserves ranges when response size <90KB (empty/near-empty)
    - Progressive doubling for unlimited ranges
  - Response optimization:
    - Size-based monitoring
    - Empty range detection
    - Duplicate response filtering
    - Hash-based deduplication

- **Real-time Data Persistence**
  - Immediate response saving
  - Incremental metadata updates
  - Auction house-specific organization
  - Price range tracking
  - Response deduplication

- **Advanced Response Handling**
  - Size-based filtering
  - Hash-based deduplication
  - Response validation
  - Comprehensive metadata tracking

- **Robust Error Handling**
  - Graceful range splitting fallback
  - Tab-level isolation
  - Response validation
  - Automatic retry logic

### Technical Features

#### Browser Automation
- Puppeteer with Stealth Plugin
- Multi-tab processing
- Resource optimization
- Request interception
- Human behavior simulation:
  - Random mouse movements
  - Natural scrolling patterns
  - Realistic timing delays
  - Dynamic viewport handling

#### Storage Integration
- Google Cloud Storage organization:
  ```
  Furniture/
  ├── {AuctionHouse}/
  │   ├── {priceRange}-{timestamp}.json
  │   ├── metadata-{timestamp}.json
  │   └── ...
  └── state/
      └── last_index.json
  ```

#### API Features
- RESTful endpoint at `/api/invaluable/furniture`
- Dynamic price range support
- Real-time progress tracking
- Comprehensive metadata
- Robust error handling

#### Price Range Optimization
- Initial segmentation based on auction house size:
  - Small auctions (≤1000 items): 3 segments
  - Medium auctions (≤5,000 items): 5 segments
  - Large auctions (>5,000 items): 8 segments
- Dynamic splitting based on response size:
  - Response size thresholds:
    - >600KB: Split range into smaller segments
    - <90KB: Keep range (indicates empty/near-empty results)
    - Between thresholds: Keep if has upper limit
  - Splitting strategies:
    - Limited ranges: Split at midpoint
    - Unlimited ranges: Double previous minimum
  - Recursive optimization:
    - Each split range is re-evaluated
    - Process continues until optimal sizes achieved
    - Maintains data quality while minimizing requests

## Prerequisites

- Node.js (v18 or higher)
- Google Cloud SDK
- Docker (for containerization)
- Access to Google Cloud Storage bucket

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
cd invaluable-furniture-scraper
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
GET /api/invaluable/furniture
```

Query Parameters:
- `query` (optional): Additional search query
- `keyword` (optional): Additional keyword filter
- `minPrice` (optional): Minimum price filter
- `currency` (optional): Currency code (e.g., USD, EUR)
- `upcoming` (optional): Filter for upcoming auctions only

Example Response:
```json
{
  "success": true,
  "timestamp": "2024-02-03T08:45:07.714Z",
  "auctionHouse": {
    "name": "DOYLE Auctioneers & Appraisers",
    "count": 585
  },
  "files": {
    "250-500": [
      "Furniture/DOYLE/250-500-2024-02-03T08-45-07-714Z.json"
    ],
    "500-2500": [
      "Furniture/DOYLE/500-2500-2024-02-03T08-45-07-714Z.json"
    ],
    "2500-unlimited": [
      "Furniture/DOYLE/2500-unlimited-2024-02-03T08-45-07-714Z.json"
    ]
  },
  "ranges": {
    "250-500": {
      "min": 250,
      "max": 500,
      "responseSize": 164133,
      "timestamp": "2024-02-03T08:45:07.714Z"
    },
    "500-2500": {
      "min": 500,
      "max": 2500,
      "responseSize": 387264,
      "timestamp": "2024-02-03T08:45:07.714Z"
    },
    "2500-unlimited": {
      "min": 2500,
      "max": null,
      "responseSize": 253171,
      "timestamp": "2024-02-03T08:45:07.714Z"
    }
  },
  "urls": [
    "https://www.invaluable.com/search?supercategoryName=Furniture&upcoming=false&query=furniture&keyword=furniture&houseName=DOYLE%20Auctioneers%20%26%20Appraisers&priceResult[min]=250&priceResult[max]=500",
    "https://www.invaluable.com/search?supercategoryName=Furniture&upcoming=false&query=furniture&keyword=furniture&houseName=DOYLE%20Auctioneers%20%26%20Appraisers&priceResult[min]=500&priceResult[max]=2500",
    "https://www.invaluable.com/search?supercategoryName=Furniture&upcoming=false&query=furniture&keyword=furniture&houseName=DOYLE%20Auctioneers%20%26%20Appraisers&priceResult[min]=2500"
  ]
}
```

## Process Flow

The scraper follows these steps (with detailed logging):

1. 🔄 Initialize search process
2. 📊 Analyze auction house size
3. 🎯 Generate initial price ranges based on size:
   - Small: 3 segments
   - Medium: 5 segments
   - Large: 8 segments
4. 🔄 For each initial range:
   - 📏 Test response size
   - If >600KB:
     - Split range at midpoint or double minimum
     - Recursively test new ranges
   - If <90KB:
     - Keep range (empty/near-empty)
   - If between thresholds:
     - Keep if has upper limit
     - Split if unlimited
5. 🌐 For each optimized range:
   - Make API request
   - Capture response
   - Filter duplicates
   - Save data
6. 📊 Generate final report with:
   - Total responses
   - Range statistics
   - Coverage analysis
7. ✅ Complete process

## Deployment

### Docker

Build the image:
```bash
docker build -t invaluable-furniture-scraper .
```

Run locally:
```bash
docker run -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  -e STORAGE_BUCKET=invaluable-html-archive \
  invaluable-furniture-scraper
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
│   │       └── search/
│   │           ├── index.js     # Search functionality
│   │           ├── api-monitor.js # Response monitoring
│   │           └── pagination-handler.js # Range handling
│   └── utils/
│       └── storage.js           # GCS integration
├── Dockerfile                    # Container configuration
├── cloudbuild.yaml              # Cloud Build config
└── package.json                 # Dependencies
```

## Error Handling

The system handles various error scenarios:
- Range splitting failures
- Response size issues
- Data persistence errors
- Network timeouts
- Protection challenges
- API failures
- Storage errors
- Invalid responses
- Rate limiting
- Tab isolation errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License