exports.selectors = {
  loginForm: '#login-form',
  emailInput: 'input[name="emailLogin"]',
  passwordInput: 'input[name="password"]',
  submitButton: '#signInBtn',
  cookieConsent: 'iframe[id^="CybotCookiebotDialog"]',
  cookieAccept: '#CybotCookiebotDialogBodyButtonAccept',
  searchResults: '.lot-search-result',
  loadingIndicator: '.loading-indicator',
  protectionPage: '[id^="px-captcha"], .px-block'
};

exports.constants = {
  defaultTimeout: 30000,
  navigationTimeout: 60000,
  typingDelay: 150,
  scrollDelay: 100,
  scrollDistance: 100
};

exports.browserConfig = {
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--font-render-hinting=medium',
    '--enable-features=NetworkService',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-running-insecure-content',
    '--disable-notifications',
    '--disable-popup-blocking'
  ],
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  headers: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'DNT': '1',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  }
};