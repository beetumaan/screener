// Replace with your free Finnhub key: https://finnhub.io/register
// Read-only key — safe to ship in browser JS.
export const FINNHUB_KEY = 'd880n0pr01qmhakhmi4gd880n0pr01qmhakhmi50';

// Session cache: ticker → Promise<newsItems>
// Caching the Promise means concurrent calls for the same ticker share one request.
const _cache = new Map();

export async function fetchNews(ticker) {
  if (_cache.has(ticker)) return _cache.get(ticker);
  const promise = _doFetch(ticker);
  _cache.set(ticker, promise);
  return promise;
}

async function _doFetch(ticker) {
  const to   = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return [];
    const items = await res.json();
    return items.slice(0, 5).map(item => ({
      headline: item.headline,
      source:   item.source,
      date:     relativeDate(item.datetime),
      url:      item.url,
      sentiment: classifySentiment(item.headline, item.summary),
    }));
  } catch (e) {
    console.error('Finnhub news fetch failed:', e);
    return [];
  }
}

export function classifySentiment(headline, summary) {
  const text = (headline + ' ' + (summary || '')).toLowerCase();
  const positive = ['beats', 'surges', 'rises', 'gains', 'record', 'upgrade', 'strong', 'profit'];
  const negative = ['misses', 'falls', 'declines', 'drops', 'cuts', 'lawsuit', 'probe', 'warning', 'loss', 'fine'];
  const pos = positive.filter(w => text.includes(w)).length;
  const neg = negative.filter(w => text.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export function relativeDate(unix) {
  const days = Math.floor((Date.now() / 1000 - unix) / 86400);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Renders news into `el` (an existing DOM element).
// Called after the analyzer container is already in the DOM.
export async function renderNewsInto(ticker, el) {
  if (FINNHUB_KEY === 'YOUR_FINNHUB_API_KEY') {
    el.innerHTML = `<div class="news-empty">
      Add your Finnhub API key to <code>pwa/js/news.js</code> to enable live news.
      Get a free key at <a href="https://finnhub.io/register" target="_blank" style="color:var(--accent)">finnhub.io</a>.
    </div>`;
    return;
  }

  const news = await fetchNews(ticker);

  if (!news.length) {
    el.innerHTML = `<div class="news-empty">No recent news found for ${ticker}</div>`;
    return;
  }

  const posCount = news.filter(n => n.sentiment === 'positive').length;
  const negCount = news.filter(n => n.sentiment === 'negative').length;
  const netSentiment = posCount > negCount ? 'Bullish lean' : negCount > posCount ? 'Bearish lean' : 'Mixed';
  const sentimentClass = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';

  el.innerHTML = `
    <div class="section-title">
      <span>Recent news · sentiment</span>
      <span class="news-sentiment-tag ${sentimentClass}">${netSentiment} · ${posCount}↑ ${negCount}↓</span>
    </div>
    <div class="news-list">
      ${news.map(n => `<a class="news-card ${n.sentiment}" href="${n.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
        <div class="news-headline">${n.headline}</div>
        <div class="news-meta">
          <span class="news-source">${n.source}</span>
          <span>·</span>
          <span>${n.date}</span>
        </div>
      </a>`).join('')}
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--bg-elev-1);border:0.5px solid var(--border);border-radius:8px;font-size:11px;color:var(--text-faint);font-family:var(--font-mono);text-align:center;letter-spacing:0.3px;">
      powered by finnhub · refreshed on-demand
    </div>`;
}
