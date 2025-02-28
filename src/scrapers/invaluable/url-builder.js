/**
 * Módulo para construir URLs para el scraper de Invaluable
 */

/**
 * Construye una URL de búsqueda basada en los parámetros proporcionados
 * @param {Object} params - Parámetros de búsqueda
 * @returns {string} URL completa para la búsqueda
 */
function constructSearchUrl(params = {}) {
  const baseUrl = 'https://www.invaluable.com/search';
  const searchParams = new URLSearchParams();

  // Manejar parámetros de rango de precios anidados
  if (params.priceResult) {
    if (params.priceResult.min) {
      searchParams.append('priceResult[min]', params.priceResult.min);
    }
    if (params.priceResult.max) {
      searchParams.append('priceResult[max]', params.priceResult.max);
    }
  } else {
    // Añadir precio mínimo por defecto si no se especifica
    searchParams.append('priceResult[min]', params.priceResult_min || '250');
  }
  
  // Añadir parámetros de búsqueda requeridos
  searchParams.append('upcoming', 'false');
  searchParams.append('query', params.query || 'furniture');
  searchParams.append('keyword', params.keyword || params.query || 'furniture');
  
  // Manejar parámetros de paginación - solo añadir si no es página 1 (default)
  if (params.page && !isNaN(params.page) && params.page > 1) {
    searchParams.append('page', params.page);
  }
  
  // Añadir todos los parámetros proporcionados
  Object.entries(params).forEach(([key, value]) => {
    // Omitir parámetros que ya hemos configurado
    if (value !== undefined && value !== null && 
        !['upcoming', 'query', 'keyword', 'priceResult', 'priceResult_min', 'page'].includes(key)) {
      searchParams.append(key, value);
    }
  });

  return `${baseUrl}?${searchParams.toString()}`;
}

module.exports = {
  constructSearchUrl
}; 