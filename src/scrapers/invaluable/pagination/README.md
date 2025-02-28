# Invaluable Scraper Pagination Module

## Overview

This directory contains the pagination module for the Invaluable scraper. It handles the logic for retrieving multiple pages of search results from the Invaluable website.

## Module Structure

The module has been refactored into the following components:

- **index.js**: The main entry point that re-exports all functionality
- **utilities.js**: Common utility functions for timing, logging, and general helpers
- **session-manager.js**: Manages session information and cookies
- **page-manager.js**: Handles requesting and processing page results
- **request-interceptor.js**: Intercepts and processes API requests and responses
- **pagination-handler.js**: Core pagination logic
- **first-page.js**: Handles retrieving the first page of results

## Usage

```javascript
const { handlePagination, requestSessionInfo, getTimestamp } = require('./pagination');

// Example usage
const browser = await puppeteer.launch();
const firstPageResults = await handleFirstPage(browser, searchParams, cookies);
const allResults = await handlePagination(
  browser, 
  searchParams, 
  firstPageResults, 
  cookies, 
  maxPages
);
```

## Functions

### Core Functions

- **handlePagination()**: The main function for handling pagination, fetching all pages
- **handleFirstPage()**: Retrieves the first page of search results
- **requestPageResults()**: Fetches a specific page of results
- **requestSessionInfo()**: Maintains session for cookies

### Utility Functions

- **wait()**: Pause execution for a specified duration
- **getTimestamp()**: Get formatted timestamp for logging
- **formatElapsedTime()**: Format elapsed time in a human-readable way

## Constants

Constants like API endpoints, default pagination values, and timeouts are now centralized in the `../constants.js` file.

## Upgrading from Previous Version

If you were using the previous monolithic pagination module, update your imports to use the new module structure:

```javascript
// Old way
const { handlePagination, requestSessionInfo } = require('./pagination-handler');

// New way
const { handlePagination, requestSessionInfo } = require('./pagination');
```

The public API remains the same, so existing code should continue to work without changes. 