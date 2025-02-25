/**
 * Módulo para manejar la paginación avanzada en Invaluable
 * Enfocado en llamadas API directas sin navegación por HTML
 */
const { extractMetadata, randomWait, detectCookieChanges } = require('./utils');
const { constructSearchUrl } = require('./url-builder');

/**
 * Maneja la paginación completa para obtener todos los resultados
 * usando llamadas API directas
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
  let cookieState = [...initialCookies];
  
  console.log('Iniciando paginación por API directa...');

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
  
  // Crear una pestaña para las solicitudes API
  const page = await browser.createTab('apiTab');
  
  try {
    console.log(`Preparando conexión para llamadas API directas a /catResults. Total páginas: ${totalPagesFound}`);
    
    // Configurar interceptación de solicitudes
    await page.setRequestInterception(true);
    
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
            'sec-ch-ua': '"Not A;Brand";v="99", "Chromium";v="101", "Google Chrome";v="101"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.67 Safari/537.36'
          };
          
          // Añadir cookies al header
          if (cookieState && cookieState.length > 0) {
            headers['Cookie'] = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
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
            headers['Cookie'] = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
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
    let lastResponse = null;
    page.on('response', async response => {
      const url = response.url();
      
      // Capturar específicamente las respuestas de la API de catResults
      if (url.includes('catResults') && response.status() === 200) {
        try {
          const text = await response.text();
          lastResponse = JSON.parse(text);
          console.log(`Respuesta API interceptada: ${text.length} bytes`);
        } catch (error) {
          console.error(`Error al parsear respuesta API: ${error.message}`);
        }
      }
      
      // Capturar respuestas de session-info para obtener cookies críticas
      if (url.includes('session-info') && response.status() === 200) {
        console.log('Capturada respuesta de session-info');
        // Actualizar cookies después de esta llamada
        const updatedCookies = await page.cookies();
        if (updatedCookies && updatedCookies.length > 0) {
          cookieState = updatedCookies;
        }
      }
    });
    
    // Establecer cookies iniciales
    if (cookieState && cookieState.length > 0) {
      await page.setCookie(...cookieState);
    }
    
    // 1. Primero establecer el contexto navegando a la URL de búsqueda principal
    const url = constructSearchUrl({...params, page: 1});
    console.log('Estableciendo contexto inicial en:', url);
    
    await page.goto(url, {
      waitUntil: 'networkidle2', 
      timeout: config.NAVIGATION_TIMEOUT || 30000
    });
    
    // Verificar y manejar posible protección Cloudflare
    await browser.handleProtection();
    
    // 2. Solicitar la info de sesión para asegurar que tenemos cookies válidas
    console.log('Solicitando información de sesión...');
    
    try {
      const sessionInfo = await page.evaluate(async () => {
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
      });
      
      if (sessionInfo) {
        console.log('Información de sesión obtenida correctamente');
      }
    } catch (error) {
      console.error('Error al obtener información de sesión:', error.message);
    }
    
    // Actualizar cookies después de obtener la info de sesión
    const updatedCookies = await page.cookies();
    if (updatedCookies && updatedCookies.length > 0) {
      cookieState = updatedCookies;
      console.log(`Cookies actualizadas después de obtener información de sesión: ${cookieState.length} cookies`);
    }
    
    // 3. Procesar las páginas restantes con llamadas API directas
    for (let pageNum = 2; pageNum <= totalPagesFound; pageNum++) {
      console.log(`\n----- Procesando página ${pageNum} de ${totalPagesFound} -----`);
      
      try {
        // Espera variable para simular comportamiento humano
        await randomWait(2000, 5000);
        
        // Construir payload optimizado para la solicitud POST
        const searchParams = { ...params, page: pageNum };
        delete searchParams.cookies;
        
        // Añadir parámetros específicos para que la solicitud sea más auténtica
        const payload = {
          params: searchParams,
          timestamp: Date.now(),
          // Añadir un fingerprint único para cada solicitud
          requestId: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          clientType: 'web'
        };
        
        console.log(`Enviando solicitud POST a /catResults para página ${pageNum}...`);
        
        // Realizar la solicitud API directamente
        const endpoint = '/catResults';
        const results = await page.evaluate(async (endpoint, payload) => {
          try {
            console.log(`Fetch a ${endpoint} con datos:`, JSON.stringify(payload).substring(0, 100) + '...');
            
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
              },
              body: JSON.stringify(payload),
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error(`Error HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
          } catch (error) {
            console.error('Error en solicitud fetch:', error.message);
            return null;
          }
        }, endpoint, payload);
        
        // Verificar resultados (primero de la variable results, luego de lastResponse como respaldo)
        const pageResults = results || lastResponse;
        
        if (pageResults && pageResults.results && pageResults.results[0] && pageResults.results[0].hits) {
          const hits = pageResults.results[0].hits;
          console.log(`✅ Página ${pageNum}: ${hits.length} resultados encontrados`);
          
          // Añadir los resultados al conjunto acumulado
          allResults.results[0].hits = [
            ...allResults.results[0].hits,
            ...hits
          ];
          
          totalItems += hits.length;
          successfulPages.push(pageNum);
        } else {
          console.log(`❌ Página ${pageNum}: No se obtuvieron resultados válidos`);
          failedPages.push(pageNum);
          
          // Verificar si se trata de un problema de autenticación/sesión
          if (pageNum === 2 && failedPages.length === 1) {
            console.log('⚠️ Detectado posible problema de sesión en la primera página adicional');
            console.log('Intentando restablecer la sesión antes de continuar...');
            
            // Navegar nuevamente a la página principal y esperar a que se cargue completamente
            await page.goto(url, { waitUntil: 'networkidle2' });
            await browser.handleProtection();
            await randomWait(3000, 6000);
            
            // Intentar obtener información de sesión de nuevo
            try {
              await page.evaluate(async () => {
                await fetch('/boulder/session-info', {
                  method: 'GET',
                  credentials: 'include'
                });
              });
              
              // Actualizar cookies después de restablecer la sesión
              const refreshedCookies = await page.cookies();
              if (refreshedCookies && refreshedCookies.length > 0) {
                cookieState = refreshedCookies;
                console.log('Cookies actualizadas después de restablecer sesión');
              }
              
              // Reintentamos la misma página
              pageNum--; // Para que el ciclo intente la misma página de nuevo
              continue;
            } catch (error) {
              console.error('Error al restablecer sesión:', error.message);
            }
          }
        }
        
        // Actualizar cookies después de cada solicitud exitosa
        if (successfulPages.includes(pageNum)) {
          const currentCookies = await page.cookies();
          if (currentCookies && currentCookies.length > 0) {
            const cookiesChanged = detectCookieChanges(cookieState, currentCookies);
            if (cookiesChanged) {
              cookieState = currentCookies;
              console.log(`Cookies actualizadas después de la página ${pageNum}`);
            }
          }
        }
        
      } catch (error) {
        console.error(`Error al procesar la página ${pageNum}:`, error.message);
        failedPages.push(pageNum);
        
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

module.exports = {
  handlePagination
}; 