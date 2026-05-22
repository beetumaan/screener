import { scoreStock, evaluateFilter, formatValue, describeThreshold, verdictIcon } from './scoring.js';
import { isWatched, toggleWatchlist } from './watchlist.js';
import { renderNewsInto } from './news.js';

export function renderAnalyzer(state, data, filters, saveState, render, wireFilterEvents) {
  document.querySelectorAll('.analyzer-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.amode === state.analyzerMode);
  });
  document.getElementById('contextLabel').textContent = `Analyze · ${state.analyzerMode}`;
  document.getElementById('contextMeta').textContent = state.analyzerPicks.length
    ? `${state.analyzerPicks.length} selected`
    : 'pick a stock to start';

  const marketLabels = { india: '🇮🇳 India stocks', us: '🇺🇸 US stocks', mf: '📊 India mutual funds' };
  const marketText = document.getElementById('marketSelectText');
  if (state.analyzerMarket) {
    marketText.textContent = marketLabels[state.analyzerMarket];
    marketText.classList.remove('dropdown-placeholder');
    document.getElementById('stockPickerWrap').style.display = 'flex';
  } else {
    marketText.textContent = 'Choose market';
    marketText.classList.add('dropdown-placeholder');
    document.getElementById('stockPickerWrap').style.display = 'none';
  }

  document.getElementById('stockPickerLabel').textContent =
    state.analyzerMode === 'compare' ? 'Add stocks (2-3)' : 'Stock';
  const pickerText = document.getElementById('stockPickerText');
  if (state.analyzerMode === 'single' && state.analyzerPicks.length === 1) {
    const stock = data[state.analyzerMarket]?.find(s => s.ticker === state.analyzerPicks[0]);
    pickerText.textContent = stock ? `${stock.ticker} · ${stock.name}` : 'Search stock';
    pickerText.classList.remove('dropdown-placeholder');
  } else {
    pickerText.textContent = state.analyzerMode === 'compare' ? 'Add stock' : 'Search stock or fund';
    pickerText.classList.add('dropdown-placeholder');
  }

  const chipsContainer = document.getElementById('pickedChips');
  if (state.analyzerMode === 'compare' && state.analyzerPicks.length > 0) {
    chipsContainer.style.display = 'flex';
    chipsContainer.innerHTML = state.analyzerPicks
      .map(t => `<span class="picked-chip">${t} <span class="picked-chip-x" data-remove="${t}">×</span></span>`)
      .join('');
    chipsContainer.querySelectorAll('.picked-chip-x').forEach(x => {
      x.addEventListener('click', e => {
        state.analyzerPicks = state.analyzerPicks.filter(t => t !== e.target.dataset.remove);
        saveState();
        render();
      });
    });
  } else {
    chipsContainer.style.display = 'none';
  }

  const content = document.getElementById('analyzerContent');
  if (!state.analyzerMarket) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">⌁</div><div class="empty-text">Choose a market to begin</div><div class="empty-sub">Stock, fund, or US equity — your call</div></div>`;
    return;
  }
  if (state.analyzerPicks.length === 0) {
    const totalFilters = filters[state.analyzerMarket].groups.reduce((a, g) => a + g.filters.length, 0);
    content.innerHTML = `<div class="empty"><div class="empty-icon">⌁</div><div class="empty-text">Pick a ${state.analyzerMode === 'compare' ? 'few stocks' : 'stock'} to analyze</div><div class="empty-sub">All ${totalFilters} filters will be evaluated</div></div>`;
    return;
  }

  if (state.analyzerMode === 'single') {
    renderSingleAnalysis(content, state, data, filters, saveState, render, wireFilterEvents);
  } else {
    renderCompareAnalysis(content, state, data, filters, wireFilterEvents);
  }
}

function renderSingleAnalysis(container, state, data, filters, saveState, render, wireFilterEvents) {
  const mode = state.analyzerMarket;
  const ticker = state.analyzerPicks[0];
  const stock = data[mode]?.find(s => s.ticker === ticker);
  if (!stock) { container.innerHTML = `<div class="empty">Stock not found</div>`; return; }

  const cfg = filters[mode];
  const { score, total, unknown, active, passRate, results } = scoreStock(stock, mode, state, filters);
  const tier = passRate === null ? 'fail' : passRate >= 0.85 ? 'pass' : passRate >= 0.65 ? 'warn' : 'fail';
  const starred = isWatched(mode, ticker, state);
  const passRateLabel = passRate !== null ? `${Math.round(passRate * 100)}% of evaluable` : 'insufficient data';

  let html = `<section class="section">
    <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
      <button class="star-btn ${starred ? 'starred' : ''}" data-star-analyzer="${ticker}" style="font-size: 22px; padding: 4px 10px;">${starred ? '★ Watched' : '☆ Add to watchlist'}</button>
    </div>
    <div class="summary">
      <div class="stat">
        <div class="stat-label">Score</div>
        <div class="stat-value ${tier === 'pass' ? 'pass' : tier === 'fail' ? 'fail' : ''}" style="${tier === 'warn' ? 'color: var(--warn);' : ''}">${score}<span style="font-size: 16px; color: var(--text-faint);">/${total}</span></div>
        <div class="stat-sub">${passRateLabel}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Passes</div>
        <div class="stat-value pass">${results.filter(r => r.verdict === 'pass').length}</div>
        <div class="stat-sub">${results.filter(r => r.verdict === 'warn').length} marginal</div>
      </div>
      <div class="stat">
        <div class="stat-label">Fails · ?</div>
        <div class="stat-value fail">${results.filter(r => r.verdict === 'fail').length}</div>
        <div class="stat-sub">${unknown} unknown</div>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="section-title"><span>Filter-by-filter analysis</span><span class="count">${stock.ticker}</span></div>`;

  cfg.groups.forEach((group, gIdx) => {
    const groupResults = results.filter(r => r.groupName === group.name);
    if (groupResults.length === 0) return;
    const passed = groupResults.filter(r => r.verdict === 'pass').length;
    html += `<div class="filter-group">
      <div class="filter-group-header">
        <span class="filter-group-name">${group.name}</span>
        <span class="filter-group-meta">
          <span class="group-score"><span class="num" style="color: ${passed === groupResults.length ? 'var(--pass)' : passed === 0 ? 'var(--fail)' : 'var(--warn)'};">${passed}</span>/${groupResults.length}</span>
          <span class="chevron">▾</span>
        </span>
      </div>
      <div class="filter-list">
        ${groupResults.map(r => `<div class="analyzer-filter">
          <div class="analyzer-filter-left">
            <div class="analyzer-filter-name">${r.filter.label} <span class="info-btn" data-tip-id="${r.filter.id}">i</span></div>
            <div class="analyzer-filter-threshold">${describeThreshold(r.filter)}</div>
          </div>
          <div class="analyzer-filter-right">
            <div class="analyzer-value-grid"><span class="analyzer-value ${r.verdict}">${formatValue(r.value, r.filter)}</span></div>
            <span class="verdict ${r.verdict}">${verdictIcon(r.verdict)}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  });
  html += `</section>`;

  // News placeholder — filled asynchronously after container is in the DOM
  if (mode === 'us') {
    html += `<section class="section" id="news-section-${ticker}">
      <div class="news-loading">
        <div class="news-loading-dot"></div>
        <div class="news-loading-dot"></div>
        <div class="news-loading-dot"></div>
      </div>
    </section>`;
  }

  container.innerHTML = html;
  wireFilterEvents(container);
  const starBtn = container.querySelector('[data-star-analyzer]');
  if (starBtn) starBtn.addEventListener('click', () => toggleWatchlist(mode, starBtn.dataset.starAnalyzer, state, saveState, render));

  // Fire news fetch after DOM is painted — doesn't block the filter view
  if (mode === 'us') {
    const newsEl = document.getElementById(`news-section-${ticker}`);
    if (newsEl) renderNewsInto(ticker, newsEl);
  }
}

function renderCompareAnalysis(container, state, data, filters, wireFilterEvents) {
  const mode = state.analyzerMarket;
  const tickers = state.analyzerPicks.slice(0, 3);
  const stocks = tickers.map(t => data[mode]?.find(s => s.ticker === t)).filter(Boolean);
  if (stocks.length === 0) { container.innerHTML = `<div class="empty">No stocks selected</div>`; return; }

  const cfg = filters[mode];
  const scored = stocks.map(s => ({ stock: s, result: scoreStock(s, mode, state, filters) }));

  let html = `<section class="section">
    <div class="summary">
      ${scored.map(({ stock, result }) => {
        const { score, total, unknown, passRate } = result;
        const pctLabel = passRate !== null ? `${Math.round(100 * passRate)}%` : 'n/a';
        const valClass = passRate === null ? 'fail' : passRate >= 0.85 ? 'pass' : passRate < 0.65 ? 'fail' : '';
        const valStyle = passRate !== null && passRate >= 0.65 && passRate < 0.85 ? 'color: var(--warn);' : '';
        return `<div class="stat">
          <div class="stat-label">${stock.ticker}</div>
          <div class="stat-value ${valClass}" style="${valStyle}">${score}<span style="font-size: 14px; color: var(--text-faint);">/${total}</span></div>
          <div class="stat-sub">${pctLabel}${unknown > 0 ? ` · ${unknown}?` : ''}</div>
        </div>`;
      }).join('')}
    </div>
  </section>
  <section class="section">
    <div class="section-title"><span>Side-by-side</span><span class="count">${stocks.length} stocks</span></div>`;

  cfg.groups.forEach((group) => {
    html += `<div class="filter-group">
      <div class="filter-group-header">
        <span class="filter-group-name">${group.name}</span>
        <span class="filter-group-meta"><span class="chevron">▾</span></span>
      </div>
      <div class="filter-list">`;
    group.filters.forEach(filter => {
      if (state.filterStates[filter.id] === 'off') return;
      html += `<div class="compare-grid">
        <div class="compare-filter-name">${filter.label} <span class="info-btn" data-tip-id="${filter.id}">i</span></div>
        <div class="compare-filter-threshold">${describeThreshold(filter)}</div>
        <div class="compare-cols">`;
      stocks.forEach(stock => {
        const value = stock.metrics[filter.id];
        const verdict = evaluateFilter(filter, value);
        html += `<div class="compare-cell">
          <span class="compare-cell-ticker">${stock.ticker}</span>
          <span class="compare-cell-value">
            <span class="analyzer-value ${verdict}">${formatValue(value, filter)}</span>
            <span class="verdict ${verdict}">${verdictIcon(verdict)}</span>
          </span>
        </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div></div>`;
  });
  html += `</section>`;

  container.innerHTML = html;
  wireFilterEvents(container);
}
