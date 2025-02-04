const { Storage } = require('@google-cloud/storage');

class CloudStorage {
  constructor() {
    this.storage = new Storage();
    this.bucketName = process.env.STORAGE_BUCKET || 'invaluable-html-archive';
    this.indexFile = 'state/last_index.json';
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      const [bucket] = await this.storage.bucket(this.bucketName).exists();
      if (!bucket) {
        throw new Error(`Bucket ${this.bucketName} does not exist`);
      }
      this.initialized = true;
    } catch (error) {
      console.error('[Storage] Error initializing bucket:', error);
      throw error;
    }
  }

  async getLastProcessedIndex() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const file = this.storage.bucket(this.bucketName).file(this.indexFile);
      const [exists] = await file.exists();

      if (!exists) {
        console.log('No index file found, starting from 0');
        return -1;
      }

      const [content] = await file.download();
      const { lastIndex } = JSON.parse(content.toString());
      console.log('Last processed index:', lastIndex);
      return lastIndex;
    } catch (error) {
      console.error('[Storage] Error reading last index:', error);
      return -1;
    }
  }

  async updateProcessedIndex(index) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const file = this.storage.bucket(this.bucketName).file(this.indexFile);
      await file.save(JSON.stringify({ lastIndex: index, updatedAt: new Date().toISOString() }));
      console.log('Updated last processed index to:', index);
    } catch (error) {
      console.error('[Storage] Error updating index:', error);
      throw error;
    }
  }

  async saveSearchData(html, metadata) {
    try {
      if (!this.initialized) {
        console.log('💾 Initializing storage');
        await this.initialize();
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const houseName = metadata.auctionHouse?.name || 'unknown'
        .replace(/[^a-zA-Z0-9-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '');
      const baseFolder = `furniture/${houseName}`;
      console.log('📁 Saving files for auction house:', houseName);
      console.log('  • Base folder:', baseFolder);
      
      metadata.files = {};
      metadata.ranges = {};

      if (html.apiData?.responses?.length > 0) {
        console.log('  • Processing API responses');
        
        for (let i = 0; i < html.apiData.responses.length; i++) {
          const response = html.apiData.responses[i];
          const range = metadata.priceRanges[i];
          const rangeStr = `${range.min}-${range.max || 'unlimited'}`;
          
          // Create a clean filename
          const filename = `${baseFolder}/responses/${rangeStr}/${timestamp}.json`;
          console.log(`    - Saving range ${rangeStr}:`, (response.length / 1024).toFixed(2), 'KB');
          
          const file = this.storage.bucket(this.bucketName).file(filename);
          await file.save(response, {
            contentType: 'application/json',
            metadata: {
              type: 'api_response',
              priceRange: rangeStr,
              min: range.min,
              max: range.max || 'unlimited',
              houseName: houseName
            }
          });
          
          // Track files by range
          if (!metadata.files[rangeStr]) {
            metadata.files[rangeStr] = [];
          }
          metadata.files[rangeStr].push(filename);
          
          // Track range metadata
          metadata.ranges[rangeStr] = {
            min: range.min,
            max: range.max,
            responseSize: response.length,
            timestamp
          };
        }
      }
      
      console.log('  • Saving metadata');
      const metadataFilename = `${baseFolder}/metadata/${timestamp}.json`;
      const metadataFile = this.storage.bucket(this.bucketName).file(metadataFilename);
      await metadataFile.save(JSON.stringify(metadata, null, 2), {
        contentType: 'application/json',
        metadata: {
          type: 'metadata',
          houseName: houseName,
          timestamp
        }
      });

      console.log('✅ All files saved successfully');
      console.log('  Ranges processed:', Object.keys(metadata.ranges).length);
      
      return {
        houseName: houseName,
        timestamp,
        files: metadata.files,
        ranges: metadata.ranges,
        metadataPath: metadataFilename
      };
    } catch (error) {
      console.error('[Storage] Error saving search data:', error);
      throw error;
    }
  }

  async saveJsonFile(filename, data) {
    try {
      if (!this.initialized) {
        console.log('Initializing storage for JSON save');
        await this.initialize();
      }

      console.log(`Saving JSON file: ${filename}`);
      
      // Create parent directories if they don't exist
      const file = this.storage.bucket(this.bucketName).file(filename);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        console.log('File already exists, updating content');
      }
      
      // Save the file
      await file.save(JSON.stringify(data, null, 2));
      console.log('File saved successfully');

      // Generate signed URL
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000
      });
      console.log('Generated signed URL');

      return url;
    } catch (error) {
      console.error('[Storage] Error saving JSON file:', error);
      throw error;
    }
  }
}

// Export singleton instance
const storage = new CloudStorage();
module.exports = storage;