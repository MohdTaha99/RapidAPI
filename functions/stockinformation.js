const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const router = express.Router();

// ✅ Make sure helpers.js has these functions
const {
  getLastFridayOrNonHolidayDate,
  dateToUnixTimestampPlusADay,
  dateToUnixTimestamp,
  formatDateToMatchApiArgument,
} = require('./helpers.js');

// ✅ CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', true);
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
};

// ✅ Base route
router.get('/', (req, res) => {
  res.json({ message: '📈 Welcome to the Stock API! Use /return/:symbol/:firstDate/:secondDate or /dividend/:symbol' });
});

// ✅ Return % change route
router.get('/return/:symbol/:firstDate/:secondDate', async (req, res) => {
  try {
    let startDateValue = 0;
    let endDateValue = 0;

    const { symbol, firstDate, secondDate } = req.params;

    const startDate = getLastFridayOrNonHolidayDate(firstDate);
    const endDate = getLastFridayOrNonHolidayDate(secondDate);

    const url =
      `https://finance.yahoo.com/quote/${symbol}/history/?period1=${dateToUnixTimestamp(startDate)}&period2=${dateToUnixTimestampPlusADay(endDate)}`;

    const response = await axios.get(url, { headers });
    const html = response.data;
    const $ = cheerio.load(html);

    $('tbody tr.svelte-ewueuo').each((_, element) => {
      const row = $(element);
      const dateCell = row.find('td:nth-child(1)').text();

      if (formatDateToMatchApiArgument(dateCell) === startDate) {
        startDateValue = parseFloat(row.find('td:nth-child(2)').text());
      }
      if (formatDateToMatchApiArgument(dateCell) === endDate) {
        endDateValue = parseFloat(row.find('td:nth-child(2)').text());
      }
    });

    if (startDateValue && endDateValue) {
      const result = ((endDateValue - startDateValue) / startDateValue) * 100;
      res.json({ symbol, startDate, endDate, returnPercentage: result.toFixed(2) });
    } else {
      res.status(404).json({ error: 'Start or end date data not found' });
    }
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Dividend data route
router.get('/dividend/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const url = `https://www.streetinsider.com/dividend_history.php?q=${symbol}`;

    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const dividendData = [];
    $('td').each((_, el) => {
      dividendData.push($(el).text().trim());
    });

    const parsedData = [];
    for (let i = 0; i < dividendData.length; i += 9) {
      parsedData.push({
        ExDivDate: dividendData[i],
        Amount: dividendData[i + 1],
        DeclarationDate: dividendData[i + 5],
        RecordDate: dividendData[i + 6],
        PaymentDate: dividendData[i + 7],
      });
    }

    res.json({ symbol, dividends: parsedData.slice(0, 10) }); // only return top 10 for free tier
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Mount all routes
app.use('/.netlify/functions/stockinformation', router);

// ✅ Netlify export
module.exports.handler = serverless(app);

// ✅ Uncomment for local testing
// module.exports = app;
