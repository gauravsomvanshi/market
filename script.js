const NIFTY_50 = [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS',
    'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'HINDUNILVR.NS', 'LT.NS',
    'BAJFINANCE.NS', 'HCLTECH.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 'TATAMOTORS.NS',
    'KOTAKBANK.NS', 'M&M.NS', 'ONGC.NS', 'TATASTEEL.NS', 'ASIANPAINT.NS'
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
    
    const buyContainer = document.getElementById('buy-results-container');
    const sellContainer = document.getElementById('sell-results-container');
    
    btn.disabled = true;
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
    
    buyContainer.innerHTML = '';
    sellContainer.innerHTML = '';
    
    let buyOpportunities = [];
    let sellOpportunities = [];
    
    for (let i = 0; i < NIFTY_50.length; i++) {
        const symbol = NIFTY_50[i];
        statusText.innerText = `Analyzing ${symbol} (${i + 1}/${NIFTY_50.length})...`;
        
        const data = await fetchStockData(symbol);
        
        if (data && data.closes.length > 50) {
            const currentPrice = data.closes[data.closes.length - 1];
            
            // Indicators
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
            
            // --- Buy Scoring ---
            let buyScore = 0;
            if (currentRSI > 40 && currentRSI < 70) buyScore += 20;
            if (macdHist > 0) buyScore += 20;
            if (currentMACD > currentSignal) buyScore += 10;
            
            let trend = "Neutral";
            if (ema20 > ema50 && currentPrice > ema20) {
                buyScore += 30;
                trend = "Bullish";
            }
            if (currentPrice > data.closes[data.closes.length - 2]) buyScore += 10;
            
            // --- Sell Scoring ---
            let sellScore = 0;
            if (currentRSI < 60 && currentRSI > 30) sellScore += 20;
            if (macdHist < 0) sellScore += 20;
            if (currentMACD < currentSignal) sellScore += 10;
            
            if (ema20 < ema50 && currentPrice < ema20) {
                sellScore += 30;
                trend = "Bearish";
            }
            if (currentPrice < data.closes[data.closes.length - 2]) sellScore += 10;
            
            // Push to respective arrays
            const baseStockData = {
                symbol: symbol.replace('.NS', ''),
                price: currentPrice,
                rsi: currentRSI,
                macdHist: macdHist,
                trend: trend,
                atr: currentATR
            };

            // Calculate targets
            buyOpportunities.push({
                ...baseStockData,
                score: Math.round(buyScore),
                type: 'buy',
                target: currentPrice + (3.0 * currentATR),
                stopLoss: currentPrice - (1.5 * currentATR)
            });

            sellOpportunities.push({
                ...baseStockData,
                score: Math.round(sellScore),
                type: 'sell',
                target: currentPrice - (3.0 * currentATR),
                stopLoss: currentPrice + (1.5 * currentATR)
            });
        }
    }
    
    // Sort and slice top 5
    buyOpportunities.sort((a, b) => b.score - a.score);
    sellOpportunities.sort((a, b) => b.score - a.score);
    
    const top5Buy = buyOpportunities.slice(0, 5);
    const top5Sell = sellOpportunities.slice(0, 5);
    
    // Override delayed prices with TRUE real-time prices before rendering
    try {
        const response = await fetch('http://localhost:3000/api/live-prices');
        const livePrices = await response.json();
        
        [...top5Buy, ...top5Sell].forEach(stock => {
            if (livePrices[stock.symbol]) {
                stock.price = livePrices[stock.symbol];
            }
        });
    } catch(err) {
        console.error("Failed to fetch live prices for initial render", err);
    }
    
    statusText.innerText = `Analysis complete. Real-time data connected.`;
    
    renderResults(top5Buy, 'buy-results-container');
    renderResults(top5Sell, 'sell-results-container');
    
    btn.disabled = false;
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
}

function renderResults(stocks, containerId) {
    const container = document.getElementById(containerId);
    const template = document.getElementById('stock-card-template');
    
    stocks.forEach(stock => {
        const clone = template.content.cloneNode(true);
        const cardEl = clone.querySelector('.stock-card');
        cardEl.setAttribute('data-symbol', stock.symbol);
        cardEl.classList.add(stock.type === 'buy' ? 'buy-card' : 'sell-card');
        
        clone.querySelector('.stock-symbol').textContent = stock.symbol;
        
        const scoreEl = clone.querySelector('.stock-score');
        scoreEl.classList.add(stock.type === 'buy' ? 'buy-score' : 'sell-score');
        scoreEl.innerHTML = `Score: <span>${stock.score}</span>/100`;
        
        const priceSection = clone.querySelector('.price-section');
        priceSection.innerHTML = `<div class="current-price" data-prev-price="${stock.price}">₹${stock.price.toFixed(2)}</div>`;
        
        // RSI
        const rsiEl = clone.querySelector('.rsi-value');
        rsiEl.textContent = stock.rsi.toFixed(2);
        
        // MACD
        const macdEl = clone.querySelector('.macd-value');
        macdEl.textContent = stock.macdHist > 0 ? `+${stock.macdHist.toFixed(2)}` : stock.macdHist.toFixed(2);
        
        // Trend
        const trendEl = clone.querySelector('.ema-trend');
        trendEl.textContent = stock.trend;
        if (stock.trend === 'Bullish') trendEl.className += ' text-success';
        else if (stock.trend === 'Bearish') trendEl.className += ' text-danger';
        else trendEl.className += ' text-warning';
        
        // Target and Stop Loss
        clone.querySelector('.target-value').textContent = `₹${stock.target.toFixed(2)}`;
        clone.querySelector('.sl-value').textContent = `₹${stock.stopLoss.toFixed(2)}`;
        
        // Action Button
        const btn = clone.querySelector('.action-btn');
        btn.textContent = stock.type === 'buy' ? 'BUY TARGET' : 'SELL TARGET';
        
        container.appendChild(clone);
    });
}

// --- Live Price Auto-Refresh & Watchlist ---

let refreshInterval = null;

function initAllStocksWatchlist() {
    const grid = document.getElementById('all-stocks-grid');
    const ticker = document.getElementById('custom-ticker');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    let tickerHtml = '';
    
    NIFTY_50.forEach(symbol => {
        const cleanSymbol = symbol.replace('.NS', '');
        
        // Setup Grid Cards
        const card = document.createElement('div');
        card.className = 'mini-stock-card';
        card.setAttribute('data-watch-symbol', cleanSymbol);
        
        card.innerHTML = `
            <div class="mini-symbol">${cleanSymbol}</div>
            <div class="mini-price" data-prev-price="0">--</div>
        `;
        grid.appendChild(card);
        
        // Setup Ticker HTML
        tickerHtml += `
            <div class="ticker-item" data-ticker-symbol="${cleanSymbol}">
                <span class="ticker-symbol">${cleanSymbol}</span>
                <span class="ticker-price" data-prev-price="0">--</span>
            </div>
        `;
    });
    
    if (ticker) {
        // Duplicate content for seamless infinite scrolling
        ticker.innerHTML = tickerHtml + tickerHtml;
    }
}

async function autoRefreshPrices() {
    try {
        const response = await fetch('http://localhost:3000/api/live-prices');
        const livePrices = await response.json();
        
        const results = Object.keys(livePrices).map(symbol => {
            return { symbol: symbol, price: livePrices[symbol] };
        });
    
    // Update mini watchlist
    const gridCards = document.querySelectorAll('.mini-stock-card');
    gridCards.forEach(card => {
        const sym = card.getAttribute('data-watch-symbol');
        const stockResult = results.find(r => r.symbol === sym);
        
        if (stockResult && stockResult.price) {
            const latestPrice = stockResult.price;
            const priceEl = card.querySelector('.mini-price');
            const prevPrice = parseFloat(priceEl.getAttribute('data-prev-price')) || 0;
            
            if (latestPrice !== prevPrice && prevPrice !== 0) {
                priceEl.classList.remove('flash-green', 'flash-red');
                void priceEl.offsetWidth; // Trigger reflow
                if (latestPrice > prevPrice) {
                    priceEl.classList.add('flash-green');
                } else {
                    priceEl.classList.add('flash-red');
                }
            }
            priceEl.textContent = `₹${latestPrice.toFixed(2)}`;
            priceEl.setAttribute('data-prev-price', latestPrice);
        }
    });

    // Update custom scrolling ticker
    const tickerItems = document.querySelectorAll('.ticker-item');
    tickerItems.forEach(item => {
        const sym = item.getAttribute('data-ticker-symbol');
        const stockResult = results.find(r => r.symbol === sym);
        
        if (stockResult && stockResult.price) {
            const latestPrice = stockResult.price;
            const priceEl = item.querySelector('.ticker-price');
            const prevPrice = parseFloat(priceEl.getAttribute('data-prev-price')) || 0;
            
            if (latestPrice !== prevPrice && prevPrice !== 0) {
                priceEl.classList.remove('text-success', 'text-danger');
                if (latestPrice > prevPrice) {
                    priceEl.classList.add('text-success');
                } else {
                    priceEl.classList.add('text-danger');
                }
            }
            priceEl.textContent = `₹${latestPrice.toFixed(2)}`;
            priceEl.setAttribute('data-prev-price', latestPrice);
        }
    });

    // Also update main analysis cards if they exist
    const mainCards = document.querySelectorAll('.stock-card');
    mainCards.forEach(card => {
        const sym = card.getAttribute('data-symbol');
        const stockResult = results.find(r => r.symbol === sym);
        
        if (stockResult && stockResult.price) {
            const latestPrice = stockResult.price;
            const priceEl = card.querySelector('.current-price');
            const prevPrice = parseFloat(priceEl.getAttribute('data-prev-price')) || 0;
            
            if (latestPrice !== prevPrice && prevPrice !== 0) {
                priceEl.classList.remove('flash-green', 'flash-red');
                void priceEl.offsetWidth; // Trigger reflow
                if (latestPrice > prevPrice) {
                    priceEl.classList.add('flash-green');
                } else {
                    priceEl.classList.add('flash-red');
                }
            }
            priceEl.textContent = `₹${latestPrice.toFixed(2)}`;
            priceEl.setAttribute('data-prev-price', latestPrice);
        }
    });
    } catch(err) {
        console.error("Failed to fetch live prices from backend proxy", err);
    }
}

// Initialize the watchlist and start fetching immediately
initAllStocksWatchlist();
autoRefreshPrices();
refreshInterval = setInterval(autoRefreshPrices, 15000); // Check every 15 seconds

document.getElementById('analyze-btn').addEventListener('click', async () => {
    await analyzeStocks();
});
