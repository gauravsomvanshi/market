const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// NSE base URLs
const BASE_URL = 'https://www.nseindia.com';
const API_URL = 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050';

// We need robust headers to mimic a real browser
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
};

let nseCookies = '';

// Function to fetch and update cookies
async function refreshCookies() {
    try {
        console.log('Fetching fresh cookies from NSE...');
        const response = await axios.get(BASE_URL, { headers, timeout: 10000 });
        const setCookieHeaders = response.headers['set-cookie'];
        
        if (setCookieHeaders) {
            nseCookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
            console.log('Cookies updated successfully.');
        }
    } catch (error) {
        console.error('Failed to fetch cookies:', error.message);
    }
}

// Function to fetch live NIFTY 50 data from NSE
async function fetchLiveNiftyData() {
    if (!nseCookies) {
        await refreshCookies();
    }
    
    try {
        const response = await axios.get(API_URL, {
            headers: {
                ...headers,
                'Cookie': nseCookies
            },
            timeout: 10000
        });
        
        return response.data;
    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.log('Session expired, refreshing cookies...');
            await refreshCookies();
            
            const retryResponse = await axios.get(API_URL, {
                headers: { ...headers, 'Cookie': nseCookies },
                timeout: 10000
            });
            return retryResponse.data;
        }
        throw error;
    }
}

// Global cached data to prevent spamming NSE (cache for 5 seconds)
let cachedData = null;
let lastFetchTime = 0;

app.get('/api/nse/live', async (req, res) => {
    try {
        const now = Date.now();
        // If we have cached data less than 5 seconds old, return it
        if (cachedData && now - lastFetchTime < 5000) {
            return res.json(cachedData);
        }
        
        const data = await fetchLiveNiftyData();
        cachedData = data;
        lastFetchTime = now;
        
        res.json(data);
    } catch (error) {
        console.error('API Route Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch live data from NSE' });
    }
});

const PORT = 3000;
app.listen(PORT, async () => {
    console.log(`NSE Proxy Server is running on http://localhost:${PORT}`);
    // Initial cookie fetch
    await refreshCookies();
});
