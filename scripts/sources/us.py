"""Phase 3b: US data — yfinance + Finnhub MSPR insider sentiment."""
import os
import sys
import json
import math
from datetime import datetime, timedelta, date
from pathlib import Path

import yfinance as yf
import httpx

# Add scripts dir to path so compute_context is importable
sys.path.insert(0, str(Path(__file__).parent.parent))
from compute_context import (
    compute_price_action,
    compute_valuation_context,
    parse_earnings_surprises,
)

FINNHUB_API_KEY = os.environ.get('FINNHUB_API_KEY', '')

# ---------------------------------------------------------------------------
# Snapshot caching — persists across daily runs
# ---------------------------------------------------------------------------
SNAPSHOT_FILE = Path('.cache/us_ownership_snapshots.json')


def load_snapshots() -> dict:
    """Load the US ownership snapshot file, returning an empty structure if missing."""
    try:
        if SNAPSHOT_FILE.exists():
            return json.loads(SNAPSHOT_FILE.read_text())
    except Exception:
        pass
    return {'snapshots': []}


def save_snapshot(snapshots_data: dict, run_date: str, ticker_data: dict):
    """Append or update today's snapshot in snapshots_data dict. Keeps last 6."""
    snaps = snapshots_data.get('snapshots', [])
    # Remove today's entry if already exists
    snaps = [s for s in snaps if s.get('date') != run_date]
    snaps.append({'date': run_date, 'tickers': ticker_data})
    # Sort ascending, keep newest 6
    snaps = sorted(snaps, key=lambda s: s['date'])[-6:]
    snapshots_data['snapshots'] = snaps


def get_prior_snapshot(snapshots_data: dict, target_date: str) -> dict | None:
    """Return the most recent snapshot that is >= 60 days older than target_date.

    Returns None if no such snapshot exists (i.e. history is too short).
    """
    try:
        today = date.fromisoformat(target_date)
        cutoff = today - timedelta(days=60)
        candidates = [
            s for s in snapshots_data.get('snapshots', [])
            if date.fromisoformat(s['date']) <= cutoff
        ]
        if not candidates:
            return None
        return sorted(candidates, key=lambda s: s['date'])[-1]
    except Exception:
        return None


def _is_valid_num(v) -> bool:
    """Return True if v is a non-None, non-NaN finite number."""
    try:
        f = float(v)
        return not (math.isnan(f) or math.isinf(f))
    except (TypeError, ValueError):
        return False


def calculate_interest_coverage(financials) -> float | None:
    try:
        if financials is None:
            return None
        # Try EBIT / Interest Expense first; fall back to Operating Income
        ebit = None
        for ebit_row in ('EBIT', 'Operating Income'):
            if ebit_row in financials.index:
                v = financials.loc[ebit_row].iloc[0]
                if _is_valid_num(v):
                    ebit = float(v)
                    break
        interest = None
        for int_row in ('Interest Expense', 'Interest Expense Non Operating',
                        'Interest Paid Supplemental Data'):
            if int_row in financials.index:
                v = financials.loc[int_row].iloc[0]
                if _is_valid_num(v) and float(v) != 0:
                    interest = float(v)
                    break
        if ebit is not None and interest is not None and interest != 0:
            return ebit / abs(interest)
    except Exception:
        pass
    return None


def compute_cagr(values, years: int) -> float | None:
    try:
        # Filter out None, NaN, inf, and zero values (handles both lists and numpy arrays)
        vals = [float(v) for v in values if _is_valid_num(v) and float(v) != 0]
        if len(vals) < 2:
            return None
        end, start = vals[0], vals[min(years, len(vals) - 1)]
        if start <= 0:
            return None
        return ((end / start) ** (1 / years) - 1) * 100
    except Exception:
        return None


def compute_fcf_yield(cashflow, market_cap) -> float | None:
    try:
        ocf = cashflow.loc['Operating Cash Flow'].iloc[0]
        capex = cashflow.loc['Capital Expenditure'].iloc[0]
        fcf = float(ocf) + float(capex)  # capex is negative in yfinance
        if market_cap and market_cap > 0:
            return (fcf / market_cap) * 100
    except Exception:
        pass
    return None


def all_fcf_positive(cashflow, years: int) -> bool:
    """True if all available FCF years are positive (min 3 years required).

    Uses Free Cash Flow row directly when available; otherwise falls back to
    Operating Cash Flow + Capital Expenditure. Filters NaN values so a single
    missing year doesn't poison the result.
    """
    try:
        if cashflow is None:
            return False
        # Prefer the direct FCF row yfinance provides
        if 'Free Cash Flow' in cashflow.index:
            vals = [float(v) for v in cashflow.loc['Free Cash Flow'].values[:years]
                    if _is_valid_num(v)]
        else:
            ocf   = cashflow.loc['Operating Cash Flow'].values[:years]
            capex = cashflow.loc['Capital Expenditure'].values[:years]
            vals  = [float(o) + float(c) for o, c in zip(ocf, capex)
                     if _is_valid_num(o) and _is_valid_num(c)]
        return len(vals) >= 3 and all(v > 0 for v in vals)
    except Exception:
        return False


def shares_not_increasing(ticker) -> bool:
    try:
        # yfinance removed the .shares attribute — use get_shares_full() instead
        shares_series = ticker.get_shares_full()
        if shares_series is None or len(shares_series) < 2:
            return True
        vals = shares_series.dropna().values
        return float(vals[-1]) <= float(vals[0]) * 1.05
    except Exception:
        # Fall back to info dict
        try:
            outstanding = ticker.info.get('sharesOutstanding')
            if outstanding:
                return True  # can't compare trend; assume flat
        except Exception:
            pass
        return True


def compute_sbc_ratio(ticker) -> float | None:
    try:
        cf = ticker.cashflow
        sbc = cf.loc['Stock Based Compensation'].iloc[0]
        rev = ticker.financials.loc['Total Revenue'].iloc[0]
        if rev and rev > 0:
            return float(sbc / rev) * 100
    except Exception:
        pass
    return None


def is_china_adr(info: dict) -> bool:
    country = (info.get('country') or '').lower()
    return 'china' in country


def fetch_finnhub_mspr(ticker: str) -> float:
    if not FINNHUB_API_KEY:
        return 0.0
    from_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
    to_date = datetime.now().strftime('%Y-%m-%d')
    url = (f"https://finnhub.io/api/v1/stock/insider-sentiment"
           f"?symbol={ticker}&from={from_date}&to={to_date}&token={FINNHUB_API_KEY}")
    try:
        resp = httpx.get(url, timeout=10)
        data = resp.json()
        items = data.get('data', [])[-3:]
        if not items:
            return 0.0
        return sum(item['mspr'] for item in items) / len(items)
    except Exception:
        return 0.0


def _safe_revenue_vals(financials) -> list:
    """Safely extract Total Revenue values from financials DataFrame."""
    try:
        if financials is None:
            return []
        if 'Total Revenue' in financials.index:
            return list(financials.loc['Total Revenue'].values)
        if 'Operating Revenue' in financials.index:
            return list(financials.loc['Operating Revenue'].values)
    except Exception:
        pass
    return []


def _safe_net_income_vals(financials) -> list:
    """Safely extract Net Income values from financials DataFrame."""
    try:
        if financials is None:
            return []
        for row in ('Net Income', 'Net Income Common Stockholders',
                    'Net Income From Continuing Operation Net Minority Interest'):
            if row in financials.index:
                return list(financials.loc[row].values)
    except Exception:
        pass
    return []


def fetch_us_ownership_current(ticker_obj) -> dict | None:
    """Extract current institutional and insider holding % from major_holders.

    major_holders DataFrame rows (typical):
      index 0: "% of Shares Held by All Insider"
      index 1: "% of Shares Held by Institutions"
    Values are strings like '0.06%' or floats.
    Returns {'institutional': float, 'insider': float} or None on failure.
    """
    try:
        mh = ticker_obj.major_holders
        if mh is None or mh.empty:
            return None

        inst_pct = None
        insider_pct = None

        # major_holders can be indexed by label or positionally
        # Try label-based access first (newer yfinance returns a 2-col df with 'Value'/'Breakdown')
        try:
            # Reset index to iterate rows
            mh_reset = mh.reset_index()
            for _, row in mh_reset.iterrows():
                vals = [str(v) for v in row.values]
                combined = ' '.join(vals).lower()
                pct_str = None
                for v in vals:
                    if '%' in str(v):
                        pct_str = str(v)
                        break
                if pct_str is None:
                    # might be a float already
                    for v in vals:
                        try:
                            f = float(v)
                            if not (math.isnan(f) or math.isinf(f)):
                                pct_str = str(f * 100) + '%'
                                break
                        except (ValueError, TypeError):
                            continue

                if pct_str:
                    num_str = pct_str.replace('%', '').strip()
                    try:
                        num = float(num_str)
                        if math.isnan(num) or math.isinf(num):
                            num = None
                    except (ValueError, TypeError):
                        num = None

                    if 'institution' in combined and inst_pct is None:
                        inst_pct = round(num, 2) if num is not None else None
                    elif 'insider' in combined and insider_pct is None:
                        insider_pct = round(num, 2) if num is not None else None
        except Exception:
            pass

        # Fallback: positional access
        if inst_pct is None and insider_pct is None:
            try:
                vals = mh.iloc[:, 0].tolist()
                for v in vals:
                    try:
                        v_str = str(v).replace('%', '').strip()
                        float(v_str)
                    except (ValueError, TypeError):
                        pass
            except Exception:
                pass

        if inst_pct is None and insider_pct is None:
            return None

        # Institutional QoQ trend from institutional_holders.pctChange
        # pctChange = fractional change in shares held by each major institution.
        # Weighted sum (capped at ±0.5 per holder) gives directional signal:
        #   positive → institutions broadly increasing; negative → reducing.
        inst_trend = None
        try:
            ih = ticker_obj.institutional_holders
            if ih is not None and not ih.empty and 'pctChange' in ih.columns and 'pctHeld' in ih.columns:
                weighted = 0.0
                count = 0
                for _, row in ih.iterrows():
                    pc = row.get('pctChange')
                    ph = row.get('pctHeld')
                    if _is_valid_num(pc) and _is_valid_num(ph):
                        weighted += max(-0.5, min(0.5, float(pc))) * float(ph)
                        count += 1
                if count >= 3:
                    inst_trend = round(weighted * 100, 2)  # express as pp-equivalent
        except Exception:
            pass

        return {
            'institutional': inst_pct,
            'insider':       insider_pct,
            'inst_trend':    inst_trend,   # QoQ directional signal, no snapshot needed
        }
    except Exception:
        return None


def fetch_earnings_surprises(ticker_obj) -> list | None:
    """Fetch last 4 past earnings quarters using earnings_history (no lxml needed).

    earnings_history columns: epsActual, epsEstimate, epsDifference, surprisePercent
    surprisePercent is in decimal form (0.10 = 10%). Index is quarter-end date.
    Array returned is newest-first for streak counting in pattern engine.
    """
    QUARTER_MAP = {3: 'Q1', 6: 'Q2', 9: 'Q3', 12: 'Q4'}
    try:
        eh = ticker_obj.earnings_history
        if eh is None or eh.empty:
            return None
        past = eh[eh['epsActual'].notna()].copy()
        if past.empty:
            return None
        past = past.sort_index(ascending=False).head(4)
        results = []
        for dt, row in past.iterrows():
            est    = row.get('epsEstimate')
            actual = row.get('epsActual')
            if est is None or actual is None:
                continue
            surprise_pct = round(float(row['surprisePercent']) * 100, 2)
            verdict = 'beat' if surprise_pct > 1 else 'miss' if surprise_pct < -1 else 'meet'
            month   = dt.month if hasattr(dt, 'month') else int(str(dt)[5:7])
            year    = dt.year  if hasattr(dt, 'year')  else int(str(dt)[:4])
            import calendar
            quarter_label = QUARTER_MAP.get(month, calendar.month_abbr[month])
            results.append({
                'quarter':      f"{quarter_label} {year}",
                'estimate':     round(float(est), 2),
                'actual':       round(float(actual), 2),
                'surprise_pct': surprise_pct,
                'verdict':      verdict,
            })
        return results if results else None
    except Exception as e:
        print(f"  [us] earnings_history error: {e}")
        return None


def fetch_us_stock(yf_symbol: str) -> dict:
    t = yf.Ticker(yf_symbol)
    info = t.info

    try:
        financials = t.financials
    except Exception:
        financials = None

    try:
        cashflow = t.cashflow
    except Exception:
        cashflow = None

    mspr = fetch_finnhub_mspr(yf_symbol)

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
        hist_2y = t.history(period='2y')   # 2Y gives ~502 rows; 252 needed for ret_1y
        price_action = compute_price_action(hist_2y)
    except Exception as e:
        print(f"  [us v2] {yf_symbol} price_action error: {e}")

    # -----------------------------------------------------------------------
    # V2: valuation_context
    # -----------------------------------------------------------------------
    valuation_context = None
    try:
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
        valuation_context = compute_valuation_context(info, financials, price_hist_5y,
                                                      quarterly_financials=qf)
    except Exception as e:
        print(f"  [us v2] {yf_symbol} valuation_context error: {e}")

    # -----------------------------------------------------------------------
    # V2: earnings_surprises
    # -----------------------------------------------------------------------
    earnings_surprises = None
    try:
        earnings_surprises = fetch_earnings_surprises(t)
    except Exception as e:
        print(f"  [us v2] {yf_symbol} earnings_surprises error: {e}")

    # -----------------------------------------------------------------------
    # V2: ownership (current snapshot only — trend added in fetch_data.py)
    # -----------------------------------------------------------------------
    ownership_current = None
    try:
        ownership_current = fetch_us_ownership_current(t)
    except Exception as e:
        print(f"  [us v2] {yf_symbol} ownership error: {e}")

    ownership = None
    if ownership_current:
        ownership = {
            'current': {
                'institutional': ownership_current.get('institutional'),
                'insider':       ownership_current.get('insider'),
                'promoter': None,
                'fii':      None,
                'dii':      None,
                'public':   None,
            },
            # inst_trend from pctChange is available immediately (no snapshot wait).
            # fetch_data.py snapshot loop will overwrite institutional when history exists.
            'trend_qoq': {
                'institutional': ownership_current.get('inst_trend'),
                'insider':  None,
                'promoter': None,
                'fii':      None,
                'dii':      None,
                'public':   None,
            },
            'as_of':       None,
            'trend_reason': None if ownership_current.get('inst_trend') is not None else 'no_pctchange_data',
        }

    return {
        'ticker': yf_symbol,
        'name': info.get('longName'),
        'livePrice': info.get('currentPrice'),
        'prevClose': prev_close,
        'metrics': {
            'minMcapUS': (info.get('marketCap') or 0) / 1e9,
            'maxMcapUS': (info.get('marketCap') or 0) / 1e9,
            'positiveEPS': (info.get('trailingEps') or 0) > 0,
            'minROEUS': (info.get('returnOnEquity') or 0) * 100,
            'minROIC': (info.get('returnOnAssets') or 0) * 100,
            'minOpMargin': (info.get('operatingMargins') or 0) * 100,
            'maxDEUS': (info.get('debtToEquity') or 0) / 100,
            'minCRUS': info.get('currentRatio'),
            'minICRUS': calculate_interest_coverage(financials),
            'minRevGUS': (info.get('revenueGrowth') or 0) * 100,
            'minEPSGUS': (info.get('earningsGrowth') or 0) * 100,
            'min5YSalesUS': compute_cagr(_safe_revenue_vals(financials), 5),
            'min5YProfitUS': compute_cagr(_safe_net_income_vals(financials), 5),
            'minFCFY': compute_fcf_yield(cashflow, info.get('marketCap')),
            'fcfPositive5Y': all_fcf_positive(cashflow, 5),
            'maxPEUS': info.get('trailingPE'),
            'maxPEGUS': info.get('pegRatio'),
            'maxBetaUS': info.get('beta'),
            'minGM': (info.get('grossMargins') or 0) * 100,
            'sharesFlat': shares_not_increasing(t),
            'maxSBC': compute_sbc_ratio(t),
            'minInstOwn': (info.get('heldPercentInstitutions') or 0) * 100,
            'maxShort': (info.get('shortPercentOfFloat') or 0) * 100,
            'analystBuy': (info.get('recommendationMean') or 5) < 2.5,
            'minMSPR': mspr,
            'excludeChina': not is_china_adr(info),
        },
        # V2 fields
        'price_action': price_action,
        'valuation_context': valuation_context,
        'earnings_surprises': earnings_surprises,
        'ownership': ownership,
        'retail_signal': None,          # US: not applicable
        'promoter_activity': None,      # US: not applicable
    }
