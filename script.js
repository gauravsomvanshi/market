const NIFTY_50 = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY',
    'SBIN', 'BHARTIARTL', 'ITC', 'HINDUNILVR', 'LT',
    'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS',
    'KOTAKBANK', 'M&M', 'ONGC', 'TATASTEEL', 'ASIANPAINT'
];

let currentSignals = [];

// --- Dashboard Logic ---

async function fetchAndRenderDashboard() {
    const statusText = document.getElementById('status-text');
    try {
        const response = await fetch('/api/signals-history');
        const history = await response.json();
        
        if (history.length === 0) {
            statusText.innerText = 'Waiting for next automated call (scheduled at 9:30 AM / hourly).';
            return;
        }
        
        statusText.innerText = 'Connected to Trading Bot. Real-time data active.';
        currentSignals = history;
        
        // Render Latest Call
        const latestCall = history[0];
        document.getElementById('active-call-time').innerText = latestCall.time;
        
        renderResults(latestCall.buy, 'buy-results-container');
        renderResults(latestCall.sell, 'sell-results-container');
        
        // Render History Timeline
        renderHistoryTimeline(history);
        
    } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        statusText.innerText = 'Error connecting to backend.';
    }
}

function renderResults(stocks, containerId) {
    const container = document.getElementById(containerId);
    const template = document.getElementById('stock-card-template');
    
    container.innerHTML = '';
    
    stocks.forEach(stock => {
        const clone = template.content.cloneNode(true);
        const cardEl = clone.querySelector('.stock-card');
        cardEl.setAttribute('data-symbol', stock.symbol);
        cardEl.classList.add(stock.type === 'buy' ? 'buy-card' : 'sell-card');
        
        // Add click listener to open modal
        cardEl.addEventListener('click', () => openModal(stock));
        
        clone.querySelector('.stock-symbol').textContent = stock.symbol;
        
        const scoreEl = clone.querySelector('.stock-score');
        scoreEl.classList.add(stock.type === 'buy' ? 'buy-score' : 'sell-score');
        scoreEl.innerHTML = `Score: <span>${stock.score}</span>/100`;
        
        const priceSection = clone.querySelector('.price-section');
        priceSection.style.display = 'flex';
        priceSection.style.justifyContent = 'space-between';
        priceSection.style.alignItems = 'flex-end';
        
        priceSection.innerHTML = `
            <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Call Price</div>
                <div style="font-size: 1.1rem; font-weight: 600; color: #cbd5e1;">₹${stock.price.toFixed(2)}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Live Price</div>
                <div class="current-price" data-prev-price="${stock.price}">₹${stock.price.toFixed(2)}</div>
            </div>
        `;
        
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

function renderHistoryTimeline(history) {
    const container = document.getElementById('history-timeline');
    container.innerHTML = '';
    
    // Skip the first one if we want to show it only as "Active", or show all of them.
    // Let's show all of them, but maybe mark the first as "Active".
    history.forEach((call, index) => {
        const block = document.createElement('div');
        block.className = 'history-block';
        
        let buyChips = call.buy.map(s => `<span class="history-chip chip-buy" onclick="openModalFromHistory('${call.id}', '${s.symbol}', 'buy')">${s.symbol}</span>`).join('');
        let sellChips = call.sell.map(s => `<span class="history-chip chip-sell" onclick="openModalFromHistory('${call.id}', '${s.symbol}', 'sell')">${s.symbol}</span>`).join('');
        
        block.innerHTML = `
            <div class="history-time">${call.time} ${index === 0 ? '<span style="font-size: 0.8rem; background: rgba(34,197,94,0.2); color: var(--success); padding: 0.2rem 0.5rem; border-radius: 4px; margin-left: 10px;">LATEST</span>' : ''}</div>
            <div class="history-row">
                <div class="history-column">
                    <h4>Buy Calls</h4>
                    <div class="history-chips">${buyChips || 'None'}</div>
                </div>
                <div class="history-column">
                    <h4>Sell Calls</h4>
                    <div class="history-chips">${sellChips || 'None'}</div>
                </div>
            </div>
        `;
        container.appendChild(block);
    });
}

// --- Modal Logic ---
const modal = document.getElementById('stock-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

closeModalBtn.addEventListener('click', () => {
    modal.close();
});

modal.addEventListener('click', (e) => {
    const dialogDimensions = modal.getBoundingClientRect();
    if (
        e.clientX < dialogDimensions.left ||
        e.clientX > dialogDimensions.right ||
        e.clientY < dialogDimensions.top ||
        e.clientY > dialogDimensions.bottom
    ) {
        modal.close();
    }
});

window.openModalFromHistory = function(callId, symbol, type) {
    // Find the call
    const call = currentSignals.find(c => c.id == callId);
    if (!call) return;
    
    const stockList = type === 'buy' ? call.buy : call.sell;
    const stock = stockList.find(s => s.symbol === symbol);
    if (!stock) return;
    
    // Inject call time into the stock object for the modal
    stock.callTime = call.time;
    openModal(stock);
}

function openModal(stock) {
    document.getElementById('modal-title').innerText = `${stock.symbol} (${stock.type.toUpperCase()})`;
    
    // Time
    const timeEl = document.getElementById('modal-time');
    timeEl.innerText = `Call Generated At: ${stock.callTime || document.getElementById('active-call-time').innerText}`;
    
    // Targets
    document.getElementById('modal-target').innerText = `₹${stock.target.toFixed(2)}`;
    document.getElementById('modal-stoploss').innerText = `₹${stock.stopLoss.toFixed(2)}`;
    
    // Rationale List
    const rationaleList = document.getElementById('modal-rationale-list');
    rationaleList.innerHTML = '';
    
    if (stock.rationale && stock.rationale.length > 0) {
        stock.rationale.forEach(reason => {
            const li = document.createElement('li');
            li.innerText = reason;
            rationaleList.appendChild(li);
        });
    } else {
        rationaleList.innerHTML = '<li>Automated technical criteria met.</li>';
    }
    
    modal.showModal();
}

// --- Live Price Auto-Refresh & Watchlist ---

function initAllStocksWatchlist() {
    const grid = document.getElementById('all-stocks-grid');
    const ticker = document.getElementById('custom-ticker');
    if (!grid) return;
    
    grid.innerHTML = '';
    let tickerHtml = '';
    
    NIFTY_50.forEach(symbol => {
        const cleanSymbol = symbol;
        
        // Setup Grid Cards
        const card = document.createElement('div');
        card.className = 'mini-stock-card';
        card.setAttribute('data-watch-symbol', cleanSymbol);
        card.innerHTML = `<div class="mini-symbol">${cleanSymbol}</div><div class="mini-price" data-prev-price="0">--</div>`;
        grid.appendChild(card);
        
        // Setup Ticker HTML
        tickerHtml += `<div class="ticker-item" data-ticker-symbol="${cleanSymbol}"><span class="ticker-symbol">${cleanSymbol}</span><span class="ticker-price" data-prev-price="0">--</span></div>`;
    });
    
    if (ticker) {
        ticker.innerHTML = tickerHtml + tickerHtml;
    }
}

async function autoRefreshPrices() {
    try {
        const response = await fetch('/api/live-prices');
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
                    void priceEl.offsetWidth; 
                    if (latestPrice > prevPrice) priceEl.classList.add('flash-green');
                    else priceEl.classList.add('flash-red');
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
                    if (latestPrice > prevPrice) priceEl.classList.add('text-success');
                    else priceEl.classList.add('text-danger');
                }
                priceEl.textContent = `₹${latestPrice.toFixed(2)}`;
                priceEl.setAttribute('data-prev-price', latestPrice);
            }
        });

        // Also update main analysis cards
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
                    void priceEl.offsetWidth; 
                    if (latestPrice > prevPrice) priceEl.classList.add('flash-green');
                    else priceEl.classList.add('flash-red');
                }
                priceEl.textContent = `₹${latestPrice.toFixed(2)}`;
                priceEl.setAttribute('data-prev-price', latestPrice);
            }
        });
    } catch(err) {
        console.error("Failed to fetch live prices from backend proxy", err);
    }
}

// Check for new signals every minute
setInterval(fetchAndRenderDashboard, 60000);

// Initialize
initAllStocksWatchlist();
autoRefreshPrices();
setInterval(autoRefreshPrices, 10000); // 10s price refresh
fetchAndRenderDashboard(); // Initial load
