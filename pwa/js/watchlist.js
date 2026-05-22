export function watchlistKey(market, ticker) {
  return `${market}:${ticker}`;
}

export function isWatched(market, ticker, state) {
  return state.watchlist.some(w => w.market === market && w.ticker === ticker);
}

export function toggleWatchlist(market, ticker, state, saveState, render) {
  const idx = state.watchlist.findIndex(w => w.market === market && w.ticker === ticker);
  if (idx >= 0) {
    state.watchlist.splice(idx, 1);
  } else {
    if (state.watchlist.length >= 20) { alert('Watchlist full (max 20).'); return; }
    state.watchlist.push({ market, ticker });
  }
  saveState();
  render();
}

export function renderWatchlist(state, data, saveState, render) {
  const section = document.getElementById('watchlistSection');
  const grid = document.getElementById('watchlistGrid');
  if (state.tab === 'analyze') { section.style.display = 'none'; return; }
  section.style.display = 'block';
  if (state.watchlist.length === 0) {
    grid.innerHTML = `<div class="watchlist-empty">★ Tap the star on any stock to watch its EOD close here</div>`;
    return;
  }
  grid.className = 'watchlist-grid';
  grid.innerHTML = state.watchlist.map(w => {
    const stock = data[w.market]?.find(s => s.ticker === w.ticker);
    if (!stock) return '';
    const currency = w.market === 'us' ? '$' : '₹';
    const dayChange = (Math.random() - 0.45) * 4;
    return `
      <div class="watchlist-card" data-wl-key="${watchlistKey(w.market, w.ticker)}">
        <div class="wl-remove" data-remove-wl="${watchlistKey(w.market, w.ticker)}">×</div>
        <div class="wl-ticker">${stock.ticker}</div>
        <div class="wl-name">${stock.name}</div>
        <div class="wl-price">${currency}${stock.livePrice.toLocaleString(w.market === 'us' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="wl-change ${dayChange >= 0 ? 'up' : 'down'}">
          ${dayChange >= 0 ? '▲' : '▼'} ${Math.abs(dayChange).toFixed(2)}%
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-remove-wl]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const [market, ticker] = e.currentTarget.dataset.removeWl.split(':');
      toggleWatchlist(market, ticker, state, saveState, render);
    });
  });
  grid.querySelectorAll('.watchlist-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('wl-remove')) return;
      const [market, ticker] = card.dataset.wlKey.split(':');
      state.tab = 'analyze';
      state.analyzerMode = 'single';
      state.analyzerMarket = market;
      state.analyzerPicks = [ticker];
      saveState();
      render();
    });
  });
}
