const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

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
        const response = await fetch(API_BASE_URL + '/api/signals-history');
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
        const response = await fetch(API_BASE_URL + '/api/live-prices');
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

// --- Stock Search Logic ---
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('stock-search-input');
const searchError = document.getElementById('search-error');
const searchResultContainer = document.getElementById('search-result-container');

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const symbol = searchInput.value.trim().toUpperCase();
    if (!symbol) return;
    
    // Reset state
    searchError.style.display = 'none';
    searchResultContainer.style.display = 'block';
    searchResultContainer.innerHTML = '<div style="text-align:center; padding: 2rem;"><div class="loader" style="margin: 0 auto; border-top-color: var(--primary-accent);"></div><p style="margin-top:1rem; color: var(--text-muted);">Running full technical analysis...</p></div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze/${symbol}`);
        const data = await response.json();
        
        if (response.ok) {
            renderSearchResult(data);
        } else {
            searchError.innerText = data.error || 'Failed to analyze stock.';
            searchError.style.display = 'block';
            searchResultContainer.style.display = 'none';
        }
    } catch(err) {
        searchError.innerText = 'Network error. Could not connect to backend.';
        searchError.style.display = 'block';
        searchResultContainer.style.display = 'none';
    }
}

function renderSearchResult(data) {
    let badgeClass = 'decision-neutral';
    if (data.decision === 'buy') badgeClass = 'decision-buy';
    if (data.decision === 'sell') badgeClass = 'decision-sell';
    
    let rationaleHtml = '';
    if (data.rationale && data.rationale.length > 0) {
        rationaleHtml = `
            <div style="margin-top: 1.5rem; background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <h3 style="color: var(--text-muted); font-size: 1.1rem; margin-bottom: 0.8rem; text-transform: uppercase; letter-spacing: 1px;">Technical Rationale</h3>
                <ul style="padding-left: 1.5rem; line-height: 1.6; color: #cbd5e1;">
                    ${data.rationale.map(r => `<li style="margin-bottom: 0.5rem;">${r}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    searchResultContainer.innerHTML = `
        <div class="search-result-card" style="animation: fade-in 0.5s ease-out;">
            <div class="search-result-header">
                <div class="search-result-title">${data.symbol}</div>
                <div class="search-decision-badge ${badgeClass}">${data.decision}</div>
            </div>
            
            <div class="search-metrics-grid">
                <div class="search-metric">
                    <span class="label">Live Price</span>
                    <span class="value">₹${data.price.toFixed(2)}</span>
                </div>
                <div class="search-metric">
                    <span class="label">Trend (EMA)</span>
                    <span class="value ${data.trend === 'Bullish' ? 'text-success' : (data.trend === 'Bearish' ? 'text-danger' : '')}">${data.trend}</span>
                </div>
                <div class="search-metric">
                    <span class="label">RSI (14)</span>
                    <span class="value">${data.rsi.toFixed(2)}</span>
                </div>
                <div class="search-metric">
                    <span class="label">MACD</span>
                    <span class="value ${data.macdHist > 0 ? 'text-success' : 'text-danger'}">${data.macdHist > 0 ? '+' : ''}${data.macdHist.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="search-metrics-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 1rem;">
                <div class="search-metric" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
                    <span class="label">Support Level</span>
                    <span class="value text-success">₹${data.support.toFixed(2)}</span>
                </div>
                <div class="search-metric" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);">
                    <span class="label">Resistance Level</span>
                    <span class="value text-danger">₹${data.resistance.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="search-metrics-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 0;">
                <div class="search-metric" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3);">
                    <span class="label">Next Target</span>
                    <span class="value" style="color: #60a5fa;">₹${data.target.toFixed(2)}</span>
                </div>
                <div class="search-metric" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);">
                    <span class="label">Suggested Stop Loss</span>
                    <span class="value" style="color: #fcd34d;">₹${data.stopLoss.toFixed(2)}</span>
                </div>
            </div>
            
            ${rationaleHtml}
        </div>
    `;
}
