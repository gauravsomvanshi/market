const axios = require('axios');
axios.get('https://www.google.com/finance/quote/RELIANCE:NSE').then(r => {
    // Try to find the price in different ways
    const match1 = r.data.match(/class="YMlKec fxKbKc"[^>]*>([^<]+)</);
    const match2 = r.data.match(/data-last-price="([^"]+)"/);
    const match3 = r.data.match(/₹[0-9,.]+/g);
    console.log("Match 1 (YMlKec fxKbKc):", match1 ? match1[1] : 'Not found');
    console.log("Match 2 (data-last-price):", match2 ? match2[1] : 'Not found');
    console.log("Match 3 (First 5 ₹ instances):", match3 ? match3.slice(0, 5) : 'Not found');
}).catch(console.error);
