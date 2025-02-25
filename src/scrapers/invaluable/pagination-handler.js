/**
 * Módulo para manejar la paginación avanzada en Invaluable
 * Enfocado en llamadas API directas sin navegación por HTML
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
    
    // Eliminar propiedades que pueden causar problemas
    // como partitionKey, sameSite, etc.
    return safeCookie;
  });
}

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
  
  // Sanitizar las cookies iniciales para evitar errores
  let cookieState = sanitizeCookies([...initialCookies]);
  
  console.log('Iniciando paginación por API directa...');

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.67 Safari/537.36'
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
      }
    });
    
    // En lugar de setCookie (que causa problemas), ahora usamos headers de Cookie directamente
    
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
    
    // Capturar las cookies después de establecer el contexto
    const updatedCookies = await page.cookies();
    if (updatedCookies && updatedCookies.length > 0) {
      // Sanitizar las cookies para evitar problemas
      cookieState = sanitizeCookies(updatedCookies);
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
          requestId: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          clientType: 'web'
        };
        
        console.log(`Enviando solicitud POST a /catResults para página ${pageNum}...`);
        
        // Realizar la solicitud API directamente
        // Pasar las cookies como string en el contexto de la función para evitar problemas de serialización
        const cookieString = cookieState.map(c => `${c.name}=${c.value}`).join('; ');
        
        const results = await page.evaluate(async (endpoint, payload, cookieHeader) => {
          try {
            const response = await fetch('/catResults', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookieHeader
              },
              body: JSON.stringify(payload),
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error(`Error HTTP: ${response.status}`);
            }
            
            return await response.json();
          } catch (error) {
            console.error('Error en solicitud fetch:', error.message);
            return null;
          }
        }, '/catResults', payload, cookieString);
        
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
          
          // Reintentar con un enfoque alternativo
          if (pageNum === 2 && failedPages.length === 1) {
            console.log('⚠️ Probando enfoque alternativo para paginación...');
            
            // Usar un enfoque diferente con solicitudes GET
            console.log('Intentando acceder a la página a través de URL...');
            const pageUrl = constructSearchUrl({...params, page: pageNum});
            
            try {
              // Navegar directamente a la URL de la página
              await page.goto(pageUrl, { waitUntil: 'networkidle2' });
              
              // Esperar para dar tiempo a que cargue la página
              await randomWait(2000, 3000);
              
              // Intentar extraer los resultados del DOM o buscar la respuesta de la API
              const alternativeResults = await page.evaluate(async () => {
                // Intentar buscar la variable de datos en el DOM
                const scripts = document.querySelectorAll('script');
                for (let script of scripts) {
                  const content = script.textContent || '';
                  if (content.includes('window.__INITIAL_STATE__')) {
                    try {
                      // Extraer los datos del estado inicial
                      const match = content.match(/window\.__INITIAL_STATE__\s*=\s*({.*});/);
                      if (match && match[1]) {
                        const state = JSON.parse(match[1]);
                        return state.search || state.pageData || state;
                      }
                    } catch (e) {
                      console.error('Error al parsear estado:', e);
                    }
                  }
                }
                return null;
              });
              
              if (alternativeResults && (alternativeResults.lots || alternativeResults.results)) {
                // Convertir al formato esperado
                console.log('✅ Enfoque alternativo exitoso: Datos extraídos de la página');
                
                // Determinar la fuente y formato de los datos
                const items = alternativeResults.lots || 
                             (alternativeResults.results && alternativeResults.results[0] && 
                             alternativeResults.results[0].hits) || [];
                
                // Añadir los resultados al acumulado
                if (items.length > 0) {
                  console.log(`Recuperados ${items.length} resultados`);
                  
                  if (!allResults.results[0].hits) {
                    allResults.results[0].hits = [];
                  }
                  
                  allResults.results[0].hits = [
                    ...allResults.results[0].hits,
                    ...items
                  ];
                  
                  totalItems += items.length;
                  successfulPages.push(pageNum);
                  failedPages.pop(); // Quitar esta página de las fallidas
                }
              }
            } catch (error) {
              console.error('Error en enfoque alternativo:', error.message);
            }
          }
        }
        
        // Actualizar cookies después de cada solicitud exitosa
        if (successfulPages.includes(pageNum)) {
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