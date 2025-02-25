/**
 * Módulo para manejar la paginación avanzada en Invaluable
 */
const { extractMetadata, randomWait, detectCookieChanges } = require('./utils');
const { constructSearchUrl } = require('./url-builder');

/**
 * Maneja la paginación completa para obtener todos los resultados
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
  let totalItems = firstPageResults.results[0].hits.length;
  let successfulPages = [1]; // La página 1 ya se ha recuperado con éxito
  let failedPages = [];
  let cookieState = [...initialCookies];
  
  // Si hay cookies actualizadas en la primera página, usarlas
  if (firstPageResults.cookies && firstPageResults.cookies.length > 0) {
    cookieState = firstPageResults.cookies;
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
  
  // Crear una pestaña para la paginación POST
  const page = await browser.createTab('paginationTab');
  
  try {
    // Configuración inicial de la página
    await page.setRequestInterception(true);
    
    // Manejar las solicitudes
    page.on('request', request => {
      if (request.url().includes('invaluable.com')) {
        const headers = request.headers();
        
        // Añadir cookies a todos los requests
        if (cookieState && cookieState.length > 0) {
          headers['Cookie'] = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
        }
        
        request.continue({ headers });
      } else {
        request.abort();
      }
    });
    
    // Establecer cookies
    if (cookieState && cookieState.length > 0) {
      await page.setCookie(...cookieState);
    }
    
    // Navegar a la página de búsqueda principal primero para establecer contexto
    const url = constructSearchUrl(params);
    console.log('Navegando a la URL de búsqueda para establecer contexto:', url);
    await page.goto(url, {
      waitUntil: 'networkidle2', 
      timeout: config.NAVIGATION_TIMEOUT || 30000
    });
    
    // Manejar protección de Cloudflare si es necesario
    await browser.handleProtection();
    
    // Procesar páginas restantes mediante solicitudes POST
    for (let pageNum = 2; pageNum <= totalPagesFound; pageNum++) {
      try {
        // Breve espera aleatoria para simular comportamiento humano
        await randomWait(2000, 5000);
        
        console.log(`Obteniendo página ${pageNum} mediante solicitud POST a /catResults...`);
        
        // Construir payload para la solicitud POST
        // Adaptamos los parámetros de búsqueda para la solicitud POST
        const searchParams = {
          ...params,
          page: pageNum
        };
        
        // Eliminar parámetros que no son necesarios en el POST
        delete searchParams.cookies;
        
        const payload = {
          params: searchParams,
          timestamp: Date.now()
        };
        
        // Ejecutar la solicitud POST en el contexto de la página
        const results = await page.evaluate(async (payload) => {
          try {
            const response = await fetch('/catResults', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error: ${response.status}`);
            }
            
            return await response.json();
          } catch (error) {
            console.error('Error en la solicitud POST:', error);
            return null;
          }
        }, payload);
        
        // Verificar si obtuvimos resultados válidos
        if (results && results.results && results.results[0] && results.results[0].hits) {
          const hitsCount = results.results[0].hits.length;
          console.log(`Se encontraron ${hitsCount} resultados en la página ${pageNum}`);
          
          // Añadir los hits a los resultados acumulados
          allResults.results[0].hits = [
            ...allResults.results[0].hits,
            ...results.results[0].hits
          ];
          
          // Actualizar el conteo total
          totalItems += hitsCount;
          successfulPages.push(pageNum);
          
          // Actualizar cookies después de cada solicitud
          const updatedCookies = await page.cookies();
          if (updatedCookies && updatedCookies.length > 0) {
            const cookiesChanged = detectCookieChanges(cookieState, updatedCookies);
            
            if (cookiesChanged) {
              cookieState = updatedCookies;
              console.log(`Cookies actualizadas desde la página ${pageNum} (${cookieState.length} cookies)`);
            }
          }
        } else {
          console.log(`No se obtuvieron resultados válidos para la página ${pageNum}`);
          failedPages.push(pageNum);
          
          // Si fallan dos páginas seguidas, podríamos estar bloqueados
          if (failedPages.length >= 2 && 
              failedPages[failedPages.length-1] === failedPages[failedPages.length-2] + 1) {
            console.warn('Detectadas dos páginas fallidas consecutivas, podríamos estar bloqueados. Esperando un tiempo más largo...');
            await randomWait(10000, 15000);
            
            // Intentar refrescar la sesión de navegación
            await page.reload({ waitUntil: 'networkidle2' });
            await browser.handleProtection();
          }
        }
        
      } catch (error) {
        console.error(`Error al procesar la página ${pageNum}:`, error.message);
        failedPages.push(pageNum);
      }
    }
    
  } finally {
    // Cerrar la pestaña de paginación
    await browser.closeTab('paginationTab');
  }
  
  // Actualizar los metadatos para reflejar el número total de resultados
  if (allResults.results[0]) {
    totalItems = allResults.results[0].hits.length;
    console.log(`Paginación completa. Elementos totales recolectados: ${totalItems}`);
    console.log(`Páginas exitosas: ${successfulPages.join(', ')}`);
    
    if (allResults.results[0].meta) {
      allResults.results[0].meta.totalHits = totalItems;
    }
  }
  
  // Añadir información adicional al resultado final
  allResults.pagesRetrieved = successfulPages;
  allResults.failedPages = failedPages;
  allResults.totalPagesFound = totalPagesFound;
  allResults.totalItemsCollected = totalItems;
  
  // Añadir información sobre el estado final de las cookies
  if (cookieState && cookieState.length > 0) {
    allResults.finalCookies = cookieState;
  }
  
  return allResults;
}

module.exports = {
  handlePagination
}; 