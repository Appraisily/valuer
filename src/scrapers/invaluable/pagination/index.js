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
 * @returns {Promise<Object>} - Objeto con todos los resultados y metadatos
 */
async function handlePagination(browser, params, firstPageResults, initialCookies, maxPages = 100, config = {}) {
  console.log('🔄 Iniciando manejo de paginación');
  
  // Inicializar variables para almacenar resultados y estado
  const allResults = JSON.parse(JSON.stringify(firstPageResults)); // Copia profunda para preservar estructura
  const processedIds = new Set();
  const successfulPages = new Set([1]); // La página 1 ya está procesada
  const failedPages = new Set();
  
  // Sanitizar cookies iniciales o usar las cookies recibidas en la respuesta
  let cookiesState;
  if (firstPageResults && firstPageResults.cookies && firstPageResults.cookies.length > 0) {
    cookiesState = sanitizeCookies(firstPageResults.cookies);
    console.log(`Usando ${cookiesState.length} cookies de la respuesta inicial`);
  } else {
    cookiesState = sanitizeCookies(initialCookies || []);
    console.log(`Usando ${cookiesState.length} cookies iniciales proporcionadas`);
  }
  
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
  // Adaptamos para manejar la estructura de Invaluable donde los hits están en results[0].hits
  const firstPageHits = firstPageResults.results?.[0]?.hits;
  if (firstPageHits && Array.isArray(firstPageHits)) {
    // Procesar directamente los resultados de la primera página
    firstPageHits.forEach(item => {
      const itemId = item.lotId || item.id || JSON.stringify(item);
      if (!processedIds.has(itemId)) {
        processedIds.add(itemId);
      }
    });
    console.log(`Procesados ${firstPageHits.length} resultados de la primera página`);
  } else {
    console.warn('❌ Los resultados de la primera página no contienen hits válidos');
    return firstPageResults; // Devolver los resultados originales sin modificar
  }
  
  // Extraer metadatos de los resultados
  // Adaptado para la estructura específica de Invaluable
  let totalItems = 0;
  let totalPages = 0;
  
  if (firstPageResults.results?.[0]?.meta?.totalHits) {
    totalItems = firstPageResults.results[0].meta.totalHits;
    const hitsPerPage = firstPageResults.results[0].meta.hitsPerPage || firstPageHits.length;
    totalPages = Math.ceil(totalItems / hitsPerPage);
    console.log(`Metadatos: ${totalItems} elementos en ${totalPages} páginas (tamaño de página: ${hitsPerPage})`);
  } else {
    // Fallback: usar el length de los hits y maxPages
    totalItems = firstPageHits ? firstPageHits.length : 0;
    totalPages = maxPages;
    console.log(`No se encontraron metadatos completos. Usando totalItems=${totalItems}, totalPages=${totalPages}`);
  }
  
  // Calcular cuántas páginas procesar (basado en el mínimo entre maxPages y totalPages)
  const pagesToProcess = Math.min(maxPages, totalPages || 1);
  console.log(`Procesando ${pagesToProcess} páginas en total (de un total de ${totalPages || 'desconocido'})`);
  
  // Si solo hay una página, devolver resultados directamente
  if (pagesToProcess <= 1) {
    console.log('Solo hay una página de resultados, finalizando');
    return allResults;
  }
  
  // Crear una nueva pestaña para las solicitudes API
  const page = await browser.createTab('paginationTab');
  
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
        // Adaptado para la estructura específica de Invaluable
        if (pageResults && pageResults.results && pageResults.results[0]?.hits) {
          const pageHits = pageResults.results[0].hits;
          let newResults = 0;
          let duplicates = 0;
          
          // Procesar cada hit y añadir a los resultados acumulados
          pageHits.forEach(item => {
            const itemId = item.lotId || item.id || JSON.stringify(item);
            if (!processedIds.has(itemId)) {
              allResults.results[0].hits.push(item);
              processedIds.add(itemId);
              newResults++;
            } else {
              duplicates++;
            }
          });
          
          console.log(`✅ Resultados agregados: ${newResults} nuevos, ${duplicates} duplicados, total acumulado: ${allResults.results[0].hits.length}`);
          
          // Verificar si hay resultados diferentes
          const hasDifferentResults = newResults > 0;
          
          if (hasDifferentResults) {
            successfulPages.add(pageNum);
            failedPages.delete(pageNum); // Eliminar de fallidos si estaba
          } else {
            console.warn(`❌ Página ${pageNum} no contiene resultados diferentes, posible problema de paginación`);
          }
          
          // Actualizar metadatos en el resultado acumulado
          if (allResults.results[0].meta) {
            allResults.results[0].meta.totalHits = allResults.results[0].hits.length;
          }
          
          // Verificar si debemos continuar
          const maxResults = config.maxResults || 0;
          const reachedTotalItems = allResults.results[0].hits.length >= totalItems;
          const reachedMaxResults = maxResults > 0 && allResults.results[0].hits.length >= maxResults;
          
          if (reachedTotalItems || reachedMaxResults) {
            const reason = reachedTotalItems ? 'total de items' : 'límite máximo configurado';
            console.log(`Finalizando paginación tempranamente: alcanzado ${reason}`);
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
    await browser.closeTab('paginationTab');
    
    // Añadir información de paginación al resultado
    allResults.pagesRetrieved = Array.from(successfulPages);
    allResults.failedPages = Array.from(failedPages);
    allResults.totalPagesFound = totalPages;
    allResults.finalCookies = navState.cookies;
    
    console.log(`\n===== Resultados finales =====`);
    console.log(`✅ Total de resultados obtenidos: ${allResults.results[0].hits.length}`);
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
  requestSessionInfo,
  requestPageResults,
  makeApiRequest
}; 