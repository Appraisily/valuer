/**
 * Search Results Storage Service for Google Cloud Storage
 * Handles saving search results to specified GCS bucket
 */
const { Storage } = require('@google-cloud/storage');
const path = require('path');

class SearchStorageService {
  constructor(options = {}) {
    // Use STORAGE_BUCKET environment variable, or the provided bucket name, 
    // or the hardcoded fallback value
    this.bucketName = process.env.STORAGE_BUCKET || 
                      options.bucketName || 
                      'invaluable-html-archive';
    
    console.log(`Using GCS bucket: ${this.bucketName}`);
    
    // Initialize Storage with provided credentials or use default
    if (options.credentials) {
      // Use explicitly provided credentials
      this.storage = new Storage({ 
        credentials: options.credentials 
      });
      console.log('Using provided GCS credentials for SearchStorageService');
    } else {
      // Use application default credentials or GOOGLE_APPLICATION_CREDENTIALS
      this.storage = new Storage();
      console.log('Using application default credentials for SearchStorageService');
    }
    
    this.bucket = this.storage.bucket(this.bucketName);
  }
  
  /**
   * Generate file path for page results
   * Format: invaluable-data/{category}/pages_XXX.json
   */
  getPageFilePath(category, pageNumber) {
    const paddedPage = String(pageNumber).padStart(3, '0');
    return `invaluable-data/${category}/pages_${paddedPage}.json`;
  }
  
  /**
   * Save single page of results to GCS
   * @param {string} category - Category/search term used
   * @param {number} pageNumber - Page number
   * @param {object} rawResults - Raw JSON response from the API
   * @returns {Promise<string>} - GCS file path
   */
  async savePageResults(category, pageNumber, rawResults) {
    if (!category) {
      throw new Error('Category is required for storing search results');
    }
    
    // Sanitize category name for use in file path
    const sanitizedCategory = category.toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-');
    
    const filePath = this.getPageFilePath(sanitizedCategory, pageNumber);
    
    try {
      const file = this.bucket.file(filePath);
      await file.save(JSON.stringify(rawResults, null, 2), {
        contentType: 'application/json',
        gzip: true,
        metadata: {
          cacheControl: 'public, max-age=3600',
        },
      });
      
      console.log(`Search results saved to gs://${this.bucketName}/${filePath}`);
      return `gs://${this.bucketName}/${filePath}`;
    } catch (error) {
      console.error(`Error saving search results: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if page results exist
   * @param {string} category - Category/search term used
   * @param {number} pageNumber - Page number
   * @returns {Promise<boolean>} - Whether the file exists
   */
  async pageResultsExist(category, pageNumber) {
    if (!category) {
      return false;
    }
    
    // Sanitize category name
    const sanitizedCategory = category.toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-');
    
    const filePath = this.getPageFilePath(sanitizedCategory, pageNumber);
    
    try {
      const file = this.bucket.file(filePath);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      console.error(`Error checking if page results exist: ${error.message}`);
      return false;
    }
  }
}

module.exports = SearchStorageService; 