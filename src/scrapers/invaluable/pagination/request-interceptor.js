/**
 * Módulo para manejar la interceptación de solicitudes HTTP durante la paginación
 */
const { extractFromApiResponse } = require('./navigation-params');
const { getTimestamp } = require('./utilities');

// Constantes para URLs
const API_BASE_URL = 'https://www.invaluable.com';
const CAT_RESULTS_ENDPOINT = '/catResults';
const SESSION_INFO_ENDPOINT = '/boulder/session-info';

// Headers comunes para las solicitudes
const COMMON_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.invaluable.com',
  'Referer': 'https://www.invaluable.com/search',
  'X-Requested-With': 'XMLHttpRequest',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// Utility functions for logging
const formatElapsedTime = (startTime) => {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
  return `${(elapsed/60000).toFixed(2)}min`;
};

/**
 * Sets up request interception to capture API responses
 * @param {Page} page - Puppeteer page instance
 * @param {Object} navState - Navigation state object to update with response data
 * @param {Number} pageNumber - Page number being processed
 */
const setupRequestInterception = async (page, navState, pageNumber) => {
  try {
    // Enable request interception
    await page.setRequestInterception(true);
    
    // Set up event listeners for requests
    page.on('request', async (request) => {
      try {
        // Let non-API requests continue normally
        if (!request.url().includes('/api/search') && !request.url().includes('/api/v2/search')) {
          await request.continue();
          return;
        }
        
        console.log(`[${getTimestamp()}] 🔍 Intercepted API request for page ${pageNumber}: ${request.url()}`);
        
        // Continue the request
        await request.continue();
      } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error handling request: ${error.message}`);
        // If we encounter an error with the request, try to continue anyway
        try {
          await request.continue();
        } catch (continueErr) {
          // Ignore errors when trying to continue a request that may already be handled
        }
      }
    });
    
    // Set up event listeners for responses
    page.on('response', async (response) => {
      try {
        const url = response.url();
        // Only process API responses
        if (!url.includes('/api/search') && !url.includes('/api/v2/search')) {
          return;
        }
        
        const status = response.status();
        console.log(`[${getTimestamp()}] 📡 Received API response for page ${pageNumber}: ${status} ${url}`);
        
        // Process successful responses
        if (status >= 200 && status < 300) {
          try {
            // Get the response body as JSON
            const responseBody = await response.json();
            
            // Update the navigation state with the response data
            navState.lastResponse = responseBody;
            console.log(`[${getTimestamp()}] ✅ Successfully parsed API response for page ${pageNumber}`);
          } catch (jsonErr) {
            console.error(`[${getTimestamp()}] ⚠️ Failed to parse JSON response: ${jsonErr.message}`);
            navState.lastResponse = null;
          }
        } else {
          console.error(`[${getTimestamp()}] ⚠️ API request failed with status ${status}`);
          navState.lastResponse = null;
        }
      } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error handling response: ${error.message}`);
        navState.lastResponse = null;
      }
    });
    
    // Handle request failures
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.includes('/api/search') || url.includes('/api/v2/search')) {
        console.error(`[${getTimestamp()}] ❌ API request failed for page ${pageNumber}: ${url}`);
        console.error(`[${getTimestamp()}] ❌ Failure reason: ${request.failure()?.errorText || 'Unknown error'}`);
        navState.lastResponse = null;
      }
    });
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Failed to set up request interception: ${error.message}`);
    throw error;
  }
};

/**
 * Construye los headers para una solicitud
 * @param {Array} cookies - Cookies actuales
 * @param {string} [referer='https://www.invaluable.com/search'] - URL de referencia
 * @returns {Object} - Headers para la solicitud
 */
function buildRequestHeaders(cookies, referer = 'https://www.invaluable.com/search') {
  const headers = { 
    ...COMMON_HEADERS,
    'Referer': referer
  };
  
  if (cookies && cookies.length > 0) {
    headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }
  
  return headers;
}

/**
 * Construye el payload para una solicitud de resultados
 * @param {Object} params - Parámetros para la solicitud
 * @param {number} pageNum - Número de página
 * @param {Object} navState - Estado de navegación actual
 * @returns {Object} - Payload para la solicitud
 */
function buildResultsPayload(params, pageNum, navState) {
  // Convertir a formato basado en índice 0 (0 = primera página)
  const algoliaPage = pageNum - 1;
  
  console.log(`Construyendo payload para página ${pageNum} (índice ${algoliaPage})`);
  
  // Construir el payload en formato Algolia
  const payload = {
    requests: [{
      indexName: "archive_prod",
      params: {
        // Atributos a recuperar (todos los campos necesarios)
        attributesToRetrieve: [
          "watched",
          "dateTimeUTCUnix",
          "currencyCode",
          "dateTimeLocal",
          "lotTitle",
          "lotNumber",
          "lotRef",
          "photoPath",
          "houseName",
          "currencySymbol",
          "currencyCode",
          "priceResult",
          "saleType"
        ],
        // Analíticas y configuración de facetas
        clickAnalytics: true,
        getRankingInfo: true,
        
        // Configuración de resultados por página
        hitsPerPage: 96,
        maxValuesPerFacet: 50,
        
        // Configuración de resaltado
        highlightPostTag: "</ais-highlight-0000000000>",
        highlightPreTag: "<ais-highlight-0000000000>",
        
        // Parámetros de paginación y búsqueda
        page: algoliaPage,
        query: params.query || "",
        
        // Filtros
        filters: params.filters || "banned:false AND dateTimeUTCUnix<1740561842 AND onlineOnly:false AND channelIDs:1 AND closed:true",
        
        // Contextos y etiquetas
        ruleContexts: "",
        tagFilters: "",
        
        // Token de usuario (usar el proporcionado o un valor por defecto)
        userToken: params.userToken || navState.userToken || "9166383",
        
        // Facetas a incluir
        facets: [
          "hasImage",
          "supercategoryName",
          "artistName",
          "dateTimeUTCUnix",
          "houseName",
          "countryName",
          "currencyCode",
          "priceResult"
        ]
      }
    }]
  };
  
  // Si es página 2 o posterior, añadir facetas adicionales (como se ve en la solicitud real)
  if (pageNum > 1) {
    payload.requests[0].params.facets = [
      ...payload.requests[0].params.facets,
      "Furniture",
      "Fine Art",
      "Collectibles",
      "Decorative Art",
      "Firearms",
      "Asian Art & Antiques",
      "Dolls%2C Bears & Toys",
      "Wines & Spirits",
      "Jewelry",
      "Commercial & Industrial"
    ];
  }
  
  // Si tenemos refId de Algolia, añadirlo
  if (navState.refId) {
    // Nota: En Algolia, esto podría ir como un parámetro adicional
    // Pero basado en las solicitudes observadas, no parece usarse
    console.log(`Tenemos refId disponible: ${navState.refId}, pero no se incluye en formato Algolia`);
  } else {
    console.log(`Sin refId disponible, usando formato Algolia estándar con page=${algoliaPage}`);
  }
  
  return payload;
}

/**
 * Genera un hash consistente basado en los parámetros de consulta
 * Útil para mantener identificación consistente para la misma consulta
 * @param {Object} params - Parámetros de búsqueda
 * @returns {string} - Hash de consulta
 */
function generateQueryHash(params) {
  // Crear una cadena ordenada con los parámetros clave
  const keyParams = [
    params.query || '',
    params.keyword || '',
    params.priceResult?.min || '',
    params.priceResult?.max || '',
    params.sort || '',
    params.categories || ''
  ].join('_');
  
  // Crear un hash simple
  let hash = 0;
  for (let i = 0; i < keyParams.length; i++) {
    hash = ((hash << 5) - hash) + keyParams.charCodeAt(i);
    hash |= 0; // Convertir a entero de 32 bits
  }
  
  // Convertir a string positivo y añadir timestamp del día (para que sea consistente durante una sesión)
  const dayTimestamp = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return `q${Math.abs(hash)}_${dayTimestamp}`;
}

module.exports = {
  API_BASE_URL,
  CAT_RESULTS_ENDPOINT,
  SESSION_INFO_ENDPOINT,
  COMMON_HEADERS,
  setupRequestInterception,
  buildRequestHeaders,
  buildResultsPayload
}; 