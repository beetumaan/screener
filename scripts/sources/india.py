"""Phase 3a: India data — yfinance (.NS) + screener.in scrape."""
import os
import time
import json
import hashlib
import math
from pathlib import Path

import yfinance as yf
import httpx
from selectolax.parser import HTMLParser

CACHE_DIR = Path('.cache')
CACHE_DIR.mkdir(exist_ok=True)


def _cache_path(key: str) -> Path:
    return CACHE_DIR / (hashlib.md5(key.encode()).hexdigest() + '.json')


def _cached_get(url: str) -> str | None:
    p = _cache_path(url)
    if p.exists():
        return p.read_text()
    return None


def _cache_set(url: str, text: str):
    _cache_path(url).write_text(text)


def calculate_dip(current_price, week52_high) -> float | None:
    if not current_price or not week52_high or week52_high == 0:
        return None
    return ((week52_high - current_price) / week52_high) * 100


def _parse_number(text: str) -> float | None:
    """Parse a number from screener.in cell text, stripping commas/% signs."""
    try:
        cleaned = text.replace(',', '').replace('%', '').strip()
        if not cleaned or cleaned == '-':
            return None
        val = float(cleaned)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    except (ValueError, TypeError):
        return None


def _table_row_values(table_node) -> dict[str, list[str]]:
    """Return {row_label: [cell_texts...]} for all rows in a table."""
    rows = {}
    for row in table_node.css('tr'):
        cells = row.css('td, th')
        if not cells:
            continue
        label = cells[0].text(strip=True)
        # Strip trailing '+' marker used by screener.in
        label = label.rstrip('+').strip()
        vals = [c.text(strip=True) for c in cells[1:]]
        rows[label] = vals
    return rows


def _yoy_growth(values: list[str]) -> float | None:
    """Compute YoY % change from the last two values in a list of cell texts."""
    nums = [_parse_number(v) for v in values]
    nums = [v for v in nums if v is not None]
    if len(nums) < 2:
        return None
    prev, curr = nums[-2], nums[-1]
    if prev == 0:
        return None
    return ((curr - prev) / abs(prev)) * 100


def scrape_screener_in(slug: str) -> dict:
    # Try consolidated first, then standalone; also support passing a ticker symbol
    urls_to_try = [
        f"https://www.screener.in/company/{slug}/consolidated/",
        f"https://www.screener.in/company/{slug}/",
    ]

    html = None
    used_url = None
    for url in urls_to_try:
        cached = _cached_get(url)
        if cached:
            html = cached
            used_url = url
            break
        try:
            resp = httpx.get(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'},
                timeout=20,
            )
            if resp.status_code == 200:
                if 'captcha' in resp.text.lower():
                    print(f"  [screener.in] {slug} → CAPTCHA detected, skipping")
                    return {}
                html = resp.text
                used_url = url
                _cache_set(url, html)
                time.sleep(1)
                break
            else:
                print(f"  [screener.in] {slug} → HTTP {resp.status_code} for {url}")
        except Exception as e:
            print(f"  [screener.in] {slug} → error fetching {url}: {e}")

    if not html:
        return {}

    tree = HTMLParser(html)
    result = {}

    # --- ROE from #top-ratios by label matching ---
    try:
        for li in tree.css('#top-ratios li'):
            name_node = li.css_first('.name')
            number_node = li.css_first('.number')
            if name_node and number_node:
                name = name_node.text(strip=True)
                if name == 'ROE':
                    result['roe'] = _parse_number(number_node.text(strip=True))
                    break
        if 'roe' not in result:
            result['roe'] = None
    except Exception as e:
        print(f"  [screener.in] {slug} → ROE parse error: {e}")
        result['roe'] = None

    # --- CAGR metrics from table.ranges-table ---
    result['sales_5y_cagr'] = None
    result['profit_5y_cagr'] = None
    try:
        for tbl in tree.css('table.ranges-table'):
            header = tbl.css_first('th')
            if not header:
                continue
            header_text = header.text(strip=True)
            if 'Sales' in header_text and 'Compounded' in header_text:
                for row in tbl.css('tr'):
                    cells = row.css('td')
                    if len(cells) >= 2 and '5 Year' in cells[0].text():
                        result['sales_5y_cagr'] = _parse_number(cells[1].text(strip=True))
            elif 'Profit' in header_text and 'Compounded' in header_text:
                for row in tbl.css('tr'):
                    cells = row.css('td')
                    if len(cells) >= 2 and '5 Year' in cells[0].text():
                        result['profit_5y_cagr'] = _parse_number(cells[1].text(strip=True))
    except Exception as e:
        print(f"  [screener.in] {slug} → CAGR parse error: {e}")

    # --- P&L annual table for YoY metrics and D/E inputs ---
    result['revenue_growth_yoy'] = None
    result['eps_growth_yoy'] = None
    result['debt_to_equity'] = None
    result['interest_coverage'] = None
    pl_rows = {}
    try:
        pl_section = tree.css_first('#profit-loss')
        if pl_section:
            tables = pl_section.css('table')
            if tables:
                pl_rows = _table_row_values(tables[0])
                # Revenue YoY
                for label in ('Sales', 'Revenue from Operations', 'Revenue'):
                    if label in pl_rows:
                        result['revenue_growth_yoy'] = _yoy_growth(pl_rows[label])
                        break
                # EPS YoY
                for label in ('EPS in Rs', 'EPS', 'Basic EPS'):
                    if label in pl_rows:
                        result['eps_growth_yoy'] = _yoy_growth(pl_rows[label])
                        break
                # Interest coverage: (Operating Profit) / Interest
                op_vals = pl_rows.get('Operating Profit', [])
                int_vals = pl_rows.get('Interest', [])
                if op_vals and int_vals:
                    op = _parse_number(op_vals[-1])
                    interest = _parse_number(int_vals[-1])
                    if op is not None and interest and interest != 0:
                        result['interest_coverage'] = op / interest
    except Exception as e:
        print(f"  [screener.in] {slug} → P&L parse error: {e}")

    # --- Balance sheet for D/E ---
    try:
        bs_section = tree.css_first('#balance-sheet')
        if bs_section:
            tables = bs_section.css('table')
            if tables:
                bs_rows = _table_row_values(tables[0])
                equity_cap = _parse_number((bs_rows.get('Equity Capital', ['0'])[-1]))
                reserves = _parse_number((bs_rows.get('Reserves', ['0'])[-1]))
                borrowings = _parse_number((bs_rows.get('Borrowings', ['0'])[-1]))
                if equity_cap is not None and reserves is not None and borrowings is not None:
                    net_worth = (equity_cap or 0) + (reserves or 0)
                    if net_worth > 0:
                        result['debt_to_equity'] = borrowings / net_worth
    except Exception as e:
        print(f"  [screener.in] {slug} → balance sheet D/E parse error: {e}")

    # --- Quarterly table for QoQ EPS ---
    result['eps_growth_qoq'] = None
    try:
        q_section = tree.css_first('#quarters')
        if q_section:
            tables = q_section.css('table')
            if tables:
                q_rows = _table_row_values(tables[0])
                for label in ('EPS in Rs', 'EPS', 'Basic EPS'):
                    if label in q_rows:
                        result['eps_growth_qoq'] = _yoy_growth(q_rows[label])
                        break
    except Exception as e:
        print(f"  [screener.in] {slug} → quarterly EPS parse error: {e}")

    # --- Promoter / pledged from shareholding section ---
    result['promoter_holding'] = None
    result['pledged_shares'] = None
    try:
        # These may be in shareholding section or a table
        shp_section = tree.css_first('#shareholding')
        if shp_section:
            for row in shp_section.css('tr'):
                cells = row.css('td, th')
                if not cells:
                    continue
                label = cells[0].text(strip=True).lower()
                if 'promoter' in label and 'pledge' not in label:
                    vals = [c.text(strip=True) for c in cells[1:]]
                    for v in reversed(vals):
                        num = _parse_number(v)
                        if num is not None:
                            result['promoter_holding'] = num
                            break
                elif 'pledge' in label:
                    vals = [c.text(strip=True) for c in cells[1:]]
                    for v in reversed(vals):
                        num = _parse_number(v)
                        if num is not None:
                            result['pledged_shares'] = num
                            break
    except Exception as e:
        print(f"  [screener.in] {slug} → shareholding parse error: {e}")

    # --- Current ratio: not reliably on screener.in page; set to None ---
    result['current_ratio'] = None

    for key in ('roe', 'debt_to_equity', 'current_ratio', 'interest_coverage',
                'revenue_growth_yoy', 'eps_growth_yoy', 'eps_growth_qoq',
                'sales_5y_cagr', 'profit_5y_cagr'):
        if result.get(key) is None:
            print(f"  [screener.in] {slug} → missing field: {key}")

    # Sector flags — naive keyword check on page title/meta
    text_lower = html.lower()
    result['is_psu'] = any(k in text_lower for k in ['nptc', 'ongc', 'bhel', 'coal india', 'ntpc', 'sail', ' psu'])
    result['is_bank'] = any(k in text_lower for k in ['banking', 'bank ltd', 'bank limited'])
    result['is_realty'] = any(k in text_lower for k in ['real estate', 'realty', 'property'])

    return result


def fetch_india_stock(yf_symbol: str, screener_slug: str) -> dict:
    t = yf.Ticker(yf_symbol)
    info = t.info

    # screener_slug may be a human-readable slug (e.g. "reliance-industries") or
    # a stock symbol (e.g. "RELIANCE"). The scraper tries both URL formats.
    fundamentals = scrape_screener_in(screener_slug)

    # If slug-based URL failed (returned {}), retry with the raw ticker symbol
    if not fundamentals:
        ticker_symbol = yf_symbol.replace('.NS', '').replace('.BO', '').upper()
        if ticker_symbol.upper() != screener_slug.upper():
            print(f"  [india] retrying screener.in with symbol: {ticker_symbol}")
            fundamentals = scrape_screener_in(ticker_symbol)

    return {
        'ticker': yf_symbol.replace('.NS', ''),
        'name': info.get('longName'),
        'livePrice': info.get('currentPrice'),
        'metrics': {
            'minMcap': (info.get('marketCap') or 0) / 1e7,
            'maxMcap': (info.get('marketCap') or 0) / 1e7,
            'minROE': fundamentals.get('roe'),
            'onlyProfitable': (info.get('trailingEps') or 0) > 0,
            'maxDE': fundamentals.get('debt_to_equity'),
            'minCR': fundamentals.get('current_ratio'),
            'minICR': fundamentals.get('interest_coverage'),
            'minRevG': fundamentals.get('revenue_growth_yoy'),
            'minEPSG': fundamentals.get('eps_growth_yoy'),
            'minQEPSG': fundamentals.get('eps_growth_qoq'),
            'min5YSales': fundamentals.get('sales_5y_cagr'),
            'min5YProfit': fundamentals.get('profit_5y_cagr'),
            'maxPE': info.get('trailingPE'),
            'maxPEG': info.get('pegRatio'),
            'maxBeta': info.get('beta'),
            'maxPrice': info.get('currentPrice'),
            'minDip': calculate_dip(info.get('currentPrice'), info.get('fiftyTwoWeekHigh')),
            'minPromoter': fundamentals.get('promoter_holding'),
            'maxPledged': fundamentals.get('pledged_shares'),
            'excludePSU': not fundamentals.get('is_psu', False),
            'excludeBanks': not fundamentals.get('is_bank', False),
            'excludeRealty': not fundamentals.get('is_realty', False),
        }
    }
