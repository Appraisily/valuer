const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { browserConfig } = require('./utils');

puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor() {
    this.browser = null;
    this.pages = new Map();
  }

  async initialize() {
    if (!this.browser) {
      console.log('Initializing browser...');
      const width = 1920 + Math.floor(Math.random() * 100);
      const height = 1080 + Math.floor(Math.random() * 100);

      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          ...browserConfig.args,
          `--window-size=${width},${height}`,
          '--enable-javascript',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Set viewport with device scale factor for better rendering
      await this.page.setViewport({ 
        width,
        height,
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: true,
        isMobile: false
      });

      // Override navigator.webdriver
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Enable JavaScript features
        window.addEventListener = ((original) => {
          return function(type, listener, options) {
            if (type === 'load') {
              setTimeout(() => {
                listener.call(this);
              }, 500);
              return;
            }
            return original.call(this, type, listener, options);
          };
        })(window.addEventListener);
        
        // Add modern browser features
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
        
        // Add language preferences
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        
        // Add proper plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            {
              0: { type: 'application/x-google-chrome-pdf' },
              description: 'Portable Document Format',
              filename: 'internal-pdf-viewer',
              length: 1,
              name: 'Chrome PDF Plugin'
            },
            {
              0: { type: 'application/pdf' },
              description: 'Portable Document Format',
              filename: 'internal-pdf-viewer',
              length: 1,
              name: 'Chrome PDF Viewer'
            },
            {
              0: { type: 'application/x-nacl' },
              description: 'Native Client',
              filename: 'internal-nacl-plugin',
              length: 1,
              name: 'Native Client'
            }
          ]
        });
        
        // Add WebGL support
        HTMLCanvasElement.prototype.getContext = ((original) => {
          return function(type, attributes) {
            if (type === 'webgl' || type === 'experimental-webgl') {
              attributes = Object.assign({}, attributes, {
                preserveDrawingBuffer: true
              });
            }
            return original.call(this, type, attributes);
          };
        })(HTMLCanvasElement.prototype.getContext);
      });
      
      await this.page.setExtraHTTPHeaders(browserConfig.headers);
      await this.page.setUserAgent(browserConfig.userAgent);
      
      // Store initial page
      this.pages.set('main', this.page);

      // Add additional browser features
      await this.page.evaluateOnNewDocument(() => {
        // Add WebRTC support
        window.RTCPeerConnection = class RTCPeerConnection {
          constructor() { }
          createDataChannel() { return {}; }
          createOffer() { return Promise.resolve({}); }
          setLocalDescription() { return Promise.resolve(); }
        };

        // Add media devices
        navigator.mediaDevices = {
          enumerateDevices: async () => []
        };

        // Add battery API
        navigator.getBattery = async () => ({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 0.95
        });
      });
      
      // Add random mouse movements and scrolling
      await this.addHumanBehavior(this.page);
    }
  }

  async createTab(name) {
    if (this.pages.has(name)) {
      return this.pages.get(name);
    }

    const page = await this.browser.newPage();
    
    // Configure the new tab
    await page.setViewport({ 
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100),
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });

    await page.setUserAgent(browserConfig.userAgent);
    await page.setExtraHTTPHeaders(browserConfig.headers);

    // Store the new tab
    this.pages.set(name, page);
    return page;
  }

  async closeTab(name) {
    const page = this.pages.get(name);
    if (page && name !== 'main') {
      await page.close();
      this.pages.delete(name);
    }
  }

  async close() {
    if (this.browser) {
      // Close all pages
      for (const [name, page] of this.pages) {
        await page.close();
      }
      this.pages.clear();
      
      await this.browser.close();
      this.browser = null;
    }
  }

  async handleProtection() {
    try {
      console.log('Handling protection page...');
      
      // Add random mouse movements
      await this.page.mouse.move(
        100 + Math.random() * 100,
        100 + Math.random() * 100,
        { steps: 10 }
      );
      
      // Wait a bit and add some scrolling
      await this.page.evaluate(() => {
        window.scrollTo({
          top: 100,
          behavior: 'smooth'
        });
        return new Promise(r => setTimeout(r, 1000));
      });
      
      // Wait for protection to clear
      await this.page.waitForFunction(() => {
        return !document.querySelector('[id^="px-captcha"]') && 
               !document.querySelector('.px-block');
      }, { timeout: 30000 });
      
      console.log('Protection cleared');
      return true;
    } catch (error) {
      console.error('Error handling protection:', error);
      throw error;
    }
  }

  async addHumanBehavior(page) {
    page.on('load', async () => {
      try {
        // Random mouse movements
        const moves = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < moves; i++) {
          await page.mouse.move(
            Math.random() * 1920,
            Math.random() * 1080,
            { steps: 10 }
        );
        await page.evaluate(ms => new Promise(r => setTimeout(r, ms)), Math.random() * 200 + 100);
        }

        // Random scrolling
        await page.evaluate(() => {
          const scroll = () => {
            window.scrollBy(0, (Math.random() * 100) - 50);
          };
          for (let i = 0; i < 3; i++) {
            setTimeout(scroll, Math.random() * 1000);
          }
        });
      } catch (error) {
        console.log('Error in human behavior simulation:', error);
      }
    });
  }

  getPage() {
    return this.pages.get('main');
  }
}

module.exports = BrowserManager;