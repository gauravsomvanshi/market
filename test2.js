const axios = require('axios');
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function testFetch() {
    const symbols = ['RELIANCE', 'TCS', 'HDFCBANK'];
    let livePrices = {};
    for (const sym of symbols) {
        try {
            const url = `https://www.google.com/finance/quote/${sym}:NSE`;
            const r = await axios.get(url, { headers });
            const match = r.data.match(/data-last-price="([0-9.]+)"/);
            if (match && match[1]) {
                livePrices[sym] = parseFloat(match[1]);
            }
        } catch (e) {
            console.error(sym, e.message);
        }
    }
    console.log("Result:", livePrices);
}
testFetch();
