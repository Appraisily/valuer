/**
 * Módulo principal para manejar la paginación de Invaluable
 */
const { sanitizeCookies, cookiesToString, updateCookiesAfterRequest } = require('./cookie-manager');
const { extractNavigationParams, extractFromInitialState } = require('./navigation-params');
const { 
  API_BASE_URL, 
  CAT_RESULTS_ENDPOINT, 
  SESSION_INFO_ENDPOINT,
  setupRequestInterception, 
  buildRequestHeaders, 
  buildResultsPayload 
} = require('./request-interceptor');
const { 
  processPageResults, 
  extractResultsMetadata, 
  checkIfDifferentResults,
  shouldContinueProcessing
} = require('./results-processor');
const { handleFirstPage } = require('./first-page');
const { buildSearchParams } = require('../../../utils');

/**
 * Helper function to wait for a specific time
 * @param {Object} page - Page object
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
async function wait(page, ms) {
  // Use page.evaluate with setTimeout for compatibility
  return page.evaluate(ms => new Promise(r => setTimeout(r, ms)), ms);
}

// Utility functions for logging
const getTimestamp = () => new Date().toISOString();
const formatElapsedTime = (startTime) => {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
  return `${(elapsed/60000).toFixed(2)}min`;
};

/**
 * Handles pagination for the Invaluable search results.
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} params - Search parameters
 * @param {Object} firstPageResults - Results from the first page
 * @param {Array} cookies - Browser cookies
 * @param {Number} maxPages - Maximum number of pages to fetch (default: 10)
 * @param {Object} config - Optional configuration
 * @returns {Object} Combined search results
 */
const handlePagination = async (browser, params, firstPageResults, cookies = [], maxPages = 10, config = null) => {
  // Start timing
  const startTime = Date.now();
  console.log(`[${getTimestamp()}] 📚 Starting handlePagination with maxPages=${maxPages}`);
  
  // Track metrics
  const pageMetrics = {
    success: 0,
    failed: 0,
    startTimes: {},
    durations: {}
  };
  
  try {
    // Check if there are valid results in the first page
    if (!firstPageResults?.results?.[0]?.hits) {
      console.log(`[${getTimestamp()}] ⚠️ No valid results in first page, skipping pagination`);
      return firstPageResults;
    }
    
    // Extract information about total results and pagination
    const totalHits = firstPageResults.results[0].meta?.totalHits || 0;
    const hitsPerPage = firstPageResults.results[0].meta?.hitsPerPage || 96;
    const estimatedPages = Math.ceil(totalHits / hitsPerPage);
    const actualMaxPages = Math.min(estimatedPages, maxPages);
    
    console.log(`[${getTimestamp()}] 📊 Pagination info: ${totalHits} total hits, ${hitsPerPage} per page, will fetch up to ${actualMaxPages} pages`);
    
    // If there's only one page or maxPages is 1, return first page results
    if (estimatedPages <= 1 || maxPages <= 1) {
      console.log(`[${getTimestamp()}] ℹ️ Only one page needed, skipping pagination`);
      return firstPageResults;
    }
    
    // Get browser state for API calls
    console.log(`[${getTimestamp()}] 🌐 Getting a new page for pagination API calls`);
    const page = await browser.newPage();
    if (cookies && cookies.length > 0) {
      console.log(`[${getTimestamp()}] 🍪 Setting ${cookies.length} cookies`);
      await page.setCookie(...cookies);
    }
    
    // Create navigation state object to pass between requests
    const navState = { currentPage: 1, lastResponse: firstPageResults, done: false };
    
    // Make a deep copy of the first page results to modify
    const combinedResults = JSON.parse(JSON.stringify(firstPageResults));
    const allHits = [...combinedResults.results[0].hits];
    let uniqueHitIds = new Set(allHits.map(hit => hit.lotId || hit.id));
    
    console.log(`[${getTimestamp()}] 📝 First page had ${allHits.length} hits, beginning to fetch more pages`);
    
    // Start processing from page 2
    navState.currentPage = 2;
    
    // Loop through pages until done
    while (!navState.done && navState.currentPage <= actualMaxPages) {
      // Track the current page processing time
      pageMetrics.startTimes[navState.currentPage] = Date.now();
      console.log(`[${getTimestamp()}] 🔄 Processing page ${navState.currentPage} of ${actualMaxPages}`);
      
      // Build the search parameters for the current page
      const currentParams = { ...params, page: navState.currentPage };
      const searchParamsString = buildSearchParams(currentParams);
      
      try {
        // Intercept the next page request
        await setupRequestInterception(page, navState, navState.currentPage);
        
        // Navigate to the search URL with the current page
        const searchUrl = `https://www.invaluable.com/search/items?${searchParamsString}`;
        console.log(`[${getTimestamp()}] 🔗 Navigating to page ${navState.currentPage}: ${searchUrl}`);
        
        // Navigate to the page
        await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for the response to be processed by the interceptor
        // The interceptor will update navState with the response
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Track page completion time
        pageMetrics.durations[navState.currentPage] = Date.now() - pageMetrics.startTimes[navState.currentPage];
        
        // Check if the navigation state has a valid response
        if (navState.lastResponse && navState.lastResponse.results && navState.lastResponse.results[0]?.hits) {
          const pageHits = navState.lastResponse.results[0].hits;
          const newHitCount = pageHits.length;
          
          let addedHits = 0;
          // Add unique hits to the combined results
          pageHits.forEach(hit => {
            const hitId = hit.lotId || hit.id;
            if (!uniqueHitIds.has(hitId)) {
              allHits.push(hit);
              uniqueHitIds.add(hitId);
              addedHits++;
            }
          });
          
          console.log(`[${getTimestamp()}] ✅ Page ${navState.currentPage} complete in ${formatElapsedTime(pageMetrics.startTimes[navState.currentPage])} - Added ${addedHits} new hits of ${newHitCount} total`);
          pageMetrics.success++;
        } else {
          console.log(`[${getTimestamp()}] ⚠️ Page ${navState.currentPage} returned no valid hits`);
          pageMetrics.failed++;
          // If we get an invalid response, mark as done to stop pagination
          navState.done = true;
        }
        
        // Move to the next page
        navState.currentPage++;
        
        // Check if we've reached the maximum pages
        if (navState.currentPage > actualMaxPages) {
          console.log(`[${getTimestamp()}] ℹ️ Reached maximum pages limit (${actualMaxPages})`);
          navState.done = true;
        }
        
        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error processing page ${navState.currentPage}: ${error.message}`);
        pageMetrics.failed++;
        
        // If there's an error, we'll stop pagination
        navState.done = true;
      }
    }
    
    // Close the page when done
    await page.close();
    
    // Update the combined results with all hits
    combinedResults.results[0].hits = allHits;
    
    // Update metadata
    if (combinedResults.results[0].meta) {
      combinedResults.results[0].meta.totalHits = totalHits;
    }
    
    const totalTime = Date.now() - startTime;
    const successRate = (pageMetrics.success / (pageMetrics.success + pageMetrics.failed)) * 100;
    
    console.log(`[${getTimestamp()}] 🏁 Pagination complete in ${formatElapsedTime(startTime)}`);
    console.log(`[${getTimestamp()}] 📊 Stats: ${pageMetrics.success} pages successful, ${pageMetrics.failed} failed (${successRate.toFixed(1)}% success rate)`);
    console.log(`[${getTimestamp()}] 📦 Total unique hits: ${allHits.length}`);
    
    return combinedResults;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[${getTimestamp()}] ❌ Error in handlePagination after ${formatElapsedTime(startTime)}: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
};

/**
 * Solicita información de la sesión para mantener cookies frescas
 * @param {Object} page - Instancia de la página
 * @param {Object} navState - Estado de navegación
 * @returns {Promise<Object>} - Respuesta de la solicitud
 */
async function requestSessionInfo(page, navState) {
  try {
    console.log('Solicitando información de sesión...');
    
    const url = `${API_BASE_URL}${SESSION_INFO_ENDPOINT}`;
    const headers = buildRequestHeaders(navState.cookies);
    
    const response = await page.evaluate(
      async (url, headers) => {
        try {
          const resp = await fetch(url, {
            method: 'GET',
            headers,
            credentials: 'include'
          });
          
          if (!resp.ok) return { error: resp.status, message: resp.statusText };
          
          return await resp.json();
        } catch (error) {
          return { error: true, message: error.toString() };
        }
      },
      url,
      headers
    );
    
    return response;
  } catch (error) {
    console.error(`Error al solicitar información de sesión: ${error.message}`);
    return null;
  }
}

/**
 * Solicita los resultados de una página específica
 * @param {Object} page - Instancia de la página
 * @param {number} pageNum - Número de página
 * @param {Object} params - Parámetros de búsqueda
 * @param {Object} navState - Estado de navegación
 * @returns {Promise<Object>} - Resultados de la página
 */
async function requestPageResults(page, pageNum, params, navState) {
  try {
    console.log(`Solicitando resultados para la página ${pageNum}...`);
    
    // Construir payload para la solicitud
    const payload = buildResultsPayload(params, pageNum, navState);
    console.log('Payload de solicitud:', JSON.stringify(payload));
    
    // Construir headers
    const headers = buildRequestHeaders(navState.cookies);
    
    // Intentar primero con URL absoluta
    let url = `${API_BASE_URL}${CAT_RESULTS_ENDPOINT}`;
    let response = await makeApiRequest(page, url, headers, payload);
    
    // Si falla con URL absoluta, intentar con URL relativa
    if (response && response.error) {
      console.log('Intentando con URL relativa...');
      url = CAT_RESULTS_ENDPOINT;
      response = await makeApiRequest(page, url, headers, payload);
    }
    
    // Verificar respuesta válida (adaptado para la estructura específica de Invaluable)
    if (response && response.results && response.results[0]?.hits) {
      console.log(`✅ Obtenidos ${response.results[0].hits.length} resultados para la página ${pageNum}`);
      return response;
    } else {
      console.error(`Error en la respuesta:`, response);
      return null;
    }
  } catch (error) {
    console.error(`Error al solicitar resultados para la página ${pageNum}: ${error.message}`);
    return null;
  }
}

/**
 * Realiza una solicitud API
 * @param {Object} page - Instancia de la página
 * @param {string} url - URL para la solicitud
 * @param {Object} headers - Headers para la solicitud
 * @param {Object} payload - Payload para la solicitud
 * @returns {Promise<Object>} - Respuesta de la API
 */
async function makeApiRequest(page, url, headers, payload) {
  return page.evaluate(
    async (url, headers, payload) => {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        
        if (!resp.ok) {
          return { 
            error: resp.status, 
            message: resp.statusText,
            url: resp.url
          };
        }
        
        return await resp.json();
      } catch (error) {
        return { 
          error: true, 
          message: error.toString(),
          url: url
        };
      }
    },
    url,
    headers,
    payload
  );
}

module.exports = {
  handlePagination,
  handleFirstPage,
  requestSessionInfo,
  requestPageResults,
  makeApiRequest
}; 