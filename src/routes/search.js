const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { invaluableScraper } = req.app.locals;
    if (!invaluableScraper) {
      throw new Error('Scraper not initialized');
    }

    // Default cookies for Invaluable
    const cookies = [
      {
        name: 'AZTOKEN-PROD',
        value: '4F562873-F229-4346-A846-37E9A451FA9E',
        domain: '.invaluable.com'
      },
      {
        name: 'cf_clearance',
        value: 'Yq4QHU.y14z93vU3CmLCK80CU7Pq6pgupmW0eM8k548-1738320515-1.2.1.1-ZFXBFgIPHghfvwwfhRbZx27.6zPihqfQ4vGP0VY1v66mKc.wwAOVRiRJhK6ouVt_.wMB30bkeY0r9NK.KUTU4gu7GzZxbyh0EH_gE36kcnHDvGATrI_vFs9y1XHq3PgtlHmBUflqgjcS6x9MC5YpXoeELPYiT0k59IPMn..1cHED7zV6T78hILKinjM6hZ.ZeQwetIN6SPmuvXb7V2z2ddJa64Vg_zUi.euce0SjjJr5ti7tHWoFsTV1DO1MkFwDfUpy1yTCdESho.EwyRgfdfRAlx6njkTmlWNkp1aXcXU',
        domain: '.invaluable.com'
      }
    ];

    console.log('Starting search with parameters:', req.query);
    const result = await invaluableScraper.search(req.query, cookies);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      parameters: req.query,
      data: result
    });
    
  } catch (error) {
    console.error('Error in search route:', error);
    res.status(500).json({ 
      error: 'Failed to fetch search results',
      message: error.message 
    });
  }
});

module.exports = router;