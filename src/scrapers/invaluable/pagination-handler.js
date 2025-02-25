/**
 * Módulo para manejar la paginación avanzada en Invaluable
 * Enfocado en llamadas API directas sin navegación por HTML
 * Utiliza el sistema refId para mantener continuidad entre páginas
 */
const { extractMetadata, randomWait, detectCookieChanges } = require('./utils');
const { constructSearchUrl } = require('./url-builder');

/**
 * Filtra y limpia las cookies para evitar problemas de serialización
 * @param {Array} cookies - Array de cookies a limpiar
 * @returns {Array} - Array de cookies filtradas y seguras
 */
function sanitizeCookies(cookies) {
  if (!cookies || !Array.isArray(cookies)) return [];
  
  return cookies.map(cookie => {
    // Crear una nueva cookie con solo las propiedades necesarias
    const safeCookie = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.invaluable.com',
      path: cookie.path || '/',
      expires: cookie.expires || -1,
      httpOnly: !!cookie.httpOnly,
      secure: !!cookie.secure,
      session: !!cookie.session
    };
    
    return safeCookie;
  });
}

/**
 * Maneja la paginación completa para obtener todos los resultados
 * usando llamadas API directas con sistema refId para continuidad
 * @param {Object} browser - Instancia del gestor de navegador
 * @param {Object} params - Parámetros de búsqueda
 * @param {Object} firstPageResults - Resultados de la primera página
 * @param {Array} initialCookies - Cookies iniciales
 * @param {number} maxPages - Máximo número de páginas a recuperar
 * @param {Object} config - Configuración
 * @returns {Object} Resultados paginados completos
 */
async function handlePagination(browser, params, firstPageResults, initialCookies = [], maxPages = 10, config = {}) {
  // Variables para almacenar resultados y estado
  let allResults = JSON.parse(JSON.stringify(firstPageResults));
  let totalItems = firstPageResults.results?.[0]?.hits?.length || 0;
  let successfulPages = [1]; // La página 1 ya se ha recuperado con éxito
  let failedPages = [];
  
  // Variables para el sistema refId de continuidad
  let lastRefId = null;
  let searchContext = null;
  let searcher = null;
  let sequence = 1; // Iniciamos en 1 porque la primera página ya se obtuvo
  
  // Extraer refId y searchContext del resultado de la primera página
  if (firstPageResults.refId) {
    lastRefId = firstPageResults.refId;
    console.log(`✅ Obtenido refId inicial: ${lastRefId}`);
  }
  
  if (firstPageResults.searchContext) {
    searchContext = firstPageResults.searchContext;
    console.log(`✅ Obtenido searchContext inicial: ${JSON.stringify(searchContext).substring(0, 50)}...`);
  }
  
  if (firstPageResults.searcher) {
    searcher = firstPageResults.searcher;
    console.log(`✅ Obtenido searcher inicial`);
  }
  
  // Si no tenemos refId, buscarlo en la estructura de datos
  if (!lastRefId && firstPageResults.results && firstPageResults.results[0]) {
    // A veces el refId está en los resultados o en alguna propiedad anidada
    const result = firstPageResults.results[0];
    if (result.refId) {
      lastRefId = result.refId;
      console.log(`✅ Obtenido refId de results[0]: ${lastRefId}`);
    } else if (result.meta && result.meta.refId) {
      lastRefId = result.meta.refId;
      console.log(`✅ Obtenido refId de meta: ${lastRefId}`);
    }
  }
  
  // Sanitizar las cookies iniciales para evitar errores
  let cookieState = sanitizeCookies([...initialCookies]);
  
  console.log('Iniciando paginación por API directa con sistema refId...');

  // Si hay cookies actualizadas en la primera página, usarlas
  if (firstPageResults.cookies && firstPageResults.cookies.length > 0) {
    cookieState = sanitizeCookies(firstPageResults.cookies);
    console.log(`Se obtuvieron ${cookieState.length} cookies actualizadas de la primera página`);
  }
  
  // Extraer metadatos para calcular el número total de páginas
  const metadata = extractMetadata(firstPageResults, maxPages, config.DEFAULT_HITS_PER_PAGE);
  let totalPagesFound = metadata.totalPages;
  
  // Si hay solo una página o no hay resultados válidos, terminar
  if (totalPagesFound <= 1 || totalItems === 0) {
    console.log(`Solo hay una página de resultados o se alcanzó el límite`);
    allResults.finalCookies = cookieState;
    allResults.pagesRetrieved = successfulPages;
    allResults.totalPagesFound = totalPagesFound;
    return allResults;
  }
  
  // Crear una pestaña para las solicitudes API
  const page = await browser.createTab('apiTab');
  
  try {
    console.log(`Preparando conexión para llamadas API directas a /catResults. Total páginas: ${totalPagesFound}`);
    
    // Configurar interceptación de solicitudes
    await page.setRequestInterception(true);
    
    // Almacenar información de la última respuesta
    let lastResponseData = null;
    
    // Optimizar la interceptación para que sea más liviana y solo enfocada en API
    page.on('request', request => {
      const url = request.url();
      const method = request.method();
      
      // Permitir solo solicitudes a dominios de Invaluable para API
      if (url.includes('invaluable.com')) {
        // Para solicitudes POST a catResults, modificar headers
        if (method === 'POST' && url.includes('catResults')) {
          const headers = {
            ...request.headers(),
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://www.invaluable.com/search',
            'Origin': 'https://www.invaluable.com'
          };
          
          // Añadir cookies al header en lugar de usar setCookie
          if (cookieState && cookieState.length > 0) {
            const cookieString = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
            headers['Cookie'] = cookieString;
            console.log(`Añadiendo ${cookieState.length} cookies a la solicitud`);
          }
          
          request.continue({ headers });
        } 
        // Para otras solicitudes necesarias para establecer el contexto
        else if (
          url.includes('/search') || 
          url.includes('/session-info') || 
          url.includes('/api/v2/')
        ) {
          const headers = request.headers();
          
          // Añadir cookies a estas solicitudes también
          if (cookieState && cookieState.length > 0) {
            const cookieString = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
            headers['Cookie'] = cookieString;
          }
          
          request.continue({ headers });
        } 
        // Bloquear recursos no esenciales
        else {
          request.abort();
        }
      } else {
        request.abort();
      }
    });
    
    // Almacenar respuestas de la API
    page.on('response', async response => {
      const url = response.url();
      const status = response.status();
      
      // Capturar específicamente las respuestas de la API de catResults
      if (url.includes('catResults') && status === 200) {
        try {
          const text = await response.text();
          const data = JSON.parse(text);
          lastResponseData = data;
          console.log(`Respuesta API interceptada: ${text.length} bytes`);
          
          // Extraer y actualizar refId y searchContext de cada respuesta
          if (data.refId) {
            lastRefId = data.refId;
            console.log(`RefId actualizado en interceptor: ${lastRefId}`);
          }
          
          if (data.searchContext) {
            searchContext = data.searchContext;
            console.log(`SearchContext actualizado en interceptor`);
          }
          
          if (data.searcher) {
            searcher = data.searcher;
            console.log(`Searcher actualizado en interceptor`);
          }
          
        } catch (error) {
          console.error(`Error al parsear respuesta API: ${error.message}`);
        }
      }
      
      // Capturar respuestas de session-info para obtener cookies críticas
      if (url.includes('session-info') && status === 200) {
        console.log('Capturada respuesta de session-info');
        try {
          const text = await response.text();
          console.log(`Session info: ${text.length} bytes`);
        } catch (error) {
          // Ignorar errores al leer la respuesta
        }
      }
      
      // Registrar errores de API
      if ((url.includes('catResults') || url.includes('session-info')) && status !== 200) {
        console.error(`Error en API ${url}: Status ${status}`);
        try {
          const text = await response.text();
          console.error(`Respuesta de error: ${text.substring(0, 200)}`);
        } catch (error) {
          // Ignorar errores al leer la respuesta
        }
      }
    });
    
    // Establecer url base para evaluar
    const baseSearchUrl = constructSearchUrl({...params, page: 1});
    await page.goto(baseSearchUrl, { 
      waitUntil: 'networkidle2',
      timeout: config.NAVIGATION_TIMEOUT || 30000
    });
    
    // 1. Primero obtener la info de sesión actualizada
    console.log('Solicitando información de sesión inicial...');
    
    const sessionInfo = await page.evaluate(async () => {
      try {
        const response = await fetch('/boulder/session-info', {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.error(`Error en session-info: ${response.status}`);
          return null;
        }
        
        return await response.json();
      } catch (error) {
        console.error('Error al obtener información de sesión:', error.message);
        return null;
      }
    });
    
    if (sessionInfo) {
      console.log('✅ Información de sesión inicial obtenida correctamente');
      
      // Extraer datos importantes de sessionInfo si están disponibles
      if (sessionInfo.userId) {
        console.log(`UserId de sesión: ${sessionInfo.userId}`);
      }
    }
    
    // Capturar las cookies después de session-info
    const initialSessionCookies = await page.cookies();
    if (initialSessionCookies && initialSessionCookies.length > 0) {
      cookieState = sanitizeCookies(initialSessionCookies);
      console.log(`Cookies actualizadas después de obtener información de sesión: ${cookieState.length} cookies`);
    }
    
    // 2. Obtener estado inicial de la aplicación si está disponible
    let initialState = null;
    try {
      initialState = await page.evaluate(() => {
        if (window.__INITIAL_STATE__) {
          return window.__INITIAL_STATE__;
        }
        return null;
      });
      
      if (initialState) {
        console.log('✅ Estado inicial de la aplicación capturado');
        
        // Extraer más información del estado inicial si está disponible
        if (initialState.search && !searchContext) {
          searchContext = initialState.search.searchContext || initialState.search;
          console.log('Contexto de búsqueda extraído del estado inicial');
        }
        
        if (initialState.session && initialState.session.id) {
          console.log(`ID de sesión del estado inicial: ${initialState.session.id}`);
        }
        
        // Extraer searcher del estado si está disponible
        if (initialState.search && initialState.search.searcher && !searcher) {
          searcher = initialState.search.searcher;
          console.log(`Searcher extraído del estado inicial`);
        }
      }
    } catch (error) {
      console.log('No se pudo obtener el estado inicial:', error.message);
    }
    
    // Esperar un poco antes de iniciar la paginación
    await randomWait(1000, 2000);
    
    // 3. Procesar las páginas restantes con llamadas API directas
    for (let pageNum = 2; pageNum <= totalPagesFound; pageNum++) {
      console.log(`\n----- Procesando página ${pageNum} de ${totalPagesFound} -----`);
      
      // Si ya hemos intentado esta página antes y falló, usar una espera más larga
      const isRetry = failedPages.includes(pageNum);
      
      try {
        // Espera variable para simular comportamiento humano
        await randomWait(isRetry ? 4000 : 2000, isRetry ? 7000 : 5000);
        
        // Primero hacer una solicitud para actualizar session-info antes de cada página
        console.log('Solicitando actualización de session-info...');
        const updatedSessionInfo = await page.evaluate(async () => {
          try {
            const response = await fetch('/boulder/session-info', {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              },
              credentials: 'include'
            });
            
            if (!response.ok) {
              return { error: response.status };
            }
            
            return await response.json();
          } catch (error) {
            return { error: error.message };
          }
        });
        
        if (updatedSessionInfo && !updatedSessionInfo.error) {
          console.log('Session-info actualizada correctamente');
        } else {
          console.log(`Error en session-info: ${updatedSessionInfo?.error || 'desconocido'}`);
        }
        
        // Espera corta después de session-info
        await randomWait(300, 600);
        
        // Incrementar secuencia para trackear orden de solicitudes
        sequence++;
        
        // Construir payload optimizado con refId y searchContext para continuidad
        const searchParams = { ...params, page: pageNum };
        delete searchParams.cookies;
        
        // Crear un payload completo similar al que usaría el navegador real
        const payload = {
          params: searchParams,
          timestamp: Date.now(),
          requestId: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          clientType: 'web',
          sequence: sequence
        };
        
        // Añadir refId y searchContext si existen
        if (lastRefId) {
          payload.refId = lastRefId;
        }
        
        if (searchContext) {
          payload.searchContext = searchContext;
        }
        
        if (searcher) {
          payload.searcher = searcher;
        }
        
        console.log(`Enviando solicitud POST a /catResults para página ${pageNum}...`);
        if (lastRefId) {
          console.log(`Con refId: ${lastRefId.substring(0, 15)}... y sequence: ${sequence}`);
        } else {
          console.log(`Sin refId disponible, usando sequence: ${sequence}`);
        }
        
        // Pasar las cookies como string en el contexto de la función para evitar problemas de serialización
        const cookieString = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
        
        // Hacer la solicitud con manejo de errores mejorado
        const results = await page.evaluate(async (payload, cookieHeader) => {
          try {
            console.log('Realizando fetch a /catResults con payload');
            
            const response = await fetch('/catResults', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.invaluable.com/search',
                'Origin': 'https://www.invaluable.com',
                'Cookie': cookieHeader
              },
              body: JSON.stringify(payload),
              credentials: 'include'
            });
            
            // Registrar detalles de la respuesta para diagnóstico
            const status = response.status;
            const statusText = response.statusText;
            const contentType = response.headers.get('Content-Type');
            
            if (!response.ok) {
              return { 
                error: true, 
                status, 
                statusText,
                message: `Error HTTP: ${status} ${statusText}`,
                contentType
              };
            }
            
            const data = await response.json();
            
            // Registrar la presencia de refId en la respuesta
            if (data.refId) {
              console.log(`Respuesta contiene refId`);
            }
            
            return data;
          } catch (error) {
            console.error('Error en solicitud fetch:', error.message);
            return { error: true, message: error.message };
          }
        }, payload, cookieString);
        
        // Si hay un error en la respuesta, registrarlo y continuar
        if (results && results.error) {
          console.error(`Error en la solicitud: ${results.message}`);
          console.error(`Status: ${results.status}, Content-Type: ${results.contentType}`);
          
          // Marcar esta página como fallida y continuar con la siguiente
          if (!failedPages.includes(pageNum)) {
            failedPages.push(pageNum);
          }
          
          if (isRetry) {
            console.log(`Se ha alcanzado el máximo de intentos para la página ${pageNum}`);
          }
          
          // Intentar obtener nuevas cookies
          const refreshedCookies = await page.cookies();
          if (refreshedCookies.length > 0) {
            cookieState = sanitizeCookies(refreshedCookies);
            console.log(`Cookies refrescadas después de error: ${cookieState.length} cookies`);
          }
          
          continue;
        }
        
        // Verificar resultados (primero de la variable results, luego de lastResponseData como respaldo)
        const pageResults = results || lastResponseData;
        
        // Actualizar refId y searchContext si están presentes en los resultados
        if (pageResults) {
          if (pageResults.refId) {
            lastRefId = pageResults.refId;
            console.log(`★ RefId actualizado: ${lastRefId.substring(0, 15)}...`);
          }
          
          if (pageResults.searchContext) {
            searchContext = pageResults.searchContext;
            console.log(`★ SearchContext actualizado`);
          }
          
          if (pageResults.searcher) {
            searcher = pageResults.searcher;
            console.log(`★ Searcher actualizado`);
          }
        }
        
        // Comprobar si tenemos hits válidos
        if (pageResults && pageResults.results && pageResults.results[0] && pageResults.results[0].hits) {
          const hits = pageResults.results[0].hits;
          console.log(`✅ Página ${pageNum}: ${hits.length} resultados encontrados`);
          
          // Verificar si los resultados son diferentes a los anteriores
          const isDifferentPage = checkIfDifferentResults(allResults.results[0].hits, hits);
          if (isDifferentPage) {
            console.log(`✅ Confirmado: Los resultados de la página ${pageNum} son diferentes`);
            
            // Añadir los resultados al conjunto acumulado
            allResults.results[0].hits = [
              ...allResults.results[0].hits,
              ...hits
            ];
            
            totalItems += hits.length;
            
            // Si esta página estaba marcada como fallida, eliminarla de esa lista
            if (failedPages.includes(pageNum)) {
              failedPages = failedPages.filter(p => p !== pageNum);
            }
            
            // Añadir a páginas exitosas si no estaba ya
            if (!successfulPages.includes(pageNum)) {
              successfulPages.push(pageNum);
            }
          } else {
            console.log(`⚠️ Advertencia: Los resultados de la página ${pageNum} parecen ser duplicados`);
            
            // Marcar como página fallida si no estaba en la lista
            if (!failedPages.includes(pageNum)) {
              failedPages.push(pageNum);
            }
            
            // Esperar más tiempo antes de intentar la siguiente página
            await randomWait(3000, 5000);
          }
        } else {
          console.log(`❌ Página ${pageNum}: No se obtuvieron resultados válidos`);
          
          // Marcar como página fallida si no estaba en la lista
          if (!failedPages.includes(pageNum)) {
            failedPages.push(pageNum);
          }
        }
        
        // Actualizar cookies después de cada solicitud
        try {
          const currentCookies = await page.cookies();
          if (currentCookies && currentCookies.length > 0) {
            // Sanitizar las cookies antes de usarlas
            const newCookieState = sanitizeCookies(currentCookies);
            
            const cookiesChanged = detectCookieChanges(cookieState, newCookieState);
            if (cookiesChanged) {
              cookieState = newCookieState;
              console.log(`Cookies actualizadas después de la página ${pageNum} (${cookieState.length} cookies)`);
            }
          }
        } catch (error) {
          console.error(`Error al actualizar cookies: ${error.message}`);
          // Continuar con las cookies actuales
        }
        
      } catch (error) {
        console.error(`Error al procesar la página ${pageNum}:`, error.message);
        
        // Marcar como página fallida si no estaba en la lista
        if (!failedPages.includes(pageNum)) {
          failedPages.push(pageNum);
        }
        
        // Espera más larga después de un error
        await randomWait(5000, 8000);
      }
    }
    
  } finally {
    // Cerrar la pestaña de API
    await browser.closeTab('apiTab');
  }
  
  // Actualizar metadatos
  if (allResults.results && allResults.results[0]) {
    const finalHitsCount = allResults.results[0].hits.length;
    console.log(`\n===== Paginación completa =====`);
    console.log(`Total de elementos recolectados: ${finalHitsCount}`);
    console.log(`Páginas exitosas: ${successfulPages.join(', ')}`);
    console.log(`Páginas fallidas: ${failedPages.length > 0 ? failedPages.join(', ') : 'Ninguna'}`);
    
    // Actualizar el contador de totalHits en los metadatos
    if (allResults.results[0].meta) {
      allResults.results[0].meta.totalHits = finalHitsCount;
    }
  }
  
  // Añadir información adicional al resultado final
  allResults.pagesRetrieved = successfulPages;
  allResults.failedPages = failedPages;
  allResults.totalPagesFound = totalPagesFound;
  allResults.totalItemsCollected = totalItems;
  allResults.finalCookies = cookieState;
  
  return allResults;
}

/**
 * Comprueba si los nuevos resultados son diferentes a los anteriores
 * @param {Array} existingHits - Resultados actuales
 * @param {Array} newHits - Nuevos resultados
 * @returns {boolean} - true si son diferentes, false si son iguales o muy similares
 */
function checkIfDifferentResults(existingHits, newHits) {
  if (!existingHits || !newHits || existingHits.length === 0 || newHits.length === 0) {
    return true;
  }
  
  // Verificar si hay diferencia en los IDs
  const existingIds = new Set(existingHits.map(hit => hit.objectID || hit.lotId || hit.id));
  const newIdsCount = newHits.filter(hit => !existingIds.has(hit.objectID || hit.lotId || hit.id)).length;
  
  // Si al menos el 10% de los IDs son nuevos, consideramos que es una página diferente
  const differentPercentage = (newIdsCount / newHits.length) * 100;
  console.log(`Porcentaje de resultados diferentes: ${differentPercentage.toFixed(2)}%`);
  
  return differentPercentage >= 10;
}

module.exports = {
  handlePagination
}; 