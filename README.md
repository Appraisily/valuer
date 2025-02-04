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

## Prerequisites

- Node.js (v18 or higher)
- Google Cloud SDK (for deployment)
- Docker (for containerization)

## Environment Variables

Required variables in `.env`:
```
GOOGLE_CLOUD_PROJECT=your-project-id
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
- `query`: Search query
- `keyword`: Additional keyword filter
- `supercategoryName`: Category name (e.g., "Furniture", "Fine Art")
- `priceResult[min]`: Minimum price
- `priceResult[max]`: Maximum price
- `houseName`: Auction house name
- `upcoming`: Filter for upcoming auctions (true/false)

Example Requests:
```bash
# Basic search
curl "http://localhost:8080/api/search?query=furniture"

# Search with multiple parameters
curl "http://localhost:8080/api/search?supercategoryName=Furniture&priceResult[min]=500&priceResult[max]=5000"

# Search specific auction house
curl "http://localhost:8080/api/search?houseName=DOYLE%20Auctioneers%20%26%20Appraisers&query=antique"
```

Example Response:
```json
{
  "success": true,
  "timestamp": "2024-02-14T12:34:56.789Z",
  "parameters": {
    "query": "furniture",
    "priceResult[min]": "500"
  },
  "data": [
    {
      // Captured JSON responses from catResults endpoint
    }
  ]
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
│   │       └── search/
│   │           ├── api-monitor.js # Response monitoring
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