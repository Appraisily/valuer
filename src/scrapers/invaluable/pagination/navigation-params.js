/**
 * Módulo para extraer y gestionar parámetros de navegación para la paginación
 */

/**
 * Inspecciona un objeto para mostrar su estructura y valores clave
 * @param {Object} obj - Objeto a inspeccionar
 * @param {string} path - Ruta actual para el logging
 * @param {Array} foundKeys - Array para almacenar las claves encontradas
 * @returns {Array} - Información sobre claves importantes encontradas
 */
function inspectResponse(obj, path = '', foundKeys = []) {
  if (!obj || typeof obj !== 'object') return foundKeys;
  
  // Claves importantes que estamos buscando
  const importantKeys = ['refId', 'searchContext', 'searcher', 'session', 'pagination', 'searcherInfo'];

  Object.keys(obj).forEach(key => {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (importantKeys.includes(key)) {
      const value = typeof obj[key] === 'object' 
        ? JSON.stringify(obj[key]).substring(0, 100) + '...' 
        : obj[key];
      foundKeys.push({ key, path: currentPath, value });
    }
    
    // Recursivamente inspeccionar objetos anidados
    if (obj[key] && typeof obj[key] === 'object') {
      inspectResponse(obj[key], currentPath, foundKeys);
    }
  });
  
  return foundKeys;
}

/**
 * Extrae parámetros de navegación (refId, searchContext, searcher) de los resultados de la primera página
 * @param {Object} firstPageResults - Resultados de la primera página
 * @returns {Object} - Parámetros de navegación extraídos
 */
function extractNavigationParams(firstPageResults) {
  console.log('Extrayendo parámetros de navegación de los resultados de la primera página');
  
  let refId = null;
  let searchContext = null;
  let searcher = null;
  
  // Intentar extraer directamente de firstPageResults
  if (firstPageResults) {
    // Registrar información de depuración para ver la estructura completa
    const foundKeys = inspectResponse(firstPageResults);
    console.log('Claves importantes encontradas en firstPageResults:', foundKeys);

    // Verificar directamente en el objeto raíz
    if (firstPageResults.refId) {
      refId = firstPageResults.refId;
      console.log(`✅ refId encontrado directamente en firstPageResults: ${refId}`);
    } else if (firstPageResults.pagination && firstPageResults.pagination.refId) {
      refId = firstPageResults.pagination.refId;
      console.log(`✅ refId encontrado en firstPageResults.pagination: ${refId}`);
    } else if (firstPageResults.searcherInfo && firstPageResults.searcherInfo.refId) {
      refId = firstPageResults.searcherInfo.refId;
      console.log(`✅ refId encontrado en firstPageResults.searcherInfo: ${refId}`);
    }
    
    // Verificar en la estructura anidada results[0]
    if (!refId && firstPageResults.results && firstPageResults.results[0]) {
      const firstResult = firstPageResults.results[0];
      
      if (firstResult.refId) {
        refId = firstResult.refId;
        console.log(`✅ refId encontrado en firstPageResults.results[0]: ${refId}`);
      } else if (firstResult.pagination && firstResult.pagination.refId) {
        refId = firstResult.pagination.refId;
        console.log(`✅ refId encontrado en firstPageResults.results[0].pagination: ${refId}`);
      } else if (firstResult.searcherInfo && firstResult.searcherInfo.refId) {
        refId = firstResult.searcherInfo.refId;
        console.log(`✅ refId encontrado en firstPageResults.results[0].searcherInfo: ${refId}`);
      }
    }

    // Extraer searchContext (primero del objeto raíz, luego de results[0])
    if (firstPageResults.searchContext) {
      searchContext = firstPageResults.searchContext;
      console.log(`✅ searchContext encontrado: ${searchContext}`);
    } else if (firstPageResults.results && firstPageResults.results[0] && firstPageResults.results[0].searchContext) {
      searchContext = firstPageResults.results[0].searchContext;
      console.log(`✅ searchContext encontrado en results[0]: ${searchContext}`);
    }

    // Extraer searcher (primero del objeto raíz, luego de results[0])
    if (firstPageResults.searcher) {
      searcher = firstPageResults.searcher;
      console.log(`✅ searcher encontrado: ${searcher}`);
    } else if (firstPageResults.results && firstPageResults.results[0] && firstPageResults.results[0].searcher) {
      searcher = firstPageResults.results[0].searcher;
      console.log(`✅ searcher encontrado en results[0]: ${searcher}`);
    }
  }
  
  return { refId, searchContext, searcher };
}

/**
 * Extrae parámetros de navegación del estado inicial de la aplicación
 * @param {Object} page - Instancia de la página
 * @returns {Promise<Object>} - Parámetros extraídos del estado inicial
 */
async function extractFromInitialState(page) {
  try {
    console.log('Intentando extraer parámetros del estado inicial de la aplicación...');
    const initialState = await page.evaluate(() => {
      return window.__INITIAL_STATE__;
    });
    
    if (initialState) {
      console.log('Estado inicial capturado correctamente');
      
      // Inspeccionar el estado inicial para encontrar claves importantes
      const foundKeys = inspectResponse(initialState);
      console.log('Claves importantes encontradas en el estado inicial:', foundKeys);
      
      let refId = null;
      let searchContext = null;
      let searcher = null;
      
      // Extraer refId de posibles ubicaciones
      if (initialState.search && initialState.search.refId) {
        refId = initialState.search.refId;
      } else if (initialState.pagination && initialState.pagination.refId) {
        refId = initialState.pagination.refId;
      } else if (initialState.searcherInfo && initialState.searcherInfo.refId) {
        refId = initialState.searcherInfo.refId;
      }
      
      // Extraer searchContext
      if (initialState.search && initialState.search.searchContext) {
        searchContext = initialState.search.searchContext;
      } else if (initialState.searchContext) {
        searchContext = initialState.searchContext;
      }
      
      // Extraer searcher
      if (initialState.search && initialState.search.searcher) {
        searcher = initialState.search.searcher;
      } else if (initialState.searcher) {
        searcher = initialState.searcher;
      }
      
      if (refId) console.log(`✅ refId extraído del estado inicial: ${refId}`);
      if (searchContext) console.log(`✅ searchContext extraído del estado inicial: ${searchContext}`);
      if (searcher) console.log(`✅ searcher extraído del estado inicial: ${searcher}`);
      
      return { refId, searchContext, searcher };
    }
  } catch (error) {
    console.error(`Error al extraer estado inicial: ${error.message}`);
  }
  
  return { refId: null, searchContext: null, searcher: null };
}

/**
 * Extrae parámetros de navegación de una respuesta API
 * @param {Object} response - Respuesta de la API
 * @returns {Object} - Parámetros extraídos
 */
function extractFromApiResponse(response) {
  let result = { refId: null, searchContext: null, searcher: null };
  
  if (!response || typeof response !== 'object') return result;
  
  try {
    // Inspeccionar la respuesta para encontrar claves importantes
    const foundKeys = inspectResponse(response);
    
    // Solo registrar si se encontraron claves
    if (foundKeys.length > 0) {
      console.log('Claves importantes encontradas en la respuesta API:', foundKeys);
    }
    
    // Extraer refId del objeto raíz
    if (response.refId) {
      result.refId = response.refId;
      console.log(`✅ refId extraído de la respuesta API: ${result.refId}`);
    } else if (response.pagination && response.pagination.refId) {
      result.refId = response.pagination.refId;
      console.log(`✅ refId extraído de response.pagination: ${result.refId}`);
    } else if (response.searcherInfo && response.searcherInfo.refId) {
      result.refId = response.searcherInfo.refId;
      console.log(`✅ refId extraído de response.searcherInfo: ${result.refId}`);
    }
    
    // Si no se encontró en la raíz, buscar en results[0]
    if (!result.refId && response.results && response.results[0]) {
      const firstResult = response.results[0];
      if (firstResult.refId) {
        result.refId = firstResult.refId;
        console.log(`✅ refId extraído de response.results[0]: ${result.refId}`);
      } else if (firstResult.pagination && firstResult.pagination.refId) {
        result.refId = firstResult.pagination.refId;
        console.log(`✅ refId extraído de response.results[0].pagination: ${result.refId}`);
      } else if (firstResult.searcherInfo && firstResult.searcherInfo.refId) {
        result.refId = firstResult.searcherInfo.refId;
        console.log(`✅ refId extraído de response.results[0].searcherInfo: ${result.refId}`);
      }
    }
    
    // Extraer searchContext (primero del objeto raíz, luego de results[0])
    if (response.searchContext) {
      result.searchContext = response.searchContext;
      console.log(`✅ searchContext extraído de la respuesta API: ${result.searchContext}`);
    } else if (response.results && response.results[0] && response.results[0].searchContext) {
      result.searchContext = response.results[0].searchContext;
      console.log(`✅ searchContext extraído de response.results[0]: ${result.searchContext}`);
    }
    
    // Extraer searcher (primero del objeto raíz, luego de results[0])
    if (response.searcher) {
      result.searcher = response.searcher;
      console.log(`✅ searcher extraído de la respuesta API: ${result.searcher}`);
    } else if (response.results && response.results[0] && response.results[0].searcher) {
      result.searcher = response.results[0].searcher;
      console.log(`✅ searcher extraído de response.results[0]: ${result.searcher}`);
    }
  } catch (error) {
    console.error(`Error al extraer parámetros de la respuesta API: ${error.message}`);
  }
  
  return result;
}

module.exports = {
  inspectResponse,
  extractNavigationParams,
  extractFromInitialState,
  extractFromApiResponse
}; 