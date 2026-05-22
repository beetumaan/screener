"""Phase 3c: Indian mutual fund data — MFAPI + computed risk-adjusted metrics."""
import math
from datetime import date, timedelta

import httpx
import yfinance as yf

_nifty_returns_cache: list[float] | None = None


def _fetch_nifty_returns() -> list[float]:
    global _nifty_returns_cache
    if _nifty_returns_cache is not None:
        return _nifty_returns_cache
    t = yf.Ticker('^NSEI')
    hist = t.history(period='5y')
    closes = hist['Close'].values
    _nifty_returns_cache = [(closes[i] / closes[i-1]) - 1 for i in range(1, len(closes))]
    return _nifty_returns_cache


def compute_return(navs: list[float], days: int) -> float | None:
    if len(navs) < days:
        return None
    return (navs[-1] / navs[-days]) - 1


def compute_cagr_from_navs(navs: list[float], years: int) -> float | None:
    trading_days = years * 252
    if len(navs) < trading_days:
        return None
    start = navs[-trading_days]
    end = navs[-1]
    if start <= 0:
        return None
    return (end / start) ** (1 / years) - 1


def compute_sharpe(daily_returns: list[float], risk_free_rate: float = 0.07) -> float | None:
    if len(daily_returns) < 30:
        return None
    daily_rf = (1 + risk_free_rate) ** (1/252) - 1
    excess = [r - daily_rf for r in daily_returns]
    mean = sum(excess) / len(excess)
    variance = sum((r - mean) ** 2 for r in excess) / len(excess)
    std = math.sqrt(variance)
    if std == 0:
        return None
    return (mean / std) * math.sqrt(252)


def compute_annualized_std(daily_returns: list[float]) -> float | None:
    if len(daily_returns) < 30:
        return None
    mean = sum(daily_returns) / len(daily_returns)
    variance = sum((r - mean) ** 2 for r in daily_returns) / len(daily_returns)
    return math.sqrt(variance * 252) * 100


def compute_beta(fund_returns: list[float], benchmark_returns: list[float]) -> float | None:
    n = min(len(fund_returns), len(benchmark_returns))
    if n < 30:
        return None
    f = fund_returns[-n:]
    b = benchmark_returns[-n:]
    mean_f = sum(f) / n
    mean_b = sum(b) / n
    cov = sum((f[i] - mean_f) * (b[i] - mean_b) for i in range(n)) / n
    var_b = sum((b[i] - mean_b) ** 2 for i in range(n)) / n
    if var_b == 0:
        return None
    return cov / var_b


def compute_alpha(fund_returns: list[float], benchmark_returns: list[float], risk_free_rate: float = 0.07) -> float | None:
    beta = compute_beta(fund_returns, benchmark_returns)
    if beta is None:
        return None
    n = min(len(fund_returns), len(benchmark_returns))
    ann_fund = (sum(fund_returns[-n:]) / n) * 252
    ann_bench = (sum(benchmark_returns[-n:]) / n) * 252
    return ann_fund - (risk_free_rate + beta * (ann_bench - risk_free_rate))


def compute_fund_age(nav_history: list[dict]) -> float | None:
    if not nav_history:
        return None
    from datetime import datetime
    date_str = nav_history[-1]['date']
    # MFAPI returns dates in multiple formats depending on the fund:
    #   "DD-Mon-YYYY" e.g. "01-Jan-2023"
    #   "DD-MM-YYYY"  e.g. "02-01-2013"
    for fmt in ('%d-%b-%Y', '%d-%m-%Y', '%Y-%m-%d'):
        try:
            oldest_date = datetime.strptime(date_str, fmt).date()
            return (date.today() - oldest_date).days / 365
        except ValueError:
            continue
    return None


def fetch_expense_ratio(scheme_code: str) -> float | None:
    # MFAPI doesn't expose expense ratio; default to None (unknown)
    return None


def fetch_aum(scheme_code: str) -> float | None:
    # MFAPI doesn't expose AUM directly; default to None
    return None


def fetch_mf(scheme_code: str) -> dict:
    url = f"https://api.mfapi.in/mf/{scheme_code}"
    resp = httpx.get(url, timeout=15)
    data = resp.json()

    nav_history = data['data']
    meta = data['meta']

    navs = [float(item['nav']) for item in reversed(nav_history)]
    # Guard against zero NAVs (can appear as data errors in MFAPI)
    daily_returns = [
        (navs[i] / navs[i-1]) - 1
        for i in range(1, len(navs))
        if navs[i-1] != 0 and navs[i] != 0
    ]

    nifty_returns = _fetch_nifty_returns()

    return {
        'ticker': scheme_code,
        'name': meta['scheme_name'],
        'livePrice': navs[-1] if navs else None,
        'metrics': {
            'maxER': fetch_expense_ratio(scheme_code),
            'zeroExitAfter1Y': True,
            'min1Y': (compute_return(navs, 365) or 0) * 100,
            'min3Y': (compute_cagr_from_navs(navs, 3) or 0) * 100,
            'min5Y': (compute_cagr_from_navs(navs, 5) or 0) * 100,
            'minSharpe': compute_sharpe(daily_returns),
            'minAlpha': compute_alpha(daily_returns, nifty_returns),
            'maxStdDev': compute_annualized_std(daily_returns),
            'maxBetaMF': compute_beta(daily_returns, nifty_returns),
            'minAUM': fetch_aum(scheme_code),
            'maxAUM': fetch_aum(scheme_code),
            'minFundAge': compute_fund_age(nav_history),
            'minMgrTenure': 3,
            'maxTop10': 50,
            'maxTurnover': 100,
            'directPlan': 'Direct' in meta.get('scheme_name', ''),
        }
    }
