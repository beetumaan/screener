import { FILTERS } from './filters.js';
import { scoreStock, formatValue } from './scoring.js';
import { isWatched, toggleWatchlist, renderWatchlist } from './watchlist.js';
import { renderAnalyzer } from './analyzer.js';
import { openInfoSheet, openSearchModal, renderSearchResults, closeSearchModal } from './ui.js';

let LOADED_DATA = { india: [], us: [], mf: [] };
let META = null;

let state = {
  tab: 'india',
  analyzerMode: 'single',
  analyzerMarket: null,
  analyzerPicks: [],
  searchTarget: null,
  sort: 'score',
  filterStates: {},
  watchlist: [],
};

try {
  const saved = localStorage.getItem('screener-state-v1');
  if (saved) state = { ...state, ...JSON.parse(saved) };
} catch (e) {}

function saveState() {
  try { localStorage.setItem('screener-state-v1', JSON.stringify(state)); } catch (e) {}
}

function relativeTime(isoString) {
  if (!isoString) return 'never synced';
  const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `synced ${hrs}h ago`;
  return `synced ${Math.floor(hrs / 24)}d ago`;
}

function updateLastSyncDisplay(lastSync) {
  document.getElementById('lastSync').textContent = relativeTime(lastSync);
}

async function loadData() {
  const btn = document.getElementById('scanBtn');
  btn.textContent = 'Loading...';
  btn.disabled = true;
  try {
    const [india, us, mf, meta] = await Promise.all([
      fetch('./data/india.json').then(r => r.json()),
      fetch('./data/us.json').then(r => r.json()),
      fetch('./data/mf.json').then(r => r.json()),
      fetch('./data/meta.json').then(r => r.json()),
    ]);
    LOADED_DATA = { india, us, mf };
    META = meta;
    updateLastSyncDisplay(meta.lastSync);
  } catch (e) {
    // Data files empty or not yet generated — show empty state
    LOADED_DATA = { india: [], us: [], mf: [] };
    META = null;
    document.getElementById('lastSync').textContent = 'no data yet';
  } finally {
    btn.textContent = 'Refresh ↗';
    btn.disabled = false;
    render();
  }
}

function wireFilterEvents(container) {
  container.querySelectorAll('.filter-toggle').forEach(t => {
    t.addEventListener('click', e => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.toggleId;
      state.filterStates[id] = state.filterStates[id] === 'off' ? 'on' : 'off';
      saveState();
      render();
    });
  });
  container.querySelectorAll('.filter-group-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
  });
  container.querySelectorAll('.info-btn').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      openInfoSheet(e.currentTarget.dataset.tipId, FILTERS);
    });
  });
  container.querySelectorAll('.filter-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const id = e.currentTarget.dataset.filterId;
      const newVal = parseFloat(e.currentTarget.value);
      if (!isNaN(newVal)) {
        for (const mode in FILTERS) {
          FILTERS[mode].groups.forEach(g => g.filters.forEach(f => {
            if (f.id === id) f.value = newVal;
          }));
        }
        render();
      }
    });
  });
}

function renderScan() {
  const mode = state.tab;
  const cfg = FILTERS[mode];
  const data = LOADED_DATA[mode];
  document.getElementById('contextLabel').textContent = `${cfg.name} · scan`;
  document.getElementById('contextMeta').textContent =
    data.length ? `${data.length} loaded` : `${cfg.universe} in universe`;

  if (data.length === 0) {
    document.getElementById('statUniverse').textContent = '—';
    document.getElementById('statPassed').textContent = '—';
    document.getElementById('statWatch').textContent = '—';
    document.getElementById('filterContent').innerHTML = '';
    document.getElementById('filterCount').textContent = '—';
    document.getElementById('stockList').innerHTML =
      `<div class="empty"><div class="empty-icon">⌁</div>
       <div class="empty-text">No data loaded yet</div>
       <div class="empty-sub">Run the GitHub Action or <code>python scripts/fetch_data.py</code> to populate</div></div>`;
    document.getElementById('resultsCount').textContent = '—';
    return;
  }

  const scored = data.map(s => ({ ...s, ...scoreStock(s, mode, state, FILTERS) }));
  document.getElementById('statUniverse').textContent = data.length;
  document.getElementById('statPassed').textContent = scored.filter(s => s.passRate !== null && s.passRate >= 0.80).length;
  document.getElementById('statWatch').textContent   = scored.filter(s => s.passRate !== null && s.passRate >= 0.60 && s.passRate < 0.80).length;

  renderFilters(cfg);
  renderStocks(scored, mode);
}

function renderFilters(cfg) {
  const container = document.getElementById('filterContent');
  let activeCount = 0;
  container.innerHTML = cfg.groups.map((group, gIdx) => {
    let groupActive = 0;
    const filtersHtml = group.filters.map(f => {
      const isOn = state.filterStates[f.id] !== 'off';
      if (isOn) { activeCount++; groupActive++; }
      const isFlag = f.op === 'flag';
      return `<div class="filter-row">
        <div>
          <div class="filter-label">${f.label} <span class="info-btn" data-tip-id="${f.id}">i</span></div>
          ${f.sub ? `<div class="filter-label-sub">${f.sub}</div>` : ''}
        </div>
        ${isFlag ? '<span></span>' : `<input class="filter-input" type="number" value="${f.value}" data-filter-id="${f.id}" inputmode="decimal" />`}
        <div class="filter-toggle ${isOn ? 'on' : ''}" data-toggle-id="${f.id}"></div>
      </div>`;
    }).join('');
    return `<div class="filter-group ${gIdx > 0 ? 'collapsed' : ''}">
      <div class="filter-group-header">
        <span class="filter-group-name">${group.name}</span>
        <span class="filter-group-meta">
          <span class="group-score"><span class="num">${groupActive}</span>/${group.filters.length}</span>
          <span class="chevron">▾</span>
        </span>
      </div>
      <div class="filter-list">${filtersHtml}</div>
    </div>`;
  }).join('');
  document.getElementById('filterCount').textContent = `${activeCount} active`;
  wireFilterEvents(container);
}

function renderStocks(data, mode) {
  const sorted = [...data].sort((a, b) => {
    if (state.sort === 'score') {
      // null passRate sorts to bottom
      if (a.passRate === null && b.passRate === null) return 0;
      if (a.passRate === null) return 1;
      if (b.passRate === null) return -1;
      return b.passRate - a.passRate;
    }
    if (state.sort === 'alpha') return a.ticker.localeCompare(b.ticker);
    if (state.sort === 'dip') return (b.metrics?.minDip || 0) - (a.metrics?.minDip || 0);
    if (state.sort === 'pe') return (a.metrics?.maxPE || a.metrics?.maxPEUS || 999) - (b.metrics?.maxPE || b.metrics?.maxPEUS || 999);
    return 0;
  });
  document.getElementById('resultsCount').textContent = `${sorted.length} stocks`;
  document.getElementById('stockList').innerHTML = sorted.map(s => {
    const tier = s.passRate === null ? 'tier-3'
               : s.passRate >= 0.85 ? 'tier-1'
               : s.passRate >= 0.65 ? 'tier-2' : 'tier-3';
    const pulse = s.results.map(r => `<div class="pulse-dot ${r.verdict}"></div>`).join('');
    const starred = isWatched(mode, s.ticker, state);
    return `<div class="stock-card" data-ticker="${s.ticker}">
      <div class="stock-header">
        <div class="stock-id">
          <div class="stock-ticker-row">
            <span class="star-btn ${starred ? 'starred' : ''}" data-star="${s.ticker}">${starred ? '★' : '☆'}</span>
            <span class="stock-ticker">${s.ticker}</span>
          </div>
          <div class="stock-name">${s.name}</div>
        </div>
        <div class="stock-score">
          <div class="score-num ${tier}">${s.score}</div>
          <div class="score-meta">/ ${s.total}${s.unknown > 0 ? ` · ${s.unknown}?` : ''}</div>
        </div>
      </div>
      <div class="stock-pulse">${pulse}</div>
      <div class="stock-details">
        ${s.results.slice(0, 6).map(r => `<div class="detail-row">
          <span class="detail-name">${r.filter.label}</span>
          <span class="detail-value analyzer-value ${r.verdict}">${formatValue(r.value, r.filter)}</span>
        </div>`).join('')}
        <div class="analyze-link" data-analyze="${s.ticker}" data-amode="${mode}">→ FULL ANALYZE</div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.stock-card').forEach(card => {
    card.querySelector('.stock-header').addEventListener('click', e => {
      if (e.target.classList.contains('star-btn')) return;
      card.classList.toggle('expanded');
    });
  });
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleWatchlist(mode, e.currentTarget.dataset.star, state, saveState, render);
    });
  });
  document.querySelectorAll('.analyze-link').forEach(link => {
    link.addEventListener('click', e => {
      e.stopPropagation();
      const ticker = e.currentTarget.dataset.analyze;
      const m = e.currentTarget.dataset.amode;
      state.tab = 'analyze';
      state.analyzerMode = 'single';
      state.analyzerMarket = m;
      state.analyzerPicks = [ticker];
      saveState();
      render();
    });
  });
}

function render() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const fab = document.getElementById('scanBtn');
  if (state.tab === 'analyze') {
    document.getElementById('view-analyze').classList.add('active');
    fab.classList.remove('show');
    renderAnalyzer(state, LOADED_DATA, FILTERS, saveState, render, wireFilterEvents);
  } else {
    document.getElementById('view-scan').classList.add('active');
    fab.classList.add('show');
    renderScan();
  }
  renderWatchlist(state, LOADED_DATA, saveState, render);
}

// --- Static event wiring ---

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => { state.tab = btn.dataset.tab; saveState(); render(); });
});

document.querySelectorAll('.sort-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    state.sort = chip.dataset.sort;
    document.querySelectorAll('.sort-chip').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });
});

document.querySelectorAll('.analyzer-mode-btn').forEach(b => {
  b.addEventListener('click', () => {
    state.analyzerMode = b.dataset.amode;
    if (state.analyzerMode === 'single' && state.analyzerPicks.length > 1) {
      state.analyzerPicks = state.analyzerPicks.slice(0, 1);
    }
    saveState();
    render();
  });
});

document.getElementById('scanBtn').addEventListener('click', () => loadData());

document.getElementById('sheetCloseBtn').addEventListener('click', () => {
  document.getElementById('infoSheet').classList.remove('show');
  document.body.classList.remove('no-scroll');
});
document.getElementById('infoSheet').addEventListener('click', e => {
  if (e.target.id === 'infoSheet') {
    e.currentTarget.classList.remove('show');
    document.body.classList.remove('no-scroll');
  }
});

document.getElementById('searchInput').addEventListener('input', e => {
  renderSearchResults(e.target.value, state, LOADED_DATA, saveState, render);
});
document.getElementById('searchModal').addEventListener('click', e => {
  if (e.target.id === 'searchModal') closeSearchModal(); // closeSearchModal removes no-scroll
});
document.getElementById('marketSelect').addEventListener('click', () => {
  openSearchModal('market', state, LOADED_DATA, FILTERS, saveState, render);
});
document.getElementById('stockPicker').addEventListener('click', () => {
  if (state.analyzerMarket) openSearchModal('stock', state, LOADED_DATA, FILTERS, saveState, render);
});

loadData();
