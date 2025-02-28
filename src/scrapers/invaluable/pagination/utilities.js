/**
 * Utility functions for the pagination module
 */

/**
 * Helper function to wait for a specific time
 * @param {Object} page - Page object
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
async function wait(page, ms) {
  // Use page.evaluate with setTimeout for compatibility
  return page.evaluate(ms => new Promise(r => setTimeout(r, ms)), ms);
}

/**
 * Gets a formatted timestamp for logging
 * @returns {string} Current timestamp in ISO format
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Formats elapsed time in ms to human-readable format
 * @param {number} startTime - Start time in milliseconds
 * @returns {string} Formatted elapsed time
 */
function formatElapsedTime(startTime) {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60000) return `${(elapsed/1000).toFixed(2)}s`;
  return `${(elapsed/60000).toFixed(2)}min`;
}

module.exports = {
  wait,
  getTimestamp,
  formatElapsedTime
}; 