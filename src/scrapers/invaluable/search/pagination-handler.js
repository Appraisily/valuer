const { constants } = require('../utils');

class PaginationHandler {
  constructor(page) {
    this.page = page;
  }

  async getInitialCount() {
    return this.page.evaluate(() => {
      const items = document.querySelectorAll('.lot-search-result');
      return items.length;
    });
  }

  async getTotalCount() {
    return this.page.evaluate(() => {
      const countEl = document.querySelector('.total-count');
      if (!countEl) return 0;
      return parseInt(countEl.textContent.replace(/,/g, ''), 10) || 0;
    });
  }

  async waitForLoadMoreButton() {
    try {
      await this.page.waitForSelector('.load-more-btn', { 
        visible: true,
        timeout: constants.defaultTimeout
      });
      
      // Check if button is enabled
      const isEnabled = await this.page.evaluate(() => {
        const btn = document.querySelector('.load-more-btn');
        return btn && !btn.disabled;
      });
      
      return isEnabled;
    } catch (error) {
      console.log('No load more button found or button is disabled');
      return false;
    }
  }

  async clickLoadMore() {
    try {
      console.log('🖱️ Clicking load more button');
      let success = false;
      
      // Try InstantSearch method
      const instantSearchSuccess = await this.tryInstantSearchPagination();
      console.log(instantSearchSuccess ? '✅ InstantSearch pagination successful' : '❌ InstantSearch pagination failed');
      
      // Try Algolia request regardless of InstantSearch result
      console.log('📡 Trying direct Algolia request');
      const algoliaSuccess = await this.tryAlgoliaPagination();
      console.log(algoliaSuccess ? '✅ Direct Algolia request successful' : '❌ Direct Algolia request failed');
      
      // Consider success if either method worked
      success = instantSearchSuccess || algoliaSuccess;
      
      console.log(success ? '✅ Pagination completed successfully' : '❌ Both pagination methods failed');
      return success;
    } catch (error) {
      console.error('Error in pagination:', error);
      return false;
    }
  }

  async tryInstantSearchPagination() {
    try {
      
      // Get InstantSearch instance and trigger next page
      const success = await this.page.evaluate(() => {
        try {
          // Find InstantSearch instance
          const searchClient = window.searchClient;
          if (!searchClient) {
            console.log('InstantSearch client not found');
            return false;
          }

          // Get current state
          const state = searchClient.helper.state;
          const currentPage = state.page || 0;
          
          // Trigger next page
          searchClient.helper
            .setPage(currentPage + 1)
            .search();
            
          return true;
        } catch (error) {
          console.error('Error triggering InstantSearch pagination:', error);
          return false;
        }
      });

      if (!success) {
        console.log('Failed to trigger InstantSearch pagination');
        return false;
      }
      
      // Wait for new items to render
      await this.page.waitForFunction(() => {
        const loadingIndicator = document.querySelector('.loading-indicator');
        return !loadingIndicator || window.getComputedStyle(loadingIndicator).display === 'none';
      }, { timeout: constants.defaultTimeout });

      // Get updated count
      const newCount = await this.getInitialCount();
      console.log(`  • New item count: ${newCount}`);
      
      return true;
    } catch (error) {
      console.error('Error in Algolia pagination:', error);
      return false;
    }
  }

  async tryAlgoliaPagination() {
    try {
      // Get current state and construct Algolia request
      const requestData = await this.page.evaluate(() => {
        const items = document.querySelectorAll('.lot-search-result');
        const currentPage = Math.floor(items.length / 96); // 96 items per page
        
        return {
          requests: [{
            indexName: 'archive_prod',
            params: {
              attributesToRetrieve: [
                'watched', 'dateTimeUTCUnix', 'currencyCode', 'dateTimeLocal',
                'lotTitle', 'lotNumber', 'lotRef', 'photoPath', 'houseName',
                'currencySymbol', 'currencyCode', 'priceResult', 'saleType'
              ],
              clickAnalytics: true,
              facetFilters: [['supercategoryName:Furniture']],
              facets: [
                'hasImage', 'supercategoryName', 'artistName', 'dateTimeUTCUnix',
                'houseName', 'countryName', 'currencyCode', 'priceResult'
              ],
              filters: 'banned:false AND dateTimeUTCUnix<1738577422 AND onlineOnly:false AND channelIDs:1 AND closed:true',
              highlightPostTag: '</ais-highlight-0000000000>',
              highlightPreTag: '<ais-highlight-0000000000>',
              hitsPerPage: 96,
              maxValuesPerFacet: 50,
              numericFilters: ['priceResult>=250'],
              page: currentPage + 1,
              query: 'furniture',
              userToken: '9166383'
            }
          }]
        };
      });

      // Make direct request to Algolia
      const response = await this.page.evaluate(async (data) => {
        try {
          const res = await fetch('https://www.invaluable.com/catResults', {
            method: 'POST',
            headers: {
              'accept': 'application/json, text/plain, */*',
              'content-type': 'application/json',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-origin'
            },
            body: JSON.stringify(data),
            credentials: 'include'
          });

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          const json = await res.json();
          return json;
        } catch (error) {
          console.error('Fetch error:', error);
          return null;
        }
      }, requestData);

      if (!response || !response.results?.[0]?.hits?.length) {
        console.log('No results from Algolia request');
        return false;
      }

      // Wait for any loading states to clear
      await this.page.waitForFunction(() => {
        const loadingIndicator = document.querySelector('.loading-indicator');
        return !loadingIndicator || window.getComputedStyle(loadingIndicator).display === 'none';
      }, { timeout: constants.defaultTimeout });

      return true;
    } catch (error) {
      console.error('Error in Algolia pagination:', error);
      return false;
    }
  }
}

module.exports = PaginationHandler;