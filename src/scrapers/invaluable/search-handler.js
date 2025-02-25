/**
 * Módulo para manejar las búsquedas en Invaluable
 */
const { formatCookies, detectCookieChanges } = require('./utils');

/**
 * Maneja una solicitud de búsqueda completa
 * @param {Object} browser - Instancia del gestor de navegador
 * @param {string} url - URL de búsqueda
 * @param {Object} params - Parámetros de búsqueda
 * @param {Array} cookies - Cookies iniciales
 * @param {Object} config - Configuración
 * @returns {Object} Resultados de la búsqueda
 */
async function handleSearch(browser, url, params = {}, cookies = [], config = {}) {
  console.log('URL de búsqueda:', url);
  
  const page = await browser.createTab('search');
  let catResults = null;
  let updatedCookies = [];
  
  try {
    // Configurar interceptación de API
    await page.setRequestInterception(true);
    
    // Control de seguimiento de resultados
    let foundResults = false;
    let maxAttempts = 3;
    let attempts = 0;
    
    // Formatear las cookies
    const formattedCookies = formatCookies(cookies, params);
    
    // Almacenar las cookies iniciales para comparación posterior
    const initialCookies = [...formattedCookies];
    
    // Interceptar la respuesta de catResults
    page.on('response', async response => {
      const responseUrl = response.url();
      if (responseUrl.includes('catResults') && response.status() === 200) {
        console.log('Interceptada respuesta catResults');
        try {
          const text = await response.text();
          catResults = JSON.parse(text);
          if (catResults && catResults.results && catResults.results[0] && catResults.results[0].hits) {
            const hits = catResults.results[0].hits;
            console.log(`Encontrados ${hits.length} resultados`);
            foundResults = true;
          }
        } catch (error) {
          console.error('Error al parsear catResults:', error.message);
          console.log('Texto de respuesta sin procesar:', text ? text.substring(0, 200) + '...' : 'vacío');
        }
      }
    });
    
    // Manejar solicitudes
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

    // Establecer cookies
    if (formattedCookies && formattedCookies.length > 0) {
      await page.setCookie(...formattedCookies);
    }
    
    // Intentar navegación con reintentos
    while (attempts < maxAttempts && !foundResults) {
      attempts++;
      console.log(`Intento de navegación ${attempts} de ${maxAttempts}`);
      
      try {
        // Navegar a la URL de búsqueda
        await page.goto(url, {
          waitUntil: 'networkidle2', 
          timeout: config.NAVIGATION_TIMEOUT || 30000
        });
        
        // Manejar posible desafío de Cloudflare
        await browser.handleProtection();
        
        // Esperar específicamente a que se complete la llamada a la API
        await page.waitForResponse(
          response => response.url().includes('catResults') && response.status() === 200,
          { timeout: config.NAVIGATION_TIMEOUT || 30000 }
        ).catch(err => console.log('No se detectó respuesta catResults en el tiempo límite'));
        
        // Si ya interceptamos resultados, hemos terminado
        if (foundResults) break;
        
        // Intentar activar manualmente la solicitud de búsqueda si aún no hay resultados
        if (!foundResults) {
          console.log('Intentando activar manualmente la solicitud API de búsqueda...');
          await page.evaluate(async (searchUrl) => {
            // Extraer parámetros de búsqueda
            const url = new URL(searchUrl);
            const params = {};
            for (const [key, value] of url.searchParams.entries()) {
              params[key] = value;
            }
            
            // Intentar activar manualmente la llamada a la API
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
          
          // Dar tiempo para que se complete la solicitud manual
          await page.waitForTimeout(5000);
        }
      } catch (error) {
        console.error(`El intento de navegación ${attempts} falló:`, error.message);
        // Esperar antes de reintentar
        await page.waitForTimeout(2000);
      }
    }
    
    // Capturar las cookies actualizadas después de la navegación
    updatedCookies = await page.cookies();
    
    // Verificar si las cookies han cambiado
    detectCookieChanges(initialCookies, updatedCookies);
    
    // Añadir las cookies actualizadas a los resultados
    if (catResults) {
      catResults.cookies = updatedCookies;
    }
    
    return catResults;
    
  } finally {
    await browser.closeTab('search');
  }
}

module.exports = {
  handleSearch
}; 