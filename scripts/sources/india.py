"""Phase 3a: India data — yfinance (.NS) + screener.in scrape."""
import os
import sys
import time
import json
import hashlib
import math
from pathlib import Path

import yfinance as yf
import httpx
from selectolax.parser import HTMLParser

# Add scripts dir to path so compute_context is importable from fetch_data
sys.path.insert(0, str(Path(__file__).parent.parent))
from compute_context import (
    compute_price_action,
    compute_valuation_context,
    classify_retail_signal,
    classify_promoter_activity,
)

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
    result['pledged_shares'] = None   # stays None on extraction failure
    try:
        shareholding_parsed = False

        # Primary: data-source attribute
        for node in tree.css('[data-source="Pledged percentage"]'):
            num = _parse_number(node.text(strip=True))
            if num is not None:
                result['pledged_shares'] = num
                shareholding_parsed = True
                break

        # Fallback: scan #shareholding table rows
        shp_section = tree.css_first('#shareholding')
        if shp_section:
            shareholding_parsed = True          # section found — default pledge to 0
            if result['pledged_shares'] is None:
                result['pledged_shares'] = 0    # most stocks have 0% pledged
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
                            result['pledged_shares'] = num  # override the 0 default
                            break
        # If shareholding section not found at all, pledged_shares stays None
        # (genuine extraction failure, not zero pledge)
    except Exception as e:
        print(f"  [screener.in] {slug} → shareholding parse error: {e}")

    # --- Cash Flow: scrape "Cash from Operating Activity" for FCF positivity ---
    result['fcf_positive_5y'] = None
    try:
        cf_section = tree.css_first('#cash-flow')
        if cf_section:
            tables = cf_section.css('table')
            if tables:
                cf_rows = _table_row_values(tables[0])
                # Row label varies: "Cash from Operating Activity" / "Operating Cash Flow"
                for label in ('Cash from Operating Activity', 'Operating Cash Flow',
                              'Net Cash from Operating Activities'):
                    if label in cf_rows:
                        vals = [_parse_number(v) for v in cf_rows[label]]
                        valid = [v for v in vals if v is not None]
                        if len(valid) >= 3:
                            last_5 = valid[-5:] if len(valid) >= 5 else valid
                            positive = sum(1 for v in last_5 if v > 0)
                            # True if ≥ 4 of last 5 years positive (allows 1 bad year)
                            result['fcf_positive_5y'] = positive >= max(3, len(last_5) - 1)
                        break
    except Exception as e:
        print(f"  [screener.in] {slug} → cash flow parse error: {e}")

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


def _delta(a, b) -> float | None:
    """Return a - b rounded to 2dp, or None if either value is missing."""
    try:
        if a is None or b is None:
            return None
        result = float(a) - float(b)
        if math.isnan(result) or math.isinf(result):
            return None
        return round(result, 2)
    except (TypeError, ValueError):
        return None


def scrape_shareholding_pattern(slug: str) -> dict | None:
    """Scrape shareholding pattern table from screener.in for the given slug.

    Tries consolidated URL first, then standalone.
    Returns dict with 'quarters' list (each entry: date, promoter, fii, dii, public)
    or None on failure.
    """
    try:
        urls_to_try = [
            f"https://www.screener.in/company/{slug}/consolidated/",
            f"https://www.screener.in/company/{slug}/",
        ]

        html = None
        for url in urls_to_try:
            cached = _cached_get(url)
            if cached:
                html = cached
                break
            try:
                resp = httpx.get(
                    url,
                    headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'},
                    timeout=20,
                )
                if resp.status_code == 200 and 'captcha' not in resp.text.lower():
                    html = resp.text
                    _cache_set(url, html)
                    time.sleep(1)
                    break
            except Exception as e:
                print(f"  [shareholding] {slug} → error: {e}")

        if not html:
            return None

        tree = HTMLParser(html)
        shp_section = tree.css_first('#shareholding')
        if not shp_section:
            return None

        # Find the main shareholding table (not the sub-tables for promoter detail)
        tables = shp_section.css('table')
        if not tables:
            return None

        main_table = tables[0]
        rows = main_table.css('tr')
        if not rows:
            return None

        # Extract header row → quarter date labels
        header_cells = rows[0].css('th')
        if not header_cells:
            # Some pages have th in a thead
            thead = main_table.css_first('thead tr')
            header_cells = thead.css('th') if thead else []
        quarter_dates = [c.text(strip=True) for c in header_cells[1:]]  # skip first (row label)

        # Rows we care about — multiple label variants per category
        LABEL_MAP = {
            'promoter': ['Promoters', 'Promoter', 'Promoter & Promoter Group',
                         'Promoter Group', 'Promoters & Promoter Group'],
            'fii': ['FII', 'FIIs', 'Foreign Institutions', 'Foreign Institutional Investors',
                    'Foreign Portfolio Investors', 'FPI'],
            'dii': ['DII', 'DIIs', 'Domestic Institutions', 'Domestic Institutional Investors',
                    'Mutual Funds', 'Insurance Companies'],
            'public': ['Public', 'Public & Others', 'Others', 'Non-Institutions',
                       'Non-Promoter Non-Public'],
        }

        extracted: dict[str, list[float | None]] = {}
        for row in rows[1:]:
            cells = row.css('td, th')
            if not cells:
                continue
            raw_label = cells[0].text(strip=True).rstrip('+').strip()
            matched_key = None
            for key, variants in LABEL_MAP.items():
                if any(raw_label.lower() == v.lower() for v in variants):
                    matched_key = key
                    break
                # Partial match fallback
                if any(v.lower() in raw_label.lower() for v in variants[:2]):
                    matched_key = key
                    break
            if matched_key and matched_key not in extracted:
                vals = [_parse_number(c.text(strip=True)) for c in cells[1:]]
                extracted[matched_key] = vals

        if not extracted:
            return None

        # Build per-quarter list (use up to 4 most recent quarters)
        n_quarters = min(len(quarter_dates), 4)
        quarters = []
        for i in range(n_quarters):
            # Index 0 in quarter_dates is the most recent
            idx = i  # keep chronological order: 0 = most recent
            q: dict = {'date': quarter_dates[idx] if idx < len(quarter_dates) else None}
            for key in ('promoter', 'fii', 'dii', 'public'):
                vals = extracted.get(key, [])
                q[key] = vals[idx] if idx < len(vals) else None
            quarters.append(q)

        # Reverse so quarters[-1] is most recent
        quarters = list(reversed(quarters))

        return {'quarters': quarters}
    except Exception as e:
        print(f"  [shareholding] {slug} → parse error: {e}")
        return None


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

    # -----------------------------------------------------------------------
    # V2: prevClose
    # -----------------------------------------------------------------------
    prev_close = None
    try:
        hist_5d = t.history(period='5d')
        prev_close = float(hist_5d['Close'].iloc[-2]) if len(hist_5d) >= 2 else None
    except Exception:
        prev_close = None

    # -----------------------------------------------------------------------
    # V2: price_action
    # -----------------------------------------------------------------------
    price_action = None
    try:
        hist_2y = t.history(period='2y')   # 2Y gives ~500 rows; 252 needed for ret_1y
        price_action = compute_price_action(hist_2y)
    except Exception as e:
        print(f"  [india v2] {yf_symbol} price_action error: {e}")

    # -----------------------------------------------------------------------
    # V2: valuation_context
    # -----------------------------------------------------------------------
    valuation_context = None
    try:
        annual_financials = t.financials
        price_hist_5y = t.history(period='5y', interval='1mo')
        try:
            qbs = t.quarterly_balance_sheet
            info['_quarterly_balance_sheet'] = qbs
        except Exception:
            pass
        try:
            qf = t.quarterly_financials
        except Exception:
            qf = None
        valuation_context = compute_valuation_context(info, annual_financials, price_hist_5y,
                                                      quarterly_financials=qf)
    except Exception as e:
        print(f"  [india v2] {yf_symbol} valuation_context error: {e}")

    # -----------------------------------------------------------------------
    # V2: ownership (scrape shareholding pattern)
    # -----------------------------------------------------------------------
    ownership = None
    retail_signal = None
    promoter_activity = None
    try:
        # Try the screener_slug first, then the raw ticker symbol
        ownership_data = scrape_shareholding_pattern(screener_slug)
        if not ownership_data:
            ticker_symbol = yf_symbol.replace('.NS', '').replace('.BO', '').upper()
            if ticker_symbol.upper() != screener_slug.upper():
                ownership_data = scrape_shareholding_pattern(ticker_symbol)

        if ownership_data and ownership_data.get('quarters'):
            quarters = ownership_data['quarters']
            current_q = quarters[-1]
            prev_q = quarters[-2] if len(quarters) >= 2 else None

            ownership = {
                'current': {
                    'promoter': current_q.get('promoter'),
                    'fii': current_q.get('fii'),
                    'dii': current_q.get('dii'),
                    'public': current_q.get('public'),
                    'institutional': None,  # India uses FII/DII split
                    'insider': None,
                },
                'trend_qoq': {
                    'promoter': _delta(current_q.get('promoter'),
                                       prev_q.get('promoter') if prev_q else None),
                    'fii': _delta(current_q.get('fii'),
                                  prev_q.get('fii') if prev_q else None),
                    'dii': _delta(current_q.get('dii'),
                                  prev_q.get('dii') if prev_q else None),
                    'public': _delta(current_q.get('public'),
                                     prev_q.get('public') if prev_q else None),
                    'institutional': None,
                    'insider': None,
                },
                'as_of': current_q.get('date'),
                'trend_reason': None,
            }

            # retail_signal
            retail_signal = classify_retail_signal(
                ownership['current'].get('public'),
                ownership['trend_qoq'].get('public'),
            )

            # promoter_activity
            promoter_activity = classify_promoter_activity(
                ownership['current'].get('promoter'),
                ownership['trend_qoq'].get('promoter'),
                fundamentals.get('pledged_shares') if fundamentals else None,
            )
    except Exception as e:
        print(f"  [india v2] {yf_symbol} ownership error: {e}")

    return {
        'ticker': yf_symbol.replace('.NS', ''),
        'name': info.get('longName'),
        'livePrice': info.get('currentPrice'),
        'prevClose': prev_close,
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
            'fcfPositive5Y': fundamentals.get('fcf_positive_5y'),
            'excludePSU': not fundamentals.get('is_psu', False),
            'excludeBanks': not fundamentals.get('is_bank', False),
            'excludeRealty': not fundamentals.get('is_realty', False),
        },
        # V2 fields
        'price_action': price_action,
        'valuation_context': valuation_context,
        'earnings_surprises': None,  # India: not available via yfinance
        'ownership': ownership,
        'retail_signal': retail_signal,
        'promoter_activity': promoter_activity,
    }
