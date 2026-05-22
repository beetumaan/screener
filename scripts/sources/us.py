"""Phase 3b: US data — yfinance + Finnhub MSPR insider sentiment."""
import os
import math
from datetime import datetime, timedelta

import yfinance as yf
import httpx

FINNHUB_API_KEY = os.environ.get('FINNHUB_API_KEY', '')


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
    try:
        ocf = cashflow.loc['Operating Cash Flow'].values[:years]
        capex = cashflow.loc['Capital Expenditure'].values[:years]
        return all(float(o) + float(c) > 0 for o, c in zip(ocf, capex))
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

    return {
        'ticker': yf_symbol,
        'name': info.get('longName'),
        'livePrice': info.get('currentPrice'),
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
        }
    }
