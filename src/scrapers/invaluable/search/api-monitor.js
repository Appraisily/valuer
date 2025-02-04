const { constants } = require('../utils');

class ApiMonitor {
  constructor() {
    this.reset();
  }
  
  reset() {
    this.responses = [];
    this.seenResponses = new Set();
    this.firstResponseSize = 0;
    this.firstResponseCaptured = false;
  }

  async handleResponse(response) {
    try {
      const url = response.url();
      if (url.includes('catResults') && response.status() === 200) {
        console.log('  • Received API response:', url);
        const responseData = await response.text();
        
        if (responseData.length < 1000) {
          console.log('    - Skipping small response:', (responseData.length / 1024).toFixed(2), 'KB');
          return;
        }

        const sizeKB = responseData.length / 1024;
        console.log('    - Response size:', sizeKB.toFixed(2), 'KB');
        
        const responseHash = this.hashResponse(responseData);

        if (this.seenResponses.has(responseHash) && responseData.length === this.firstResponseSize) {
          console.log('    - Duplicate response detected');
          return;
        }

        this.seenResponses.add(responseHash);
        console.log('    - New unique response:', sizeKB.toFixed(2), 'KB');

        // Always capture responses over 1KB
        if (responseData.length > 1000) {
          this.responses.push(responseData);
          console.log('    - Saved as first response');
          // Store first response size in bytes
          this.firstResponseSize = responseData.length;
        }
      }
    } catch (error) {
      if (!error.message.includes('Target closed')) {
        console.error('    - Error handling response:', error.message);
      }
    }
  }

  hasFirstResponse() {
    return this.responses.length > 0;
  }

  getFirstResponseSize() {
    // Return size in KB
    return this.firstResponseSize / 1024;
  }
  
  getData() {
    return {
      responses: this.responses
    };
  }

  hashResponse(responseData) {
    // Simple hash function for response content
    let hash = 0;
    for (let i = 0; i < responseData.length; i++) {
      const char = responseData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

module.exports = ApiMonitor;