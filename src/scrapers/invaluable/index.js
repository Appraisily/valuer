const BrowserManager = require('./browser');

const NAVIGATION_TIMEOUT = 30000;

class InvaluableScraper {
  constructor() {
    this.browser = new BrowserManager();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      console.log('Scraper already initialized');
      return;
    }

    try {
      console.log('Initializing browser...');
      await this.browser.initialize();
      this.initialized = true;
      console.log('Browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async close() {
    if (this.initialized) {
      try {
        await this.browser.close();
        this.initialized = false;
        console.log('Browser closed successfully');
      } catch (error) {
        console.error('Error closing browser:', error);
        throw error;
      }
    }
  }

  constructSearchUrl(params = {}) {
    const baseUrl = 'https://www.invaluable.com/search';
    const searchParams = new URLSearchParams();

    // Handle nested price range parameters
    if (params.priceResult) {
      if (params.priceResult.min) {
        searchParams.append('priceResult[min]', params.priceResult.min);
      }
      if (params.priceResult.max) {
        searchParams.append('priceResult[max]', params.priceResult.max);
      }
    }
    
    // Add required furniture search parameters
    searchParams.append('upcoming', 'false');
    searchParams.append('query', params.query || 'furniture');
    searchParams.append('keyword', params.keyword || params.query || 'furniture');
    
    // Handle pagination parameters
    if (params.page && !isNaN(params.page)) {
      searchParams.append('page', params.page);
    }
    
    // Add all provided parameters
    Object.entries(params).forEach(([key, value]) => {
      // Skip parameters we already set
      if (value !== undefined && value !== null && 
          !['upcoming', 'query', 'keyword', 'priceResult', 'page'].includes(key)) {
        searchParams.append(key, value);
      }
    });

    return `${baseUrl}?${searchParams.toString()}`;
  }

  async search(params = {}, cookies = []) {
    if (!this.initialized) {
      throw new Error('Scraper not initialized. Call initialize() first');
    }

    try {
      console.log('Iniciando búsqueda en Invaluable');
      
      const url = this.constructSearchUrl(params);
      console.log('URL de búsqueda:', url);
      
      const page = await this.browser.createTab('search');
      let catResults = null;
      let updatedCookies = [];
      
      try {
        // Set up API interception
        await page.setRequestInterception(true);
        
        // Track if we've found results
        let foundResults = false;
        let maxAttempts = 3;
        let attempts = 0;
        
        // Validar y formatear las cookies
        let formattedCookies = [];
        if (cookies && Array.isArray(cookies)) {
          // Usar las cookies proporcionadas si son un array válido
          formattedCookies = cookies.filter(c => c && c.name && c.value);
          console.log(`Usando ${formattedCookies.length} cookies proporcionadas`);
        } else if (cookies && typeof cookies === 'string') {
          // Intentar parsear si es una cadena JSON
          try {
            const parsedCookies = JSON.parse(cookies);
            if (Array.isArray(parsedCookies)) {
              formattedCookies = parsedCookies.filter(c => c && c.name && c.value);
            }
            console.log(`Parseadas ${formattedCookies.length} cookies desde string`);
          } catch (e) {
            console.warn('Error al parsear string de cookies:', e.message);
          }
        }
        
        // Asegurarse de que tenemos las cookies críticas
        const hasCfClearance = formattedCookies.some(c => c.name === 'cf_clearance');
        const hasAZToken = formattedCookies.some(c => c.name === 'AZTOKEN-PROD');
        
        if (!hasCfClearance || !hasAZToken) {
          console.warn('Faltan cookies críticas. Usando valores predeterminados.');
          // Añadir cookies predeterminadas si faltan
          if (!hasCfClearance) {
            formattedCookies.push({
              name: 'cf_clearance',
              value: params.cf_clearance || 'Yq4QHU.y14z93vU3CmLCK80CU7Pq6pgupmW0eM8k548-1738320515-1.2.1.1-ZFXBFgIPHghfvwwfhRbZx27.6zPihqfQ4vGP0VY1v66mKc.wwAOVRiRJhK6ouVt_.wMB30bkeY0r9NK.KUTU4gu7GzZxbyh0EH_gE36kcnHDvGATrI_vFs9y1XHq3PgtlHmBUflqgjcS6x9MC5YpXoeELPYiT0k59IPMn..1cHED7zV6T78hILKinjM6hZ.ZeQwetIN6SPmuvXb7V2z2ddJa64Vg_zUi.euce0SjjJr5ti7tHWoFsTV1DO1MkFwDfUpy1yTCdESho.EwyRgfdfRAlx6njkTmlWNkp1aXcXU',
              domain: '.invaluable.com'
            });
          }
          if (!hasAZToken) {
            formattedCookies.push({
              name: 'AZTOKEN-PROD',
              value: params.aztoken || '4F562873-F229-4346-A846-37E9A451FA9E',
              domain: '.invaluable.com'
            });
          }
        }
        
        // Almacenar las cookies iniciales para comparación posterior
        const initialCookies = [...formattedCookies];
        
        // Intercept catResults response
        page.on('response', async response => {
          const responseUrl = response.url();
          if (responseUrl.includes('catResults') && response.status() === 200) {
            console.log('Interceptada respuesta catResults');
            try {
              const text = await response.text();
              catResults = JSON.parse(text);
              if (catResults && catResults.results && catResults.results[0].hits) {
                const hits = catResults.results[0].hits;
                console.log(`Encontrados ${hits.length} resultados`);
                foundResults = true;
              }
            } catch (error) {
              console.error('Error al parsear catResults:', error.message);
              console.log('Texto de respuesta sin procesar:', text.substring(0, 200) + '...');
            }
          }
        });
        
        // Handle requests
        page.on('request', request => {
          try {
            const reqUrl = request.url();
            const headers = request.headers();
            
            // Añadir cookies a todos los requests
            if (formattedCookies && formattedCookies.length > 0) {
              headers['Cookie'] = formattedCookies.map(c => `${c.name}=${c.value}`).join('; ');
            }
            
            if (reqUrl.includes('catResults')) {
              headers['Accept'] = 'application/json';
              headers['Content-Type'] = 'application/json';
              console.log('Mejorando solicitud catResults con headers específicos');
            }
            
            // Bloquear recursos innecesarios para reducir la probabilidad de detección
            if (request.resourceType() === 'image' || 
                request.resourceType() === 'stylesheet' || 
                request.resourceType() === 'font' ||
                request.resourceType() === 'media' ||
                reqUrl.includes('google') ||
                reqUrl.includes('analytics') ||
                reqUrl.includes('facebook') ||
                reqUrl.includes('ads')) {
              request.abort();
              return;
            }
            
            request.continue({ headers });
          } catch (error) {
            if (!error.message.includes('Request is already handled')) {
              console.error('Error en manejo de solicitud:', error);
            }
            request.continue();
          }
        });

        // Set cookies
        if (formattedCookies && formattedCookies.length > 0) {
          await page.setCookie(...formattedCookies);
        }
        
        // Attempt navigation with retries
        while (attempts < maxAttempts && !foundResults) {
          attempts++;
          console.log(`Intento de navegación ${attempts} de ${maxAttempts}`);
          
          try {
            // Navigate to search URL
            await page.goto(url, {
              waitUntil: 'networkidle2', 
              timeout: NAVIGATION_TIMEOUT
            });
            
            // Handle potential Cloudflare challenge
            await this.browser.handleProtection();
            
            // Wait specifically for API call to complete
            await page.waitForResponse(
              response => response.url().includes('catResults') && response.status() === 200,
              { timeout: NAVIGATION_TIMEOUT }
            ).catch(err => console.log('No se detectó respuesta catResults en el tiempo límite'));
            
            // If we already intercepted results, we're done
            if (foundResults) break;
            
            // Try to manually trigger search request if no results yet
            if (!foundResults) {
              console.log('Intentando activar manualmente la solicitud API de búsqueda...');
              await page.evaluate(async (searchUrl) => {
                // Try to extract search parameters
                const url = new URL(searchUrl);
                const params = {};
                for (const [key, value] of url.searchParams.entries()) {
                  params[key] = value;
                }
                
                // Attempt to manually trigger API call
                try {
                  const response = await fetch('/api/v2/search/catResults', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                      params: params
                    })
                  });
                  console.log('Estado de llamada API manual:', response.status);
                } catch (error) {
                  console.log('Falló la llamada API manual:', error);
                }
              }, url);
              
              // Give time for the manual request to complete
              await page.waitForTimeout(5000);
            }
          } catch (error) {
            console.error(`El intento de navegación ${attempts} falló:`, error.message);
            // Wait before retrying
            await page.waitForTimeout(2000);
          }
        }
        
        // Capturar las cookies actualizadas después de la navegación
        updatedCookies = await page.cookies();
        
        // Verificar si las cookies han cambiado
        const hasCookiesChanged = JSON.stringify(initialCookies) !== JSON.stringify(updatedCookies);
        if (hasCookiesChanged) {
          console.log('Las cookies han sido actualizadas durante la navegación');
          
          // Identificar las cookies críticas actualizadas
          const newCfClearance = updatedCookies.find(c => c.name === 'cf_clearance');
          if (newCfClearance) {
            console.log('Nueva cookie cf_clearance encontrada');
          }
          
          const newAZToken = updatedCookies.find(c => c.name === 'AZTOKEN-PROD');
          if (newAZToken) {
            console.log('Nueva cookie AZTOKEN-PROD encontrada');
          }
        } else {
          console.log('No se detectaron cambios en las cookies');
        }
        
        // Añadir las cookies actualizadas a los resultados
        if (catResults) {
          catResults.cookies = updatedCookies;
        }
        
        return catResults;
        
      } finally {
        await this.browser.closeTab('search');
      }
      
    } catch (error) {
      console.error('Error de búsqueda:', error);
      throw error;
    }
  }

  async searchAllPages(params = {}, cookies = [], maxPages = 10) {
    if (!this.initialized) {
      throw new Error('Scraper not initialized. Call initialize() first');
    }

    try {
      console.log('Iniciando búsqueda paginada para todos los resultados');
      
      // Variables para almacenar resultados y estado
      let allResults = null;
      let totalItems = 0;
      let totalPagesFound = 1;
      let successfulPages = [];
      let cookieState = cookies;
      
      // Inicializar con la primera página
      console.log(`Obteniendo página 1...`);
      const firstPageParams = { ...params, page: 1 };
      const firstPageResults = await this.search(firstPageParams, cookieState);
      
      // Si no hay resultados en la primera página, terminar
      if (!firstPageResults || !firstPageResults.results || !firstPageResults.results[0] || !firstPageResults.results[0].hits) {
        console.log('No se encontraron resultados válidos en la primera página, finalizando la paginación');
        return firstPageResults;
      }
      
      // Guardar los resultados de la primera página
      allResults = JSON.parse(JSON.stringify(firstPageResults));
      let firstPageHitsCount = firstPageResults.results[0].hits.length;
      console.log(`Se encontraron ${firstPageHitsCount} resultados en la página 1`);
      successfulPages.push(1);
      
      // MEJORA 1: Extracción de metadatos para calcular número total de páginas
      if (firstPageResults.results[0].meta && firstPageResults.results[0].meta.totalHits) {
        const totalHits = firstPageResults.results[0].meta.totalHits;
        totalPagesFound = Math.ceil(totalHits / 96); // 96 es el tamaño estándar de página
        console.log(`Total de hits reportados: ${totalHits}, total estimado de páginas: ${totalPagesFound}`);
        totalPagesFound = Math.min(totalPagesFound, maxPages);
      } else {
        console.log('No se encontraron metadatos de totalHits, usando maxPages como límite');
        totalPagesFound = maxPages;
      }
      
      // MEJORA 4: Extraer y preservar cookies actualizadas si están disponibles
      if (firstPageResults.cookies && firstPageResults.cookies.length > 0) {
        cookieState = firstPageResults.cookies;
        console.log(`Se obtuvieron ${cookieState.length} cookies actualizadas de la primera página`);
      }
      
      // Si hay menos del tamaño normal de página (96) o 0 elementos, hemos terminado
      if (firstPageHitsCount < 96 || firstPageHitsCount === 0 || totalPagesFound <= 1) {
        console.log(`Solo hay una página de resultados o se alcanzó el límite`);
        return allResults;
      }
      
      // Crear todas las promesas de búsqueda para las páginas 2 a totalPagesFound
      const pagePromises = [];
      
      for (let page = 2; page <= totalPagesFound; page++) {
        // Breve espera aleatoria para simular comportamiento humano
        const randomWait = 500 + Math.floor(Math.random() * 1000);
        await new Promise(resolve => setTimeout(resolve, randomWait));
        
        console.log(`Obteniendo página ${page}...`);
        const pageParams = { ...params, page };
        
        // Añadir la promesa de búsqueda para esta página utilizando las cookies actualizadas
        pagePromises.push(this.search(pageParams, cookieState)
          .then(pageResult => {
            if (pageResult && pageResult.results && pageResult.results[0] && pageResult.results[0].hits) {
              const hitsCount = pageResult.results[0].hits.length;
              console.log(`Se encontraron ${hitsCount} resultados en la página ${page}`);
              
              // MEJORA 4: Actualizar cookies si hay nuevas
              if (pageResult.cookies && pageResult.cookies.length > 0) {
                cookieState = pageResult.cookies;
                console.log(`Cookies actualizadas desde la página ${page}`);
              }
              
              successfulPages.push(page);
              return pageResult;
            }
            console.log(`No se encontraron resultados válidos en la página ${page}`);
            return null;
          })
          .catch(err => {
            console.error(`Error al obtener la página ${page}:`, err);
            return null;
          })
        );
      }
      
      // Ejecutar todas las búsquedas en paralelo (con límite inteligente para no sobrecargar)
      // Podemos limitar la concurrencia a un máximo de 2 para reducir la probabilidad de detección
      const concurrencyLimit = 2;
      const pageResults = [];
      
      for (let i = 0; i < pagePromises.length; i += concurrencyLimit) {
        const batch = pagePromises.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(batch);
        pageResults.push(...batchResults);
        
        // Espera breve entre lotes
        if (i + concurrencyLimit < pagePromises.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Combinar todos los resultados
      for (let i = 0; i < pageResults.length; i++) {
        const pageResult = pageResults[i];
        if (pageResult && pageResult.results && pageResult.results[0] && pageResult.results[0].hits) {
          allResults.results[0].hits = [
            ...allResults.results[0].hits,
            ...pageResult.results[0].hits
          ];
        }
      }
      
      // Actualizar los metadatos para reflejar el número total de resultados
      if (allResults.results[0]) {
        totalItems = allResults.results[0].hits.length;
        console.log(`Paginación completa. Elementos totales recolectados: ${totalItems}`);
        console.log(`Páginas exitosas: ${successfulPages.join(', ')}`);
        
        if (allResults.results[0].meta) {
          allResults.results[0].meta.totalHits = totalItems;
          allResults.results[0].meta.pagesRetrieved = successfulPages;
        }
      }
      
      // Añadir información sobre el estado final de las cookies
      if (cookieState && cookieState.length > 0) {
        allResults.finalCookies = cookieState;
      }
      
      return allResults;
    } catch (error) {
      console.error('Error durante la búsqueda paginada:', error);
      throw error;
    }
  }
}

module.exports = InvaluableScraper;