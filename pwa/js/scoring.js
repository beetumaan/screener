export function evaluateFilter(filter, value) {
  if (value === undefined || value === null) return 'unknown';
  if (filter.op === 'flag') return value === true ? 'pass' : 'fail';
  const t = filter.value;
  const warn = 0.1;
  if (filter.op === 'gte') {
    if (value >= t) return 'pass';
    if (t > 0 && value >= t * (1 - warn)) return 'warn';
    if (t < 0 && value >= t * (1 + warn)) return 'warn';
    return 'fail';
  }
  if (filter.op === 'lte') {
    if (t === 0) return 'pass';
    if (value <= t) return 'pass';
    if (value <= t * (1 + warn)) return 'warn';
    return 'fail';
  }
  return 'unknown';
}

export function scoreStock(stock, mode, state, filters) {
  const cfg = filters[mode];
  let score = 0;
  let total = 0;    // filters with non-unknown verdicts
  let unknown = 0;  // filters where data was missing
  let active = 0;   // filters not toggled off (= total + unknown)
  const results = [];

  cfg.groups.forEach(group => {
    group.filters.forEach(filter => {
      if (state.filterStates[filter.id] === 'off') return;
      active++;
      const value = stock.metrics[filter.id];
      const verdict = evaluateFilter(filter, value);

      if (verdict === 'unknown') {
        unknown++;
      } else {
        total++;
        if (verdict === 'pass') score++;
      }

      results.push({ groupName: group.name, filter, value, verdict });
    });
  });

  // Pass rate on evaluable filters only.
  // null when too much data is missing to be meaningful.
  const minEvaluable = Math.max(5, Math.floor(active * 0.5));
  const passRate = total >= minEvaluable ? score / total : null;

  return { score, total, unknown, active, passRate, results };
}

export function formatValue(value, filter) {
  if (value === undefined || value === null) return '—';
  if (filter.op === 'flag') return value ? 'Yes' : 'No';
  if (filter.sub === '%') return value + '%';
  if (filter.sub === '$B') return '$' + value + 'B';
  if (filter.sub === '₹') return '₹' + value.toLocaleString('en-IN');
  if (filter.sub === '₹ Cr' || filter.sub === '₹ Cr (size drag)') return '₹' + value.toLocaleString('en-IN') + ' Cr';
  if (filter.sub === 'x') return value + 'x';
  if (filter.sub === 'ratio') return value.toFixed(2);
  if (filter.sub === '3Y') return value.toFixed(2);
  if (filter.sub === 'years') return value + 'y';
  if (filter.sub === '% of rev' || filter.sub === '% float') return value + '%';
  if (filter.sub === 'score') return (value > 0 ? '+' : '') + value;
  return value;
}

export function describeThreshold(filter) {
  if (filter.op === 'flag') return filter.value === 1 ? 'must be enabled' : 'must be disabled';
  if (filter.op === 'gte') return `target: ≥ ${filter.value}${filter.sub === '%' ? '%' : ''}`;
  if (filter.op === 'lte') return filter.value === 0 ? 'filter off' : `target: ≤ ${filter.value}${filter.sub === '%' ? '%' : ''}`;
  return '';
}

export function verdictIcon(v) {
  if (v === 'pass') return '✓';
  if (v === 'fail') return '✗';
  if (v === 'warn') return '~';
  return '?';
}

export function findFilter(id, filters) {
  for (const mode in filters) {
    for (const group of filters[mode].groups) {
      for (const f of group.filters) {
        if (f.id === id) return f;
      }
    }
  }
  return null;
}
