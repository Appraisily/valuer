const { constants } = require('../utils');
const ApiMonitor = require('./api-monitor');
const PaginationHandler = require('./pagination-handler');
const fs = require('fs');
const path = require('path');

class SearchManager {
  constructor(browserManager) {
    this.browserManager = browserManager;
    this.auctionHouses = this.loadAuctionHouses();
    this.priceRanges = this.generatePriceRanges();
  }

  loadAuctionHouses() {
    try {
      const auctionData = fs.readFileSync(path.join(process.cwd(), 'src/auction.txt'), 'utf8');
      // Only take the first auction house for testing
      const houses = [JSON.parse(auctionData)[0]];
      console.log(`Loaded ${houses.length} auction houses. First house: ${houses[0].name}`);
      if (houses.length === 0) {
        throw new Error('No auction houses loaded from file');
      }
      return houses;
    } catch (error) {
      console.error('Error loading auction houses:', error.message);
      console.error('Current directory:', process.cwd());
      console.error('Looking for file:', path.join(process.cwd(), 'src/auction.txt'));
      return [];
    }
  }

  generatePriceRanges() {
    const ranges = new Map();
    const MAX_PRICE = 25000;
    
    for (const house of this.auctionHouses) {
      console.log(`Generating initial ranges for ${house.name} (${house.count} items)`);
      
      // Initial base ranges based on auction house size
      let baseRanges;
      if (house.count <= 1000) {
        baseRanges = this.generateBaseRanges(250, MAX_PRICE, 3);
      } else if (house.count <= 5000) {
        baseRanges = this.generateBaseRanges(250, MAX_PRICE, 5);
      } else {
        baseRanges = this.generateBaseRanges(250, MAX_PRICE, 8);
      }
      
      ranges.set(house.name, baseRanges);
    }
    
    return ranges;
  }

  generateBaseRanges(min, max, segments) {
    const ranges = [];
    const step = Math.floor((max - min) / (segments - 1));
    
    // Create initial ranges with upper limits
    for (let i = 0; i < segments - 2; i++) {
      ranges.push({
        min: min + (step * i),
        max: min + (step * (i + 1))
      });
    }
    
    // Add final range with no upper limit
    ranges.push({
      min: min + (step * (segments - 2)),
      max: null
    });
    
    return ranges;
  }

  async splitRangeIfNeeded(url, range, house) {
    try {
      // Create a new tab and check response size
      const tabName = `range-check-${range.min}-${range.max || 'unlimited'}`;
      const page = await this.browserManager.createTab(tabName);
      const apiMonitor = new ApiMonitor();
      
      try {
        await page.setRequestInterception(true);
        page.on('response', apiMonitor.handleResponse.bind(apiMonitor));
        
        // Set up request handler
        page.on('request', request => {
          try {
            if (request.resourceType() === 'image' || 
                request.resourceType() === 'stylesheet' || 
                request.resourceType() === 'font') {
              request.abort();
              return;
            }
            request.continue();
          } catch (error) {
            if (!error.message.includes('Request is already handled')) {
              console.error('Request handling error:', error);
            }
            request.continue();
          }
        });

        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: constants.navigationTimeout
        });

        const responseSize = apiMonitor.getFirstResponseSize();
        console.log(`  • Response size for range $${range.min}-${range.max ? '$' + range.max : 'unlimited'}: ${responseSize.toFixed(2)} KB`);
      
        // If response size is under 90KB, we've hit an empty or near-empty range
        if (responseSize < 90) {
          console.log(`  • Range $${range.min}-${range.max ? '$' + range.max : 'unlimited'}: ${responseSize.toFixed(2)}KB (empty/near-empty, keeping)`);
          return [range];
        }

        // If response size is under 600KB and we have an upper limit, keep range
        if (range.max && responseSize < 600) {
          console.log(`  • Range $${range.min}-$${range.max}: ${responseSize.toFixed(2)}KB (under limit, keeping)`);
          return [range];
        }

        console.log(`  • Range $${range.min}-${range.max ? '$' + range.max : 'unlimited'}: ${responseSize.toFixed(2)}KB (splitting)`);
        
        let newRanges;
        if (range.max === null) {
          // For unlimited ranges, double the previous min to create new max
          const newMax = range.min * 2;
          newRanges = [
            { min: range.min, max: newMax },
            { min: newMax, max: null }
          ];
        } else {
          // For limited ranges, split in half
          const mid = Math.floor((range.max + range.min) / 2);
          newRanges = [
            { min: range.min, max: mid },
            { min: mid, max: range.max }
          ];
        }
        
        // Process each new range
        let splitRanges = [];
        for (const newRange of newRanges) {
          const newUrl = this.constructSearchUrl(house, newRange);
          const processedRanges = await this.splitRangeIfNeeded(newUrl, newRange, house);
          splitRanges.push(...processedRanges);
        }
        
        return splitRanges;
      } finally {
        await this.browserManager.closeTab(tabName);
      }
    } catch (error) {
      console.error('Error splitting range:', error);
      // If we encounter an error, return the original range
      console.log(`  • Keeping original range due to error: $${range.min}-${range.max ? '$' + range.max : 'unlimited'}`);
      return [range];
    }
  }

  constructSearchUrl(auctionHouse, priceRange) {
    const baseParams = {
      supercategoryName: 'Furniture',
      upcoming: false,
      query: 'furniture',
      keyword: 'furniture',
      houseName: auctionHouse.name
    };

    // Add price range parameters
    if (priceRange) {
      baseParams['priceResult[min]'] = priceRange.min.toString();
      if (priceRange.max) {
        baseParams['priceResult[max]'] = priceRange.max.toString();
      }
    } else {
      baseParams['priceResult[min]'] = '250';
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(baseParams)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    }

    return `https://www.invaluable.com/search?${searchParams.toString()}`;
  }

  async delay(page, ms) {
    const randomDelay = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000; // Random between 20-30 seconds
    console.log(`Waiting ${(randomDelay / 1000).toFixed(1)} seconds...`);
    return page.evaluate(ms => new Promise(r => setTimeout(r, ms)), randomDelay);
  }

  async searchFurniture(cookies) {
    try {
      console.log('🔄 Starting furniture search process');
      // Get last processed index from storage
      const storage = require('../../../utils/storage');
      const lastIndex = await storage.getLastProcessedIndex();
      const nextIndex = 0; // Always use first auction house for testing
      
      // Update index immediately before processing
      await storage.updateProcessedIndex(nextIndex);
      
      // Check if we've processed all houses
      if (nextIndex >= this.auctionHouses.length) {
        console.log('All auction houses have been processed');
        return { 
          apiData: { responses: [] },
          timestamp: new Date().toISOString(),
          status: 'completed',
          message: 'All auction houses processed'
        };
      }
      
      const house = this.auctionHouses[nextIndex];
      console.log(`Processing auction house ${nextIndex}:`, house.name);
      
      // Get initial price ranges
      const initialRanges = this.priceRanges.get(house.name);
      console.log(`Initial ranges for ${house.name}:`, initialRanges.length);
      
      const allResponses = [];
      const finalRanges = [];
      
      // Process each range
      for (const [index, range] of initialRanges.entries()) {
        console.log(`\n🔄 Processing URL ${index + 1}/${initialRanges.length}`);
        console.log(`  • Price Range: $${range.min} - ${range.max ? '$' + range.max : 'No limit'}`);
        
        const url = this.constructSearchUrl(house, range);
        
        // Split range if needed and get optimized ranges
        console.log('🔄 Checking if range needs splitting');
        const optimizedRanges = await this.splitRangeIfNeeded(url, range, house);
        console.log(`  • Range produced ${optimizedRanges.length} optimized ranges`);
        
        // Process each optimized range
        for (const optimizedRange of optimizedRanges) {
          const optimizedUrl = this.constructSearchUrl(house, optimizedRange);
          console.log(`\n  • Processing optimized range: $${optimizedRange.min}-${optimizedRange.max ? '$' + optimizedRange.max : 'unlimited'}`);
          
          // Create a new tab for this range
          const tabName = `range-${optimizedRange.min}-${optimizedRange.max || 'unlimited'}`;
          const page = await this.browserManager.createTab(tabName);
          const apiMonitor = new ApiMonitor();
          
          try {
            // Configure page
            await page.setBypassCSP(true);
            await page.setRequestInterception(true);
            await page.setExtraHTTPHeaders({
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            });
            
            // Set up request handling
            page.on('request', request => {
              try {
                const reqUrl = request.url();
                const headers = request.headers();
                
                // Add cookies to all requests
                headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                
                if (reqUrl.includes('catResults')) {
                  headers['Accept'] = 'application/json';
                  headers['Content-Type'] = 'application/json';
                  console.log('    • Intercepted API request:', reqUrl);
                }
                
                // Block unnecessary resources
                if (request.resourceType() === 'image' || 
                    request.resourceType() === 'stylesheet' || 
                    request.resourceType() === 'font') {
                  request.abort();
                  return;
                }
                
                request.continue({ headers });
              } catch (error) {
                if (!error.message.includes('Request is already handled')) {
                  console.error('Request handling error:', error);
                }
                request.continue();
              }
            });
            
            page.on('response', apiMonitor.handleResponse.bind(apiMonitor));
            
            // Set cookies
            await page.setCookie(...cookies);
            
            console.log('    🌐 Navigating to URL:', optimizedUrl);
            await page.goto(optimizedUrl, {
              waitUntil: 'networkidle2',
              timeout: constants.navigationTimeout
            });
            
            // Random delay between requests
            await this.delay(page);
            
            // Get responses for this range
            const urlResponses = apiMonitor.getData();
            if (urlResponses.responses.length > 0) {
              console.log(`    ✅ Captured ${urlResponses.responses.length} API responses`);
              allResponses.push(...urlResponses.responses);
              finalRanges.push(optimizedRange);
            } else {
              console.log('    ⚠️ No API responses captured for this range');
            }
          } catch (error) {
            console.error('    ❌ Error processing range:', error.message);
          } finally {
            await this.browserManager.closeTab(tabName);
          }
        }
      }

      console.log(`\n📊 Final Results:`);
      console.log(`  • Total API responses: ${allResponses.length}`);
      console.log(`  • Total ranges processed: ${finalRanges.length}`);

      return {
        apiData: { responses: allResponses },
        timestamp: new Date().toISOString(),
        auctionHouse: house,
        priceRanges: finalRanges
      };
    } catch (error) {
      console.error('Furniture search error:', error);
      throw error;
    }
  }
}

module.exports = SearchManager;
        try {
          console.log('🌐 Navigating to URL:', url);
          
          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: constants.navigationTimeout
          });
          
          // Random delay between requests
          await this.delay(page);
          
          // Get responses for this range
          const urlResponses = apiMonitor.getData();
          if (urlResponses.responses.length > 0) {
            console.log(`✅ Captured ${urlResponses.responses.length} API responses`);
            allResponses.push(...urlResponses.responses);
          } else {
            console.log('⚠️ No API responses captured for this URL');
          }
        } catch (error) {
          console.error('Error processing URL:', error.message);
        }
      }
      
      // Clean up the search tab
      await this.browserManager.closeTab('search');

      console.log(`\n📊 Final Results:`);
      console.log(`  • Total responses captured: ${allResponses.length}`);

      return {
        apiData: { responses: allResponses },
        timestamp: new Date().toISOString(),
        auctionHouse: house,
        priceRanges: initialRanges
      };
    } catch (error) {
      console.error('Furniture search error:', error);
      throw error;
    }
  }
}

module.exports = SearchManager;