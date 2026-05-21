const NIFTY_50 = [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS',
    'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'HINDUNILVR.NS', 'LT.NS',
    'BAJFINANCE.NS', 'HCLTECH.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 'TATAMOTORS.NS',
    'KOTAKBANK.NS', 'M&M.NS', 'ONGC.NS', 'TATASTEEL.NS', 'ASIANPAINT.NS'
    // Limiting to top 20 for faster browser-side processing demo
];

const CORS_PROXY = 'https://corsproxy.io/?';

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
    
    // First EMA is SMA
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

// --- API Fetching ---

async function fetchStockData(symbol) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=15m`;
        const proxiedUrl = CORS_PROXY + encodeURIComponent(url);
        
        const response = await fetch(proxiedUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) return null;
        
        const quote = data.chart.result[0].indicators.quote[0];
        const closes = quote.close;
        const highs = quote.high;
        const lows = quote.low;
        
        // Remove nulls
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
        console.error(`Error fetching ${symbol}:`, error);
        return null;
    }
}

// --- Main Logic ---

async function analyzeStocks() {
    const btn = document.getElementById('analyze-btn');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.loader');
    const statusText = document.getElementById('status-text');
    const resultsContainer = document.getElementById('results-container');
    
    btn.disabled = true;
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
    resultsContainer.innerHTML = '';
    
    let analyzedStocks = [];
    
    for (let i = 0; i < NIFTY_50.length; i++) {
        const symbol = NIFTY_50[i];
        statusText.innerText = `Analyzing ${symbol} (${i + 1}/${NIFTY_50.length})...`;
        
        const data = await fetchStockData(symbol);
        
        if (data && data.closes.length > 50) {
            const currentPrice = data.closes[data.closes.length - 1];
            
            // Calculate indicators
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
            
            // Scoring logic
            let score = 0;
            
            // 1. RSI (Bullish if between 40 and 60, strongly bullish if oversold reversing)
            if (currentRSI > 30 && currentRSI < 70) score += 20;
            if (currentRSI > 40 && currentRSI < 60) score += 10;
            
            // 2. MACD (Bullish crossover or positive histogram)
            if (macdHist > 0) score += 20;
            if (currentMACD > currentSignal) score += 10;
            
            // 3. Trend (EMA 20 > EMA 50)
            let trend = "Neutral";
            if (ema20 > ema50 && currentPrice > ema20) {
                score += 30;
                trend = "Bullish";
            } else if (ema20 < ema50) {
                trend = "Bearish";
            }
            
            // 4. Momentum (Price > previous price)
            if (currentPrice > data.closes[data.closes.length - 2]) score += 10;
            
            // Intraday Target and Stop Loss Calculation
            const stopLoss = currentPrice - (1.5 * currentATR);
            const target = currentPrice + (3.0 * currentATR);
            
            analyzedStocks.push({
                symbol: symbol.replace('.NS', ''),
                price: currentPrice,
                score: Math.round(score),
                rsi: currentRSI,
                macdHist: macdHist,
                trend: trend,
                target: target,
                stopLoss: stopLoss
            });
        }
    }
    
    // Sort by score descending and take top 5
    analyzedStocks.sort((a, b) => b.score - a.score);
    const top5 = analyzedStocks.slice(0, 5);
    
    statusText.innerText = `Analysis complete. Found top ${top5.length} opportunities.`;
    renderResults(top5);
    
    btn.disabled = false;
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
}

function renderResults(stocks) {
    const container = document.getElementById('results-container');
    const template = document.getElementById('stock-card-template');
    
    stocks.forEach(stock => {
        const clone = template.content.cloneNode(true);
        
        clone.querySelector('.stock-symbol').textContent = stock.symbol;
        clone.querySelector('.stock-score span').textContent = stock.score;
        clone.querySelector('.current-price').textContent = `₹${stock.price.toFixed(2)}`;
        
        // RSI
        const rsiEl = clone.querySelector('.rsi-value');
        rsiEl.textContent = stock.rsi.toFixed(2);
        if (stock.rsi < 30) rsiEl.className += ' text-success';
        else if (stock.rsi > 70) rsiEl.className += ' text-danger';
        else rsiEl.className += ' text-warning';
        
        // MACD
        const macdEl = clone.querySelector('.macd-value');
        macdEl.textContent = stock.macdHist > 0 ? `+${stock.macdHist.toFixed(2)}` : stock.macdHist.toFixed(2);
        macdEl.className += stock.macdHist > 0 ? ' text-success' : ' text-danger';
        
        // Trend
        const trendEl = clone.querySelector('.ema-trend');
        trendEl.textContent = stock.trend;
        if (stock.trend === 'Bullish') trendEl.className += ' text-success';
        else if (stock.trend === 'Bearish') trendEl.className += ' text-danger';
        else trendEl.className += ' text-warning';
        
        // Target and Stop Loss
        clone.querySelector('.target-value').textContent = `₹${stock.target.toFixed(2)}`;
        clone.querySelector('.sl-value').textContent = `₹${stock.stopLoss.toFixed(2)}`;
        
        container.appendChild(clone);
    });
}

document.getElementById('analyze-btn').addEventListener('click', analyzeStocks);
