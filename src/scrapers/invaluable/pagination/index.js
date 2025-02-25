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

/**
 * Maneja la paginación para la búsqueda en Invaluable
 * @param {Object} browser - Instancia del navegador
 * @param {Object} params - Parámetros de búsqueda
 * @param {Object} firstPageResults - Resultados de la primera página
 * @param {Array} initialCookies - Cookies iniciales
 * @param {number} maxPages - Número máximo de páginas a procesar
 * @param {Object} config - Configuración adicional
 * @returns {Promise<Array>} - Array con todos los resultados
 */
async function handlePagination(browser, params, firstPageResults, initialCookies, maxPages = 100, config = {}) {
  console.log('🔄 Iniciando manejo de paginación');
  
  // Inicializar variables para almacenar resultados y estado
  const allResults = [];
  const processedIds = new Set();
  const successfulPages = new Set([1]); // La página 1 ya está procesada
  const failedPages = new Set();
  
  // Sanitizar cookies iniciales
  const cookiesState = sanitizeCookies(initialCookies || []);
  
  // Extraer parámetros de navegación de los resultados de la primera página
  const { refId, searchContext, searcher } = extractNavigationParams(firstPageResults);
  
  // Estado de navegación centralizado
  const navState = {
    refId,
    searchContext,
    searcher,
    cookies: cookiesState,
    baseUrl: API_BASE_URL
  };
  
  // Procesar los resultados de la primera página
  if (firstPageResults && firstPageResults.hits) {
    processPageResults(firstPageResults, allResults, processedIds);
  } else {
    console.warn('❌ Los resultados de la primera página no contienen hits válidos');
    return [];
  }
  
  // Extraer metadatos de los resultados
  const { totalItems, totalPages } = extractResultsMetadata(firstPageResults);
  
  // Calcular cuántas páginas procesar (basado en el mínimo entre maxPages y totalPages)
  const pagesToProcess = Math.min(maxPages, totalPages || 1);
  console.log(`Procesando ${pagesToProcess} páginas en total (de un total de ${totalPages || 'desconocido'})`);
  
  // Si solo hay una página, devolver resultados directamente
  if (pagesToProcess <= 1) {
    console.log('Solo hay una página de resultados, finalizando');
    return allResults;
  }
  
  // Crear una nueva pestaña para las solicitudes API
  const page = await browser.newPage();
  
  try {
    // Navegar a Invaluable para establecer cookies
    await page.goto('https://www.invaluable.com', { waitUntil: 'domcontentloaded' });
    
    // Extraer refId y searchContext del estado inicial si es necesario
    if (!navState.refId || !navState.searchContext) {
      const initialStateParams = await extractFromInitialState(page);
      if (initialStateParams.refId) navState.refId = initialStateParams.refId;
      if (initialStateParams.searchContext) navState.searchContext = initialStateParams.searchContext;
      if (initialStateParams.searcher) navState.searcher = initialStateParams.searcher;
    }
    
    // Configurar interceptación de solicitudes
    await setupRequestInterception(page, navState, 1, async (response, status) => {
      // Este callback se llamará cuando se reciba una respuesta API
    });
    
    // Procesar páginas restantes (2 en adelante)
    for (let pageNum = 2; pageNum <= pagesToProcess; pageNum++) {
      // Evitar procesamiento redundante
      if (successfulPages.has(pageNum)) {
        console.log(`Página ${pageNum} ya procesada, saltando`);
        continue;
      }
      
      console.log(`\n----- Procesando página ${pageNum} de ${pagesToProcess} -----`);
      
      try {
        // Si la página ha fallado anteriormente, esperar más tiempo
        if (failedPages.has(pageNum)) {
          const waitTime = 2000 + (failedPages.size * 500);
          console.log(`Reintentando página ${pageNum} después de ${waitTime}ms`);
          await page.waitForTimeout(waitTime);
        }
        
        // Solicitar info de sesión para mantener cookies frescas
        const sessionInfoResponse = await requestSessionInfo(page, navState);
        if (sessionInfoResponse) {
          console.log('Información de sesión actualizada correctamente');
        }
        
        // Esperar un poco entre solicitudes para evitar detección
        await page.waitForTimeout(500 + Math.random() * 500);
        
        // Solicitar resultados de la página actual
        const pageResults = await requestPageResults(page, pageNum, params, navState);
        
        // Actualizar cookies después de la solicitud
        navState.cookies = await updateCookiesAfterRequest(page, navState.cookies, pageNum);
        
        // Procesar resultados obtenidos
        if (pageResults && pageResults.hits) {
          const { newResults, duplicates } = processPageResults(pageResults, allResults, processedIds);
          
          // Verificar si hay resultados diferentes
          const hasDifferentResults = checkIfDifferentResults(pageResults.hits, processedIds);
          
          if (hasDifferentResults) {
            successfulPages.add(pageNum);
            failedPages.delete(pageNum); // Eliminar de fallidos si estaba
          } else {
            console.warn(`❌ Página ${pageNum} no contiene resultados diferentes, posible problema de paginación`);
          }
          
          // Verificar si debemos continuar
          if (!shouldContinueProcessing(allResults, totalItems, config.maxResults || 0)) {
            console.log('Finalizando paginación tempranamente debido a límites alcanzados');
            break;
          }
        } else {
          console.error(`❌ Error al procesar la página ${pageNum}: formato de respuesta inválido`);
          failedPages.add(pageNum);
        }
      } catch (error) {
        console.error(`❌ Error en la página ${pageNum}: ${error.message}`);
        failedPages.add(pageNum);
        
        // Esperar un poco más en caso de error
        await page.waitForTimeout(2000);
      }
    }
  } catch (error) {
    console.error(`Error general durante la paginación: ${error.message}`);
  } finally {
    // Cerrar la pestaña
    await page.close();
    
    console.log(`\n===== Resultados finales =====`);
    console.log(`✅ Total de resultados obtenidos: ${allResults.length}`);
    console.log(`✅ Páginas procesadas con éxito: ${successfulPages.size}`);
    console.log(`❌ Páginas con errores: ${failedPages.size}`);
  }
  
  return allResults;
}

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
    
    if (response && response.hits) {
      console.log(`✅ Obtenidos ${response.hits.length} resultados para la página ${pageNum}`);
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
  requestSessionInfo,
  requestPageResults,
  makeApiRequest
}; 