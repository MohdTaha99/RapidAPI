const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const router = express.Router();

// Import helper functions (assumed to be in helpers.js)
const { getLastFridayOrNonHolidayDate, dateToUnixTimestamp, dateToUnixTimestampPlusADay, formatDateToMatchApiArgument } = require('./helpers.js');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
};

// Middleware for CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Welcome endpoint
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the stock information API' });
});

// Stock return endpoint
router.get('/return/:symbol/:firstDate/:secondDate', async (req, res) => {
  try {
    const { symbol, firstDate, secondDate } = req.params;

    // Validate input parameters
    if (!symbol || !firstDate || !secondDate) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const startDate = getLastFridayOrNonHolidayDate(firstDate);
    const endDate = getLastFridayOrNonHolidayDate(secondDate);

    const url = `https://finance.yahoo.com/quote/${symbol}/history/?period1=${dateToUnixTimestamp(startDate)}&period2=${dateToUnixTimestampPlusADay(endDate)}`;

    const response = await axios.get(url, { headers, timeout: 5000 });
    const $ = cheerio.load(response.data);

    let startDateValue = 0;
    let endDateValue = 0;

    const rows = $('tbody tr.svelte-ewueuo');
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No historical data found for the symbol' });
    }

    rows.each((index, element) => {
      const row = $(element);
      const dateCell = row.find('td:nth-child(1)').text();
      const price = row.find('td:nth-child(2)').text();

      if (formatDateToMatchApiArgument(dateCell) === startDate) {
        startDateValue = parseFloat(price);
      }
      if (formatDateToMatchApiArgument(dateCell) === endDate) {
        endDateValue = parseFloat(price);
      }
    });

    if (startDateValue && endDateValue) {
      const result = ((endDateValue - startDateValue) / startDateValue) * 100;
      return res.json({ return: result.toFixed(2) });
    } else {
      return res.status(404).json({ error: 'Start date or end date not found in data' });
    }
  } catch (error) {
    console.error('Error in /return:', error.message);
    return res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
  }
});

// Dividend endpoint
router.get('/dividend/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const url = `https://www.streetinsider.com/dividend_history.php?q=${symbol}`;
    const response = await axios.get(url, { headers, timeout: 5000 });
    const $ = cheerio.load(response.data);

    const dividendData = [];
    const rows = $('table tbody tr');

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No dividend data found for the symbol' });
    }

    rows.each((index, element) => {
      const cells = $(element).find('td');
      if (cells.length >= 8) {
        dividendData.push({
          ExDivDate: $(cells[0]).text().trim(),
          Amount: $(cells[1]).text().trim(),
          DeclarationDate: $(cells[5]).text().trim(),
          RecordDate: $(cells[6]).text().trim(),
          PaymentDate: $(cells[7]).text().trim(),
        });
      }
    });

    if (dividendData.length === 0) {
      return res.status(404).json({ error: 'No valid dividend data parsed' });
    }

    return res.json(dividendData);
  } catch (error) {
    console.error('Error in /dividend:', error.message);
    return res.status(500).json({ error: 'Failed to fetch dividend data', details: error.message });
  }
});

// Mount router to Netlify functions path
app.use('/.netlify/functions/stockinformation', router);

// Export handler for Netlify
module.exports.handler = serverless(app);