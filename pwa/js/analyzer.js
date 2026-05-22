import { scoreStock, evaluateFilter, formatValue, describeThreshold, verdictIcon } from './scoring.js';
import { isWatched, toggleWatchlist } from './watchlist.js';
import { renderNewsInto } from './news.js';
import { detectPatterns } from './pattern-engine.js';
import { openFlexibleSheet } from './ui.js';

// ── Context block tooltips ─────────────────────────────────────────────────────
const CONTEXT_TOOLTIPS = {
  verdict: {
    title: 'Verdict patterns',
    sections: [
      { label: 'What it means', text: 'Patterns combine multiple data points into named investing setups. A match means all the pattern\'s conditions are true for this stock right now.' },
      { label: 'Tiers', text: 'Bullish patterns suggest a potential opportunity. Bearish patterns suggest caution or downside risk. Warning patterns flag specific concerns (overvaluation, pledged shares, retail enthusiasm).' },
      { label: 'Couldn\'t evaluate', text: 'Some patterns need data we don\'t have for every stock (e.g., PEG ratio for India, 5Y P/E history for newer listings). Rather than guess, we flag them honestly.' },
      { label: 'Important', text: 'A matched pattern is one signal among many, not a buy/sell recommendation. Always confirm with the underlying data below.' },
    ],
  },
  ownership_india: {
    title: 'Ownership trend',
    sections: [
      { label: 'Promoter', text: 'The founding family or controlling group. Stable high promoter holding (above 50%) means owners have skin in the game. Promoter selling is often a warning sign; promoter buying is bullish.' },
      { label: 'FII (Foreign Institutional Investors)', text: 'Foreign mutual funds and pension funds. Their flows often move markets. FII selling = "smart money" leaving; FII buying = institutional confidence.' },
      { label: 'DII (Domestic Institutional Investors)', text: 'Indian mutual funds and insurance companies. Slower-moving than FII but more familiar with Indian businesses.' },
      { label: 'Public', text: 'Retail investors. Counter-intuitively, rising retail holding is often a contrarian warning — by the time retail piles in, institutions have usually moved on.' },
      { label: 'Pledged', text: 'Shares the promoter has pledged as collateral for loans. Pledging above 25% is a red flag — a stock price drop can trigger forced selling.' },
      { label: 'Reading the arrows', text: '↑ = stake increased >0.3pp this quarter. ↓ = decreased >0.3pp. → = roughly flat.' },
    ],
  },
  ownership_us: {
    title: 'Ownership trend',
    sections: [
      { label: 'Institutional', text: 'Mutual funds, pension funds, hedge funds. High institutional ownership (above 70%) means professional money manages most of the float. Their trends signal smart money positioning.' },
      { label: 'Insider', text: 'Company executives and directors. Positive trend means insiders are net buyers — a classic bullish signal. Negative means they are net sellers, though planned 10b5-1 sales are routine.' },
      { label: 'How the trend is computed', text: 'We weight each major holder\'s quarter-over-quarter change in shares held by their ownership percentage. Positive result = institutions broadly increasing; negative = broadly reducing.' },
    ],
  },
  valuation_context: {
    title: 'Valuation vs 5Y average',
    sections: [
      { label: 'What it shows', text: 'Current P/E and P/B ratios compared to the stock\'s own 5-year average. Not vs sector or market — vs itself.' },
      { label: 'Why it matters', text: 'A P/E of 30 might be cheap if the stock historically traded at 50, or expensive if it traded at 18. The same number means different things for different companies. This section gives you that historical context.' },
      { label: 'Reading the comparison', text: 'Negative % vs avg = current valuation BELOW historical average = potentially cheap relative to history. Positive % = potentially expensive. Within ±10% = trading near its own normal range.' },
      { label: 'Important caveat', text: 'Cheap vs history isn\'t always good. If growth has slowed, the company deserves a lower P/E. Cross-check with the growth filters.' },
      { label: 'Data source', text: 'Computed from quarterly trailing EPS × monthly prices over 5 years. Same basis as the trailing P/E shown in info — so the comparison is apples-to-apples.' },
    ],
  },
  price_action: {
    title: 'Price action',
    sections: [
      { label: '1W / 1M / 3M / 6M / 1Y', text: 'Total return over the past week, month, 3 months, 6 months, and 1 year respectively.' },
      { label: 'Why it matters', text: 'Helps you avoid catching a falling knife (heavy recent decline = wait for stabilization) or chasing a runner (already up 50%+ may have limited near-term upside).' },
      { label: '52W range', text: 'Where the current price sits between the 52-week low and high. A stock 5% off the high is in strength; 40% off may indicate distress — or a bargain, depending on fundamentals.' },
      { label: 'Important', text: 'Past performance doesn\'t predict the future. These numbers describe what happened, not what will happen.' },
    ],
  },
  earnings_surprises: {
    title: 'Earnings surprises',
    sections: [
      { label: 'What it shows', text: 'For each of the last 4 quarters: whether actual EPS came in above ("beat"), at ("meet"), or below ("miss") the consensus analyst estimate.' },
      { label: 'Why it matters', text: 'Companies that consistently beat estimates tend to be under-promising and over-delivering — usually a sign of good management. Consistent misses suggest the opposite.' },
      { label: 'Thresholds', text: 'Beat: actual > estimate by more than 1%. Meet: within ±1%. Miss: actual < estimate by more than 1%.' },
      { label: 'Important caveat', text: 'Analyst estimates are often anchored — companies sometimes manage expectations downward to ensure beats. Look for streaks of 3+ in either direction rather than reacting to one quarter.' },
      { label: 'Why not India', text: 'Reliable analyst estimate data for Indian stocks isn\'t available in the free APIs we use. This section only shows for US stocks.' },
    ],
  },
};

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

// ── Utility helpers ────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

function trendArrow(delta, threshold = 0.3) {
  if (delta == null) return { cls: 'flat', symbol: '—' };
  if (delta > threshold)  return { cls: 'up',   symbol: '↑' };
  if (delta < -threshold) return { cls: 'down', symbol: '↓' };
  return { cls: 'flat', symbol: '→' };
}

function fmtDelta(val) {
  if (val == null) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}pp`;
}

function fmtPct(val) {
  if (val == null) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
}

// ── Verdict section ────────────────────────────────────────────────────────────

function renderVerdictSection(stock, market) {
  const { matched, incomplete } = detectPatterns(stock, market);

  let html = `<section class="section">
    <div class="section-title"><span>Verdict</span><span class="info-btn" data-ctx-tip="verdict">i</span></div>
    <div class="section-subtitle">Patterns this stock matches based on the data</div>`;

  if (matched.length === 0 && incomplete.length === 0) {
    html += `<div class="verdict-neutral">No patterns matched. Stock is in a neutral state.</div>`;
  } else {
    matched.forEach(p => {
      html += `<div class="verdict-card tier-${p.tier}">
        <div class="verdict-card-header">
          <span class="verdict-card-label">${escapeHtml(p.label)}</span>
          <span class="verdict-card-tier">${p.tier}</span>
        </div>
        <div class="verdict-card-body">${escapeHtml(p.verdict)}</div>
      </div>`;
    });

    if (incomplete.length > 0) {
      const collapsed = matched.length > 0;
      html += `<div class="verdict-incomplete-toggle ${collapsed ? 'collapsed' : ''}">
        <span class="chevron">▾</span>
        <span>${incomplete.length} pattern${incomplete.length === 1 ? '' : 's'} couldn't evaluate</span>
      </div>
      <div class="verdict-incomplete-list">
        ${incomplete.map(p => `<div class="verdict-incomplete-item">
          <div class="incomplete-label">${escapeHtml(p.label)}</div>
          <div class="incomplete-reason">${escapeHtml(p.reason)}</div>
        </div>`).join('')}
      </div>`;
    }
  }

  html += `</section>`;
  return html;
}

// ── Context block renderers ────────────────────────────────────────────────────

function renderOwnershipBlock(stock, market) {
  const own = stock.ownership;
  const ownershipTipKey = market === 'india' ? 'ownership_india' : 'ownership_us';
  const ownershipSubtitle = market === 'india'
    ? 'Who owns the stock and how their stake changed last quarter'
    : 'Institutional + insider holdings and trend over time';
  if (!own?.current) return `<div class="context-block"><div class="context-block-title">Ownership Trend <span class="info-btn" data-ctx-tip="${ownershipTipKey}">i</span></div><div class="section-subtitle">${ownershipSubtitle}</div><div class="context-empty">Ownership data not available</div></div>`;

  const cur = own.current;
  const tq  = own.trend_qoq || {};
  const asOf = own.as_of ? ` (${own.as_of})` : '';

  let rows = '';
  const fields = market === 'india'
    ? [['Promoter', 'promoter'], ['FII', 'fii'], ['DII', 'dii'], ['Public', 'public']]
    : [['Institutional', 'institutional'], ['Insider', 'insider']];

  fields.forEach(([label, key]) => {
    const val   = cur[key];
    const delta = tq[key];
    const arr   = trendArrow(delta);
    if (val == null && delta == null) return;
    // "flat" reads more naturally than "0.0pp"
    const deltaStr = delta != null && Math.abs(delta) < 0.3 ? 'flat' : fmtDelta(delta);
    rows += `<div class="context-row">
      <span class="context-row-label">${label}</span>
      <span class="context-row-current"><span class="dim-prefix">Now</span>${val != null ? val.toFixed(1) + '%' : '—'}</span>
      <span class="context-row-change"><span class="context-row-arrow ${arr.cls}">${arr.symbol}</span><span class="dim-prefix">QoQ</span>${deltaStr}</span>
    </div>`;
  });

  // Pledged (India)
  if (market === 'india' && stock.metrics?.maxPledged != null) {
    rows += `<div class="context-row" style="margin-top:6px;">
      <span class="context-row-label" style="font-size:11px;color:var(--text-faint);">Pledged</span>
      <span class="context-row-value" style="font-size:11px;">${stock.metrics.maxPledged.toFixed(1)}%</span>
      <span></span><span></span>
    </div>`;
  }

  return `<div class="context-block">
    <div class="context-block-title">Ownership Trend${asOf} <span class="info-btn" data-ctx-tip="${ownershipTipKey}">i</span></div>
    <div class="section-subtitle">${ownershipSubtitle}</div>
    ${rows || '<div class="context-empty">Trend data not yet available</div>'}
  </div>`;
}

function renderValuationBlock(stock) {
  const vc = stock.valuation_context;
  if (!vc) return `<div class="context-block"><div class="context-block-title">Valuation vs 5Y Average <span class="info-btn" data-ctx-tip="valuation_context">i</span></div><div class="section-subtitle">Is the stock cheap or expensive vs its own history?</div><div class="context-empty">Historical valuation not computable</div></div>`;

  let rows = '';

  const addRow = (label, current, avg, vsPct) => {
    if (current == null) return;
    const avgStr = avg != null ? ` · <span class="dim-prefix">5Y avg</span>${avg.toFixed(1)}` : '';
    let vsHtml = '';
    if (vsPct != null) {
      if (Math.abs(vsPct) <= 10) {
        vsHtml = `<span style="font-size:11px;color:var(--text-dim)">near 5Y avg</span>`;
      } else {
        const cls = vsPct < 0 ? 'color:var(--pass)' : 'color:var(--fail)';
        const sign = vsPct > 0 ? '+' : '';
        vsHtml = `<span style="font-size:11px;${cls}">${sign}${vsPct.toFixed(0)}% vs avg</span>`;
      }
    }
    rows += `<div class="context-row">
      <span class="context-row-label">${label}</span>
      <span class="context-row-current"><span class="dim-prefix">Now</span>${current.toFixed(1)}${avgStr}</span>
      <span></span>
      <span class="context-row-delta">${vsHtml}</span>
    </div>`;
  };

  addRow('P/E', vc.pe_current, vc.pe_5y_avg, vc.pe_vs_avg_pct);
  addRow('P/B', vc.pb_current, vc.pb_5y_avg, vc.pb_vs_avg_pct);

  if (!rows) return `<div class="context-block"><div class="context-block-title">Valuation vs 5Y Average <span class="info-btn" data-ctx-tip="valuation_context">i</span></div><div class="section-subtitle">Is the stock cheap or expensive vs its own history?</div><div class="context-empty">Historical valuation not computable</div></div>`;

  return `<div class="context-block">
    <div class="context-block-title">Valuation vs 5Y Average <span class="info-btn" data-ctx-tip="valuation_context">i</span></div>
    <div class="section-subtitle">Is the stock cheap or expensive vs its own history?</div>
    ${rows}
  </div>`;
}

function renderPriceActionBlock(stock, market) {
  const pa = stock.price_action;
  if (!pa) return `<div class="context-block"><div class="context-block-title">Price Action <span class="info-btn" data-ctx-tip="price_action">i</span></div><div class="section-subtitle">Recent price performance across different time windows</div><div class="context-empty">Price history not available</div></div>`;

  const retRow = (label, val) => {
    if (val == null) return '';
    const cls = val > 0 ? 'pos' : val < 0 ? 'neg' : 'na';
    return `<div class="context-ret-row">
      <span class="context-ret-label">${label}</span>
      <span class="context-ret-val ${cls}">${val > 0 ? '+' : ''}${val.toFixed(1)}%</span>
    </div>`;
  };

  const rets = [
    retRow('1W',  pa.ret_1w),
    retRow('1M',  pa.ret_1m),
    retRow('3M',  pa.ret_3m),
    retRow('6M',  pa.ret_6m),
    retRow('1Y',  pa.ret_1y),
  ].filter(Boolean).join('');

  const currency = market === 'us' ? '$' : '₹';
  let rangeHtml = '';
  if (pa.fifty_two_week_low != null && pa.fifty_two_week_high != null) {
    const lo = pa.fifty_two_week_low, hi = pa.fifty_two_week_high;
    const cur = stock.livePrice;
    const pct = hi !== lo && cur != null ? Math.round(((cur - lo) / (hi - lo)) * 100) : null;
    const loStr = lo.toLocaleString(market === 'us' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hiStr = hi.toLocaleString(market === 'us' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    rangeHtml = `<div style="margin-top:10px;font-size:11px;font-family:var(--font-mono);color:var(--text-dim);">
      52W ${currency}${loStr} — ${currency}${hiStr}
      ${pa.pct_from_52w_high != null ? `<br><span style="color:var(--fail)">${pa.pct_from_52w_high.toFixed(0)}% from high</span>` : ''}
      ${pa.pct_from_52w_low  != null ? `  <span style="color:var(--pass)">· +${pa.pct_from_52w_low.toFixed(0)}% from low</span>` : ''}
    </div>`;
  }

  return `<div class="context-block">
    <div class="context-block-title">Price Action <span class="info-btn" data-ctx-tip="price_action">i</span></div>
    <div class="section-subtitle">Recent price performance across different time windows</div>
    ${rets || '<div class="context-empty">Return data not available</div>'}
    ${rangeHtml}
  </div>`;
}

function renderEarningsBlock(stock) {
  const es = stock.earnings_surprises;
  if (!es || !es.length) return '';

  const beats = es.filter(e => e.verdict === 'beat').length;
  const rows = es.map(e => {
    let verdictText, verdictColor;
    if (e.verdict === 'beat') {
      verdictText  = `beat by ${e.surprise_pct > 0 ? '+' : ''}${e.surprise_pct?.toFixed(1)}%`;
      verdictColor = 'var(--pass)';
    } else if (e.verdict === 'miss') {
      verdictText  = `missed by ${e.surprise_pct?.toFixed(1)}%`;
      verdictColor = 'var(--fail)';
    } else {
      verdictText  = 'met';
      verdictColor = 'var(--text-dim)';
    }
    return `<div class="earnings-row">
      <span class="earnings-quarter">${e.quarter}</span>
      <span class="earnings-surprise" style="color:${verdictColor}">${verdictText}</span>
    </div>`;
  }).join('');

  return `<div class="context-block">
    <div class="context-block-title">Earnings — last ${es.length} quarters <span class="info-btn" data-ctx-tip="earnings_surprises">i</span></div>
    <div class="section-subtitle">Whether the company beats or misses analyst estimates</div>
    ${rows}
    <div style="margin-top:8px;font-size:11px;font-family:var(--font-mono);color:var(--text-dim);">
      ${beats} of ${es.length} beat · ${es.length - beats} miss/meet
    </div>
  </div>`;
}

// ── Fund analysis (MF market — V2 sections hidden) ────────────────────────────

function renderFundAnalysis(container, fund, ticker, mode, state, filters, saveState, render, wireFilterEvents) {
  if (!fund) { container.innerHTML = `<div class="empty">Fund not found</div>`; return; }

  const cfg = filters[mode];
  const { score, total, unknown, passRate, results } = scoreStock(fund, mode, state, filters);
  const starred = isWatched(mode, ticker, state);

  // Header — NAV price, no day-change label
  const nav = fund.livePrice;
  const navStr = nav != null
    ? `₹${nav.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
  const prevClose = fund.prevClose;
  let changeHtml = '';
  if (nav != null && prevClose != null && prevClose > 0) {
    const pct = ((nav - prevClose) / prevClose) * 100;
    const cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '→';
    changeHtml = `<div class="analyzer-change ${cls}">
      <span>${arrow} ${Math.abs(pct).toFixed(2)}%</span>
      <span style="color:var(--text-faint)">·</span>
      <span style="color:var(--text-faint)">NAV</span>
    </div>`;
  }

  let html = `<div class="analyzer-header">
    <div class="analyzer-header-top">
      <div class="analyzer-ticker-info">
        <div class="analyzer-ticker" style="font-size:18px;line-height:1.2;">${escapeHtml(fund.name || fund.ticker)}</div>
        <div class="analyzer-name" style="font-size:11px;margin-top:2px;">${escapeHtml(fund.ticker)}</div>
      </div>
      <button class="analyzer-star-btn ${starred ? 'starred' : ''}" data-star-analyzer="${ticker}">
        ${starred ? '★ Watched' : '☆ Watch'}
      </button>
    </div>
    <div class="analyzer-price">${navStr}</div>
    ${changeHtml}
  </div>`;

  // Summary stats
  const tier = passRate === null ? 'fail' : passRate >= 0.85 ? 'pass' : passRate >= 0.65 ? 'warn' : 'fail';
  const passRateLabel = passRate !== null ? `${Math.round(passRate * 100)}% of evaluable` : 'insufficient data';
  html += `<section class="section">
    <div class="summary">
      <div class="stat">
        <div class="stat-label">Score</div>
        <div class="stat-value ${tier === 'pass' ? 'pass' : tier === 'fail' ? 'fail' : ''}" style="${tier === 'warn' ? 'color:var(--warn);' : ''}">${score}<span style="font-size:16px;color:var(--text-faint);">/${total}</span></div>
        <div class="stat-sub">${passRateLabel}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Passes</div>
        <div class="stat-value pass">${results.filter(r => r.verdict === 'pass').length}</div>
        <div class="stat-sub">${results.filter(r => r.verdict === 'warn').length} marginal</div>
      </div>
      <div class="stat">
        <div class="stat-label">Fails</div>
        <div class="stat-value fail">${results.filter(r => r.verdict === 'fail').length}</div>
        <div class="stat-sub">${unknown} unknown</div>
      </div>
    </div>
  </section>`;

  // Filter analysis — always shown for funds (no Simple/Detailed toggle)
  html += `<section class="section">
    <div class="section-title"><span>Filter-by-filter analysis</span><span class="count">${fund.ticker}</span></div>`;
  cfg.groups.forEach(group => {
    const groupResults = results.filter(r => r.groupName === group.name);
    if (groupResults.length === 0) return;
    const passed = groupResults.filter(r => r.verdict === 'pass').length;
    html += `<div class="filter-group">
      <div class="filter-group-header">
        <span class="filter-group-name">${group.name}</span>
        <span class="filter-group-meta">
          <span class="group-score"><span class="num" style="color:${passed === groupResults.length ? 'var(--pass)' : passed === 0 ? 'var(--fail)' : 'var(--warn)'};">${passed}</span>/${groupResults.length}</span>
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

  container.innerHTML = html;
  wireFilterEvents(container);

  const starBtn = container.querySelector('[data-star-analyzer]');
  if (starBtn) starBtn.addEventListener('click', () => toggleWatchlist(mode, ticker, state, saveState, render));

  container.querySelectorAll('.filter-group-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
  });
}

// ── Single stock analysis ──────────────────────────────────────────────────────

function renderSingleAnalysis(container, state, data, filters, saveState, render, wireFilterEvents) {
  const mode   = state.analyzerMarket;
  const ticker = state.analyzerPicks[0];
  const stock  = data[mode]?.find(s => s.ticker === ticker);
  if (!stock) { container.innerHTML = `<div class="empty">Stock not found</div>`; return; }

  // Funds get a clean V1-style view without V2 sections
  if (mode === 'mf') {
    renderFundAnalysis(container, stock, ticker, mode, state, filters, saveState, render, wireFilterEvents);
    return;
  }

  const cfg  = filters[mode];
  const { score, total, unknown, active, passRate, results } = scoreStock(stock, mode, state, filters);
  const starred = isWatched(mode, ticker, state);

  // ── 1. Header ──────────────────────────────────────────────
  const currency = mode === 'us' ? '$' : '₹';
  const price    = stock.livePrice;
  const prevClose = stock.prevClose;
  let changeHtml = '';
  if (price != null && prevClose != null && prevClose > 0) {
    const changePct = ((price - prevClose) / prevClose) * 100;
    const cls   = changePct > 0.05 ? 'up' : changePct < -0.05 ? 'down' : 'flat';
    const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '→';
    changeHtml = `<div class="analyzer-change ${cls}">
      <span>${arrow} ${Math.abs(changePct).toFixed(2)}%</span>
      <span style="color:var(--text-faint)">·</span>
      <span style="color:var(--text-faint)">EOD</span>
    </div>`;
  }

  const priceStr = price != null
    ? (mode === 'us'
        ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    : '—';

  let html = `<div class="analyzer-header">
    <div class="analyzer-header-top">
      <div class="analyzer-ticker-info">
        <div class="analyzer-ticker">${stock.ticker}</div>
        <div class="analyzer-name">${stock.name || '—'}</div>
      </div>
      <button class="analyzer-star-btn ${starred ? 'starred' : ''}" data-star-analyzer="${ticker}">
        ${starred ? '★ Watched' : '☆ Watch'}
      </button>
    </div>
    <div class="analyzer-price">${priceStr}</div>
    ${changeHtml}
  </div>`;

  // ── 2. Summary stats ────────────────────────────────────────
  const tier = passRate === null ? 'fail' : passRate >= 0.85 ? 'pass' : passRate >= 0.65 ? 'warn' : 'fail';
  const passRateLabel = passRate !== null ? `${Math.round(passRate * 100)}% of evaluable` : 'insufficient data';
  html += `<section class="section">
    <div class="summary">
      <div class="stat">
        <div class="stat-label">Score</div>
        <div class="stat-value ${tier === 'pass' ? 'pass' : tier === 'fail' ? 'fail' : ''}" style="${tier === 'warn' ? 'color:var(--warn);' : ''}">${score}<span style="font-size:16px;color:var(--text-faint);">/${total}</span></div>
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
  </section>`;

  // ── 3. Verdict box ──────────────────────────────────────────
  // Enrich stock with V1 scores so filter_pass_rate trigger works in the pattern engine
  const enrichedStock = { ...stock, score, total, passRate, unknown, active };
  html += renderVerdictSection(enrichedStock, mode);

  // ── 4. Simple/Detailed toggle ───────────────────────────────
  const detailMode = localStorage.getItem('analyzerDetailMode') || 'simple';
  html += `<section class="section">
    <div class="detail-toggle">
      <button class="analyzer-mode-btn ${detailMode === 'simple' ? 'active' : ''}" data-detail="simple">Simple</button>
      <button class="analyzer-mode-btn ${detailMode === 'detailed' ? 'active' : ''}" data-detail="detailed">Detailed</button>
    </div>
  </section>`;

  // ── 5. Filter analysis (Detailed mode only) ─────────────────
  if (detailMode === 'detailed') {
    html += `<section class="section">
      <div class="section-title"><span>Filter-by-filter analysis</span><span class="count">${stock.ticker}</span></div>`;
    cfg.groups.forEach((group, gIdx) => {
      const groupResults = results.filter(r => r.groupName === group.name);
      if (groupResults.length === 0) return;
      const passed = groupResults.filter(r => r.verdict === 'pass').length;
      html += `<div class="filter-group">
        <div class="filter-group-header">
          <span class="filter-group-name">${group.name}</span>
          <span class="filter-group-meta">
            <span class="group-score"><span class="num" style="color:${passed === groupResults.length ? 'var(--pass)' : passed === 0 ? 'var(--fail)' : 'var(--warn)'};">${passed}</span>/${groupResults.length}</span>
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
  }

  // ── 6. Context blocks ────────────────────────────────────────
  html += `<section class="section">
    <div class="section-title"><span>Context</span></div>
    ${renderOwnershipBlock(stock, mode)}
    ${renderValuationBlock(stock)}
    ${renderPriceActionBlock(stock, mode)}
    ${mode === 'us' ? renderEarningsBlock(stock) : ''}
  </section>`;

  // ── 7. News (US only, existing) ─────────────────────────────
  if (mode === 'us') {
    html += `<section class="section" id="news-section-${ticker}">
      <div class="news-loading">
        <div class="news-loading-dot"></div><div class="news-loading-dot"></div><div class="news-loading-dot"></div>
      </div>
    </section>`;
  }

  container.innerHTML = html;
  wireFilterEvents(container);

  const starBtn = container.querySelector('[data-star-analyzer]');
  if (starBtn) starBtn.addEventListener('click', () => toggleWatchlist(mode, ticker, state, saveState, render));

  container.querySelectorAll('.filter-group-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
  });

  container.querySelectorAll('[data-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('analyzerDetailMode', btn.dataset.detail);
      render();
    });
  });

  const incToggle = container.querySelector('.verdict-incomplete-toggle');
  if (incToggle) {
    incToggle.addEventListener('click', () => incToggle.classList.toggle('collapsed'));
  }

  // Wire context tooltip (i) buttons
  container.querySelectorAll('[data-ctx-tip]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = e.currentTarget.dataset.ctxTip;
      const tip = CONTEXT_TOOLTIPS[key];
      if (tip) openFlexibleSheet(tip.title, tip.sections);
    });
  });

  if (mode === 'us') {
    const newsEl = document.getElementById(`news-section-${ticker}`);
    if (newsEl) renderNewsInto(ticker, newsEl);
  }
}

// ── Compare analysis ───────────────────────────────────────────────────────────

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

  // V2 sections not applicable for funds
  if (mode === 'mf') {
    container.innerHTML = html;
    wireFilterEvents(container);
    container.querySelectorAll('.filter-group-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
    });
    return;
  }

  // Verdict per stock
  html += `<section class="section">
    <div class="section-title"><span>Verdicts</span></div>`;
  stocks.forEach(stock => {
    const { matched, incomplete } = detectPatterns(stock, mode);
    html += `<div style="margin-bottom:16px;">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px;">${stock.ticker}</div>`;
    if (matched.length === 0 && incomplete.length === 0) {
      html += `<div class="verdict-neutral">Neutral — no patterns matched</div>`;
    } else {
      matched.forEach(p => {
        html += `<div class="verdict-card tier-${p.tier}" style="margin-bottom:6px;">
          <div class="verdict-card-header"><span class="verdict-card-label">${escapeHtml(p.label)}</span><span class="verdict-card-tier">${p.tier}</span></div>
          <div class="verdict-card-body">${escapeHtml(p.verdict)}</div>
        </div>`;
      });
      if (incomplete.length) {
        html += `<div style="font-size:11px;color:var(--text-faint);font-style:italic;margin-top:4px;">${incomplete.length} couldn't evaluate</div>`;
      }
    }
    html += `</div>`;
  });
  html += `</section>`;

  // Context comparison (1Y return + PE vs avg)
  html += `<section class="section">
    <div class="section-title"><span>Context comparison</span></div>
    <div class="context-block">
      <div class="context-block-title">1Y Return · P/E · PE vs 5Y avg</div>`;
  stocks.forEach(stock => {
    const pa = stock.price_action;
    const vc = stock.valuation_context;
    const ret1y = pa?.ret_1y;
    const pe    = vc?.pe_current;
    const vsAvg = vc?.pe_vs_avg_pct;
    const ret1yCls = ret1y == null ? '' : ret1y > 0 ? 'color:var(--pass)' : 'color:var(--fail)';
    const vsCls    = vsAvg == null ? '' : vsAvg < -10 ? 'color:var(--pass)' : vsAvg > 10 ? 'color:var(--fail)' : '';
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:0.5px solid var(--bg-elev-3);font-size:12px;">
      <span style="font-family:var(--font-mono);color:var(--text-dim)">${stock.ticker}</span>
      <span style="font-family:var(--font-mono);${ret1yCls}">${ret1y != null ? (ret1y > 0 ? '+' : '') + ret1y.toFixed(1) + '%' : '—'}</span>
      <span style="font-family:var(--font-mono)">${pe != null ? pe.toFixed(1) : '—'}</span>
      <span style="font-family:var(--font-mono);${vsCls}">${vsAvg != null ? (vsAvg > 0 ? '+' : '') + vsAvg.toFixed(0) + '%' : '—'}</span>
    </div>`;
  });
  html += `</div></div></section>`;

  container.innerHTML = html;
  wireFilterEvents(container);
}
