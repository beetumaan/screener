# Screener · Personal

A mobile-first PWA stock and mutual fund screener for India and US markets.

## Architecture

- **Daily GitHub Action cron** fetches data and commits JSON files
- **Static PWA** on GitHub Pages reads those JSONs (no backend)
- **Finnhub** direct from browser for US stock news/sentiment

## Local dev

```bash
# Serve the PWA locally (any static server)
cd pwa
npx serve .
# or: python3 -m http.server 8080
```

## First-time setup

1. Fork/clone this repo
2. Get a free Finnhub API key: https://finnhub.io/register
3. Add `FINNHUB_API_KEY` to repo secrets: Settings → Secrets → Actions → New repository secret
4. Enable GitHub Pages: Settings → Pages → Source: **GitHub Actions**
5. Trigger the first data fetch: Actions tab → "Daily data fetch" → **Run workflow**

## Manual data refresh

Actions tab → "Daily data fetch" → **Run workflow** (or push to `main`)

## Install as PWA on phone

Open the live URL in Safari (iOS) or Chrome (Android) → Share / menu → **Add to Home Screen**

## Rebuild MF universe

The MF universe (`scripts/universes/mf_top300.json`) is ranked by AUM and stable enough to refresh every 3–6 months. To rebuild:

```bash
cd scripts
python3 build_mf_universe.py
# Takes ~10 min — fetches AUM for every direct growth plan from mfdata.in
# Commits the new mf_top300.json manually
```

The daily cron does **not** rebuild the universe — it only fetches fresh metrics for the funds already in the file.

## Data sources

| Market | Price & fundamentals | Extra |
|--------|---------------------|-------|
| India  | yfinance (.NS) + screener.in | — |
| US     | yfinance | Finnhub MSPR insider sentiment |
| MF     | MFAPI | Computed Sharpe / beta / CAGR |
