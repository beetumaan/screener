export function openInfoSheet(filterId, filters) {
  let filter = null;
  outer: for (const mode in filters) {
    for (const group of filters[mode].groups) {
      for (const f of group.filters) {
        if (f.id === filterId) { filter = f; break outer; }
      }
    }
  }
  if (!filter || !filter.tip) return;
  // Restore static layout in case openFlexibleSheet was used before
  _restoreSheetLayout();
  document.getElementById('sheetEyebrow').textContent = filter.sub || 'Filter';
  document.getElementById('sheetTitle').textContent = filter.label;
  document.getElementById('sheetMeans').textContent = filter.tip.what;
  document.getElementById('sheetWhy').textContent = filter.tip.why;
  document.getElementById('sheetSignal').textContent = filter.tip.signal;
  document.getElementById('infoSheet').classList.add('show');
  document.body.classList.add('no-scroll');
}

/** Open the info sheet with flexible multi-section content (context tooltips). */
export function openFlexibleSheet(title, sections) {
  document.getElementById('sheetEyebrow').textContent = 'Context';
  document.getElementById('sheetTitle').textContent = title;

  // Render all sections into the first sheet-section, hide the other two
  document.getElementById('sheetMeans').innerHTML = sections.map(s =>
    `<div style="margin-bottom:14px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-faint);margin-bottom:5px;">${s.label}</div>
      <div style="font-size:13px;color:var(--text);line-height:1.6;">${s.text}</div>
    </div>`
  ).join('');

  // Hide the static label of first section + the other two sections
  const allSections = document.querySelectorAll('#infoSheet .sheet-section');
  allSections.forEach((el, i) => { el.style.display = i === 0 ? '' : 'none'; });
  const firstLabel = allSections[0]?.querySelector('.sheet-section-label');
  if (firstLabel) firstLabel.style.display = 'none';

  document.getElementById('infoSheet').classList.add('show');
  document.body.classList.add('no-scroll');
}

function _restoreSheetLayout() {
  document.querySelectorAll('#infoSheet .sheet-section').forEach(el => { el.style.display = ''; });
  const firstLabel = document.querySelector('#infoSheet .sheet-section .sheet-section-label');
  if (firstLabel) firstLabel.style.display = '';
}

export function closeSearchModal() {
  document.getElementById('searchModal').classList.remove('show');
  document.body.classList.remove('no-scroll');
}

export function openSearchModal(targetType, state, data, filters, saveState, render) {
  state.searchTarget = targetType;
  const modal = document.getElementById('searchModal');
  const title = document.getElementById('searchModalTitle');
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');

  if (targetType === 'market') {
    title.textContent = 'Select market';
    input.style.display = 'none';
    results.innerHTML = ['india', 'us', 'mf'].map(m => {
      const labels = { india: ['🇮🇳 India stocks', 'NSE / BSE equities'], us: ['🇺🇸 US stocks', 'NYSE / NASDAQ'], mf: ['📊 India mutual funds', 'AMFI registered'] };
      return `<div class="search-item" data-pick="${m}">
        <div><div class="search-item-ticker">${labels[m][0]}</div><div class="search-item-name">${labels[m][1]}</div></div>
      </div>`;
    }).join('');
    results.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        state.analyzerMarket = item.dataset.pick;
        state.analyzerPicks = [];
        saveState();
        closeSearchModal();
        render();
      });
    });
  } else {
    title.textContent = `Select from ${filters[state.analyzerMarket].name}`;
    input.style.display = 'block';
    input.value = '';
    renderSearchResults('', state, data, saveState, render);
    setTimeout(() => input.focus(), 100);
  }
  modal.classList.add('show');
  document.body.classList.add('no-scroll');
}

export function renderSearchResults(query, state, data, saveState, render) {
  const results = document.getElementById('searchResults');
  const items = data[state.analyzerMarket] || [];
  const q = query.toLowerCase();
  const filtered = items.filter(s => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  results.innerHTML = filtered.length === 0
    ? `<div style="padding: 20px; text-align: center; color: var(--text-dim); font-size: 13px;">No matches</div>`
    : filtered.map(s => `<div class="search-item" data-pick="${s.ticker}">
        <div><div class="search-item-ticker">${s.ticker}</div><div class="search-item-name">${s.name}</div></div>
      </div>`).join('');
  results.querySelectorAll('.search-item').forEach(item => {
    item.addEventListener('click', () => {
      const ticker = item.dataset.pick;
      if (state.analyzerMode === 'single') state.analyzerPicks = [ticker];
      else if (!state.analyzerPicks.includes(ticker) && state.analyzerPicks.length < 3) state.analyzerPicks.push(ticker);
      saveState();
      closeSearchModal();
      render();
    });
  });
}
