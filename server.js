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
let signalsHistory = [];

// --- Technical Indicator Math Helpers ---
function calculateSMA(data, period) {
    let sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j];
        }
        sma.push(sum / period);
    }
    return sma;
}

function calculateEMA(data, period) {
    let ema = [];
    let multiplier = 2 / (period + 1);
    
    let firstSMA = 0;
    for (let i = 0; i < period; i++) {
        if (data[i] === undefined) return ema;
        firstSMA += data[i];
    }
    firstSMA /= period;
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            ema.push(null);
        } else if (i === period - 1) {
            ema.push(firstSMA);
        } else {
            let currentVal = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
            ema.push(currentVal);
        }
    }
    return ema;
}

function calculateRSI(data, period = 14) {
    let gains = [];
    let losses = [];
    
    for (let i = 1; i < data.length; i++) {
        let diff = data[i] - data[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? Math.abs(diff) : 0);
    }
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    let rsi = new Array(period).fill(null);
    
    if (avgLoss === 0) rsi.push(100);
    else rsi.push(100 - (100 / (1 + (avgGain / avgLoss))));
    
    for (let i = period; i < gains.length; i++) {
        avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
        avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
        
        if (avgLoss === 0) {
            rsi.push(100);
        } else {
            let rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        }
    }
    return rsi;
}

function calculateMACD(data, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
    let shortEMA = calculateEMA(data, shortPeriod);
    let longEMA = calculateEMA(data, longPeriod);
    
    let macdLine = [];
    for (let i = 0; i < data.length; i++) {
        if (shortEMA[i] === null || longEMA[i] === null) {
            macdLine.push(null);
        } else {
            macdLine.push(shortEMA[i] - longEMA[i]);
        }
    }
    
    let macdLineClean = macdLine.filter(val => val !== null);
    let signalLineClean = calculateEMA(macdLineClean, signalPeriod);
    
    let signalLine = new Array(data.length - signalLineClean.length).fill(null).concat(signalLineClean);
    
    let histogram = [];
    for (let i = 0; i < data.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            histogram.push(macdLine[i] - signalLine[i]);
        } else {
            histogram.push(null);
        }
    }
    
    return { macdLine, signalLine, histogram };
}

function calculateATR(high, low, close, period = 14) {
    let tr = [high[0] - low[0]];
    for (let i = 1; i < close.length; i++) {
        let hl = high[i] - low[i];
        let hpc = Math.abs(high[i] - close[i - 1]);
        let lpc = Math.abs(low[i] - close[i - 1]);
        tr.push(Math.max(hl, hpc, lpc));
    }
    return calculateSMA(tr, period);
}

// --- Live Price Scraper (Google Finance) ---
async function fetchGoogleFinancePrice(symbol) {
    try {
        const encodedSymbol = symbol.replace('&', '%26');
        const url = `https://www.google.com/finance/quote/${encodedSymbol}:NSE`;
        
        const response = await axios.get(url, { timeout: 8000 });
        const html = response.data;
        
        const priceMatch = html.match(/data-last-price="([0-9.]+)"/) || html.match(/class="YMlKec fxKbKc"[^>]*>₹?([0-9,.]+)/);
        
        if (priceMatch && priceMatch[1]) {
            return parseFloat(priceMatch[1].replace(/,/g, ''));
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function updateAllPrices() {
    for (let i = 0; i < NIFTY_50.length; i += 5) {
        const batch = NIFTY_50.slice(i, i + 5);
        const promises = batch.map(async (symbol) => {
            const price = await fetchGoogleFinancePrice(symbol);
            if (price) livePrices[symbol] = price;
        });
        await Promise.all(promises);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

setInterval(updateAllPrices, 10000);

// --- Historical Data & Analysis Engine ---
async function fetchHistoricalData(symbol) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=5d&interval=15m`;
        const response = await axios.get(url);
        const data = response.data;
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) return null;
        
        const quote = data.chart.result[0].indicators.quote[0];
        const closes = quote.close;
        const highs = quote.high;
        const lows = quote.low;
        
        let cleanCloses = [];
        let cleanHighs = [];
        let cleanLows = [];
        
        for (let i = 0; i < closes.length; i++) {
            if (closes[i] !== null && highs[i] !== null && lows[i] !== null) {
                cleanCloses.push(closes[i]);
                cleanHighs.push(highs[i]);
                cleanLows.push(lows[i]);
            }
        }
        return { closes: cleanCloses, highs: cleanHighs, lows: cleanLows };
    } catch (error) {
        return null;
    }
}

async function runMarketAnalysis() {
    console.log(`Running market analysis at ${new Date().toLocaleTimeString()}...`);
    let buyOpportunities = [];
    let sellOpportunities = [];
    
    for (const symbol of NIFTY_50) {
        const data = await fetchHistoricalData(symbol);
        if (data && data.closes.length > 50) {
            // Get true live price if available, otherwise fallback to delayed Yahoo close
            const currentPrice = livePrices[symbol] || data.closes[data.closes.length - 1];
            
            const rsiArr = calculateRSI(data.closes);
            const currentRSI = rsiArr[rsiArr.length - 1];
            
            const macdData = calculateMACD(data.closes);
            const currentMACD = macdData.macdLine[macdData.macdLine.length - 1];
            const currentSignal = macdData.signalLine[macdData.signalLine.length - 1];
            const macdHist = macdData.histogram[macdData.histogram.length - 1];
            
            const ema20 = calculateEMA(data.closes, 20)[data.closes.length - 1];
            const ema50 = calculateEMA(data.closes, 50)[data.closes.length - 1];
            
            const atrArr = calculateATR(data.highs, data.lows, data.closes);
            const currentATR = atrArr[atrArr.length - 1];
            
            // Build Rationale Strings
            let buyRationale = [];
            let sellRationale = [];
            
            // Buy Scoring
            let buyScore = 0;
            if (currentRSI > 40 && currentRSI < 70) {
                buyScore += 20;
                buyRationale.push(`RSI is in optimal buying zone (${currentRSI.toFixed(1)}).`);
            }
            if (macdHist > 0) {
                buyScore += 20;
                buyRationale.push("MACD Histogram is positive, indicating upward momentum.");
            }
            if (currentMACD > currentSignal) {
                buyScore += 10;
                buyRationale.push("MACD Line crossed above Signal Line (Bullish Crossover).");
            }
            
            let trend = "Neutral";
            if (ema20 > ema50 && currentPrice > ema20) {
                buyScore += 30;
                trend = "Bullish";
                buyRationale.push("Price is above 20 EMA and 20 EMA > 50 EMA, confirming a strong uptrend.");
            }
            if (currentPrice > data.closes[data.closes.length - 2]) {
                buyScore += 10;
                buyRationale.push("Current price is higher than the previous 15-min close.");
            }
            
            // Sell Scoring
            let sellScore = 0;
            if (currentRSI < 60 && currentRSI > 30) {
                sellScore += 20;
                sellRationale.push(`RSI is in optimal selling/shorting zone (${currentRSI.toFixed(1)}).`);
            }
            if (macdHist < 0) {
                sellScore += 20;
                sellRationale.push("MACD Histogram is negative, indicating downward momentum.");
            }
            if (currentMACD < currentSignal) {
                sellScore += 10;
                sellRationale.push("MACD Line crossed below Signal Line (Bearish Crossover).");
            }
            
            if (ema20 < ema50 && currentPrice < ema20) {
                sellScore += 30;
                trend = "Bearish";
                sellRationale.push("Price is below 20 EMA and 20 EMA < 50 EMA, confirming a strong downtrend.");
            }
            if (currentPrice < data.closes[data.closes.length - 2]) {
                sellScore += 10;
                sellRationale.push("Current price is lower than the previous 15-min close.");
            }
            
            const baseStockData = {
                symbol,
                price: currentPrice,
                rsi: currentRSI,
                macdHist,
                trend,
                atr: currentATR
            };

            buyOpportunities.push({
                ...baseStockData,
                score: Math.round(buyScore),
                type: 'buy',
                target: currentPrice + (3.0 * currentATR),
                stopLoss: currentPrice - (1.5 * currentATR),
                rationale: buyRationale
            });

            sellOpportunities.push({
                ...baseStockData,
                score: Math.round(sellScore),
                type: 'sell',
                target: currentPrice - (3.0 * currentATR),
                stopLoss: currentPrice + (1.5 * currentATR),
                rationale: sellRationale
            });
        }
    }
    
    buyOpportunities.sort((a, b) => b.score - a.score);
    sellOpportunities.sort((a, b) => b.score - a.score);
    
    const top5Buy = buyOpportunities.slice(0, 5);
    const top5Sell = sellOpportunities.slice(0, 5);
    
    const now = new Date();
    // Format time like "09:30 AM"
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0'+minutes : minutes;
    const timeStr = hours + ':' + minutes + ' ' + ampm;
    
    const callRecord = {
        id: Date.now(),
        time: timeStr,
        timestamp: now.getTime(),
        buy: top5Buy,
        sell: top5Sell
    };
    
    // Unshift to put newest at the top
    signalsHistory.unshift(callRecord);
    console.log(`Analysis complete. Generated call for ${timeStr}`);
}

// --- Automated Scheduler ---
// Run immediately on boot for testing/convenience
setTimeout(runMarketAnalysis, 5000); 

// Schedule checker runs every minute
setInterval(() => {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    
    // Trading hours: 9:15 AM to 3:30 PM (15:30)
    // We want calls at 09:30, 10:30, 11:30, 12:30, 13:30, 14:30
    // Check if it's exactly one of these times
    if (mins === 30 && (hours >= 9 && hours <= 14)) {
        // Run analysis (only if we haven't run it in the last 2 minutes to prevent duplicates)
        const lastRun = signalsHistory.length > 0 ? signalsHistory[0].timestamp : 0;
        if (now.getTime() - lastRun > 120000) {
            runMarketAnalysis();
        }
    }
}, 60000);

// --- APIs ---
app.get('/api/live-prices', (req, res) => {
    res.json(livePrices);
});

app.get('/api/signals-history', (req, res) => {
    res.json(signalsHistory);
});

// Force manual run endpoint
app.post('/api/force-analysis', async (req, res) => {
    await runMarketAnalysis();
    res.json({ success: true, latest: signalsHistory[0] });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Professional Dashboard Proxy Server running on http://localhost:${PORT}`);
    updateAllPrices(); // Initial price fetch
});
