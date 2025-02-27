/**
 * Módulo para manejar la interceptación de solicitudes HTTP durante la paginación
 */
const { extractFromApiResponse } = require('./navigation-params');

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
const getTimestamp = () => new Date().toISOString();
const formatElapsedTime = (startTime) => {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
  return `${(elapsed/60000).toFixed(2)}min`;
};

/**
 * Configura la interceptación de solicitudes para la paginación
 * @param {Object} page - Instancia de la página
 * @param {Object} navState - Estado de navegación actual
 * @param {number} pageNum - Número de página actual
 * @param {Function} onApiResponse - Callback para manejar respuestas API
 * @returns {Promise<boolean>} - Estado de éxito
 */
async function setupRequestInterception(page, navState, pageNum, onApiResponse) {
  console.log(`[${getTimestamp()}] 🔍 Setting up request interception for page ${pageNum}`);
  const startTime = Date.now();
  
  try {
    await page.setRequestInterception(true);
    
    // Clear any existing listeners
    await page.removeAllListeners('request');
    
    // Set up the request listener
    page.on('request', async (request) => {
      const url = request.url();
      
      // Skip non-fetch requests
      if (request.resourceType() !== 'fetch') {
        request.continue();
        return;
      }
      
      // Log API requests
      if (url.includes(CAT_RESULTS_ENDPOINT)) {
        console.log(`[${getTimestamp()}] 📡 Intercepted results API request for page ${pageNum}`);
        
        // Get request body and modify for page
        const requestBody = request.postData();
        if (requestBody) {
          try {
            const requestStartTime = Date.now();
            console.log(`[${getTimestamp()}] 🔄 Processing API request for page ${pageNum}`);
            
            // Continue with the request
            request.continue();
            
            // Wait for the response
            const [response] = await Promise.all([
              page.waitForResponse(res => res.url().includes(CAT_RESULTS_ENDPOINT)),
              page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
            ]);
            
            if (response) {
              console.log(`[${getTimestamp()}] ✅ Received API response for page ${pageNum} (status ${response.status()})`);
              
              try {
                const jsonResponse = await response.json();
                navState.lastResponse = jsonResponse;
                
                // Extract result statistics
                const hits = jsonResponse?.results?.[0]?.hits || [];
                const meta = jsonResponse?.results?.[0]?.meta || {};
                
                console.log(`[${getTimestamp()}] 📊 Page ${pageNum} results: ${hits.length} hits, page ${meta.page || pageNum} of ${Math.ceil((meta.totalHits || 0) / (meta.hitsPerPage || 96))}`);
                
                // Extraer parámetros de navegación de la respuesta
                const extractedParams = extractFromApiResponse(jsonResponse);
                
                // Actualizar el estado de navegación con los parámetros extraídos
                if (extractedParams.refId) navState.refId = extractedParams.refId;
                if (extractedParams.searchContext) navState.searchContext = extractedParams.searchContext;
                if (extractedParams.searcher) navState.searcher = extractedParams.searcher;
                
                // Llamar al callback con la respuesta JSON
                if (onApiResponse) {
                  await onApiResponse(jsonResponse, response.status());
                }
                
                // Log timing information
                const requestElapsed = Date.now() - requestStartTime;
                console.log(`[${getTimestamp()}] ⏱️ API request processed in ${formatElapsedTime(requestStartTime)} (${requestElapsed}ms)`);
              } catch (error) {
                console.error(`[${getTimestamp()}] ❌ Error parsing API response for page ${pageNum}: ${error.message}`);
                navState.lastResponse = null;
                
                if (onApiResponse) {
                  await onApiResponse(null, response.status());
                }
              }
            } else {
              console.error(`[${getTimestamp()}] ❌ No API response received for page ${pageNum}`);
              navState.lastResponse = null;
              
              if (onApiResponse) {
                await onApiResponse(null, 0);
              }
            }
          } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Error processing request: ${error.message}`);
            request.continue();
          }
        } else {
          console.log(`[${getTimestamp()}] ⚠️ No request body found for page ${pageNum}`);
          request.continue();
        }
      } else if (url.includes('/dist/') || url.includes('/static/')) {
        // Bloquear recursos estáticos para mejorar rendimiento
        request.abort();
      } else {
        // Otras solicitudes a invaluable.com continúan normalmente
        request.continue();
      }
    });
    
    const elapsed = Date.now() - startTime;
    console.log(`[${getTimestamp()}] ✅ Request interception setup completed in ${formatElapsedTime(startTime)} (${elapsed}ms)`);
    return true;
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ Error setting up request interception: ${error.message}`);
    return false;
  }
}

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