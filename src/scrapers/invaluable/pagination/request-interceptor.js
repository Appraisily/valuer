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

/**
 * Configura la interceptación de solicitudes para la paginación
 * @param {Object} page - Instancia de la página
 * @param {Object} navState - Estado de navegación actual
 * @param {number} pageNum - Número de página actual
 * @param {Function} onApiResponse - Callback para manejar respuestas API
 * @returns {Promise<void>}
 */
async function setupRequestInterception(page, navState, pageNum, onApiResponse) {
  await page.setRequestInterception(true);
  
  page.on('request', async (req) => {
    const url = req.url();
    
    // Solo interceptar solicitudes a invaluable.com
    if (url.includes('invaluable.com')) {
      // Para solicitudes a la API, modificar o ajustar según sea necesario
      if (url.includes(CAT_RESULTS_ENDPOINT) || url.includes(SESSION_INFO_ENDPOINT)) {
        console.log(`📤 Solicitud interceptada a ${url}`);
        
        // Si tenemos cookies, añadirlas a la solicitud
        if (navState.cookies && navState.cookies.length > 0) {
          const headers = {
            ...req.headers(),
            'Cookie': navState.cookies.map(c => `${c.name}=${c.value}`).join('; ')
          };
          
          // Continuar con los headers modificados
          req.continue({ headers });
        } else {
          // Continuar normalmente
          req.continue();
        }
      } else if (url.includes('/dist/') || url.includes('/static/')) {
        // Bloquear recursos estáticos para mejorar rendimiento
        req.abort();
      } else {
        // Otras solicitudes a invaluable.com continúan normalmente
        req.continue();
      }
    } else {
      // Todas las solicitudes que no son a invaluable.com
      req.continue();
    }
  });
  
  // Capturar las respuestas
  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    
    // Solo procesar respuestas JSON de invaluable.com
    if (url.includes('invaluable.com') && contentType.includes('application/json')) {
      try {
        const text = await response.text();
        
        // Intenta parsear la respuesta como JSON
        try {
          const json = JSON.parse(text);
          console.log(`📥 Respuesta JSON de ${url} (${status})`);
          
          // Si es una respuesta de los endpoints que nos interesan
          if (url.includes(CAT_RESULTS_ENDPOINT)) {
            console.log(`Respuesta de catResults para página ${pageNum} recibida (${status})`);
            
            if (status === 200) {
              // Extraer parámetros de navegación de la respuesta
              const extractedParams = extractFromApiResponse(json);
              
              // Actualizar el estado de navegación con los parámetros extraídos
              if (extractedParams.refId) navState.refId = extractedParams.refId;
              if (extractedParams.searchContext) navState.searchContext = extractedParams.searchContext;
              if (extractedParams.searcher) navState.searcher = extractedParams.searcher;
              
              // Llamar al callback con la respuesta JSON
              if (onApiResponse) {
                onApiResponse(json, status);
              }
            } else {
              console.error(`Error al obtener resultados (${status}): ${text}`);
            }
          } else if (url.includes(SESSION_INFO_ENDPOINT)) {
            console.log(`Respuesta de session-info para página ${pageNum} recibida (${status})`);
            
            if (status === 200) {
              // Intentar extraer refId y searchContext de la respuesta
              const extractedParams = extractFromApiResponse(json);
              
              // Actualizar el estado de navegación con los parámetros extraídos
              if (extractedParams.refId && !navState.refId) navState.refId = extractedParams.refId;
              if (extractedParams.searchContext && !navState.searchContext) navState.searchContext = extractedParams.searchContext;
            }
          }
        } catch (error) {
          console.error(`Error al parsear respuesta JSON: ${error.message}`);
        }
      } catch (err) {
        console.error(`Error al leer respuesta: ${err.message}`);
      }
    }
  });
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
  const payload = {
    q: params.query || '',
    keyword: params.keyword || '',
    productId: params.productId || 0,
    pageNum: pageNum,
    pageSize: params.pageSize || 48,
    isBack: false
  };
  
  // Añadir refId si está disponible
  if (navState.refId) {
    payload.refId = navState.refId;
    console.log(`Usando refId para página ${pageNum}: ${navState.refId}`);
  } else {
    console.log(`Sin refId disponible, usando sequence: ${pageNum}`);
  }
  
  // Añadir searchContext si está disponible
  if (navState.searchContext) {
    payload.searchContext = navState.searchContext;
    console.log(`Usando searchContext para página ${pageNum}: ${navState.searchContext}`);
  }
  
  // Añadir searcher si está disponible
  if (navState.searcher) {
    payload.searcher = navState.searcher;
    console.log(`Usando searcher para página ${pageNum}: ${navState.searcher}`);
  }
  
  return payload;
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