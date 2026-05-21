const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// List of stocks we track
const NIFTY_50 = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY',
    'SBIN', 'BHARTIARTL', 'ITC', 'HINDUNILVR', 'LT',
    'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS',
    'KOTAKBANK', 'M&M', 'ONGC', 'TATASTEEL', 'ASIANPAINT'
];

let livePrices = {};

// Headers to mimic a real browser to avoid blocks
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchGoogleFinancePrice(symbol) {
    try {
        // Special case for M&M because ampersands in URLs need encoding
        const encodedSymbol = symbol.replace('&', '%26');
        const url = `https://www.google.com/finance/quote/${encodedSymbol}:NSE`;
        
        const response = await axios.get(url, { headers, timeout: 8000 });
        const html = response.data;
        
        // Google Finance live price usually sits inside a div like: <div class="YMlKec fxKbKc">₹2,950.00</div>
        // Let's use a regex to extract it
        const priceMatch = html.match(/class="YMlKec fxKbKc"[^>]*>₹?([0-9,.]+)/);
        
        if (priceMatch && priceMatch[1]) {
            // Remove commas and convert to float
            const price = parseFloat(priceMatch[1].replace(/,/g, ''));
            return price;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching ${symbol}: ${error.message}`);
        return null;
    }
}

// Background loop to constantly update prices every 10 seconds
async function updateAllPrices() {
    console.log(`[${new Date().toLocaleTimeString()}] Fetching live prices from Google Finance...`);
    
    // Fetch in batches of 5 to avoid overwhelming the network
    for (let i = 0; i < NIFTY_50.length; i += 5) {
        const batch = NIFTY_50.slice(i, i + 5);
        const promises = batch.map(async (symbol) => {
            const price = await fetchGoogleFinancePrice(symbol);
            if (price) {
                livePrices[symbol] = price;
            }
        });
        await Promise.all(promises);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('Prices updated successfully.');
}

// Start the background loop
updateAllPrices();
setInterval(updateAllPrices, 10000); // 10 seconds

// API Endpoint
app.get('/api/live-prices', (req, res) => {
    res.json(livePrices);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Google Finance Proxy Server running on http://localhost:${PORT}`);
});
