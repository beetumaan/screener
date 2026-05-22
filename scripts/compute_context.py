"""Analyzer V2 Phase A — pure helper functions for contextual data fields.

All functions are defensively wrapped: any computation error returns None.
"""
import math


def _safe_float(v) -> float | None:
    """Convert v to float; return None if NaN, Inf, or unconvertible."""
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _r2(v) -> float | None:
    """Round to 2dp, return None if not a valid number."""
    f = _safe_float(v)
    return round(f, 2) if f is not None else None


# ---------------------------------------------------------------------------
# 1. Price action
# ---------------------------------------------------------------------------

def compute_price_action(hist_df) -> dict | None:
    """Compute return and 52-week stats from a yfinance daily history DataFrame.

    hist_df: result of ticker.history(period='1y') or longer.
    Trading-day windows: 1w=5, 1m=21, 3m=63, 6m=126, 1y=252.
    Returns None on any failure.
    """
    try:
        if hist_df is None or hist_df.empty:
            return None

        close = hist_df['Close'].dropna()
        if len(close) < 2:
            return None

        current = float(close.iloc[-1])

        def _ret(window: int) -> float | None:
            if len(close) < window + 1:
                return None
            past = float(close.iloc[-(window + 1)])
            if past == 0:
                return None
            return _r2((current - past) / past * 100)

        high_52w = _safe_float(close.max())
        low_52w = _safe_float(close.min())

        pct_from_high = None
        pct_from_low = None
        if high_52w and high_52w != 0:
            pct_from_high = _r2((current - high_52w) / high_52w * 100)
        if low_52w and low_52w != 0:
            pct_from_low = _r2((current - low_52w) / low_52w * 100)

        return {
            'ret_1w': _ret(5),
            'ret_1m': _ret(21),
            'ret_3m': _ret(63),
            'ret_6m': _ret(126),
            'ret_1y': _ret(252),
            'pct_from_52w_high': pct_from_high,
            'pct_from_52w_low': pct_from_low,
            'fifty_two_week_high': _r2(high_52w),
            'fifty_two_week_low': _r2(low_52w),
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 2. Valuation context
# ---------------------------------------------------------------------------

def compute_valuation_context(ticker_info, annual_financials, price_hist_5y,
                              quarterly_financials=None) -> dict | None:
    """Compute PE and PB context vs 5-year averages.

    Uses trailing 4-quarter EPS × monthly price so pe_5y_avg is on the same
    basis as trailingPE from info (not fiscal-year-end prices, which distort
    the comparison during bear/bull market extremes).

    ticker_info:          t.info dict
    annual_financials:    t.financials (annual) — used only as fallback
    price_hist_5y:        t.history(period='5y', interval='1mo')
    quarterly_financials: t.quarterly_financials — preferred source for trailing EPS
    """
    import pandas as pd

    try:
        if ticker_info is None:
            return None

        pe_current = _safe_float(ticker_info.get('trailingPE'))
        pb_current = _safe_float(ticker_info.get('priceToBook'))

        pe_5y_avg = None
        pe_vs_avg_pct = None
        pb_5y_avg = None
        pb_vs_avg_pct = None
        period_years = 0

        # --- Historical PE using trailing 4-quarter EPS × monthly price ---
        # This matches the basis of trailingPE from info.
        try:
            qf = quarterly_financials if quarterly_financials is not None else ticker_info.get('_quarterly_financials')
            close_monthly = price_hist_5y['Close'].dropna() if price_hist_5y is not None else None

            if qf is not None and not qf.empty and close_monthly is not None and len(close_monthly) > 0:
                # Get quarterly EPS series (Basic EPS preferred, Diluted EPS fallback)
                eps_row = None
                for label in ('Basic EPS', 'Diluted EPS'):
                    if label in qf.index:
                        eps_row = qf.loc[label].dropna()
                        break

                if eps_row is not None and len(eps_row) >= 4:
                    # eps_row is indexed by quarter-end dates, newest first
                    eps_dates = sorted(eps_row.index, reverse=True)  # newest first

                    # Normalise monthly price index to tz-naive
                    idx_naive = (close_monthly.index.tz_localize(None)
                                 if close_monthly.index.tz is not None
                                 else close_monthly.index)

                    pe_vals = []
                    # Walk each monthly price point and compute trailing 4Q EPS at that time
                    for price_ts, price_val in zip(idx_naive, close_monthly.values):
                        price_val = _safe_float(price_val)
                        if not price_val or price_val <= 0:
                            continue
                        # Quarters available AT OR BEFORE this price date
                        avail = []
                        for qdate in eps_dates:
                            qdate_naive = (qdate.tz_localize(None)
                                           if hasattr(qdate, 'tz_localize') and qdate.tz is not None
                                           else qdate)
                            if qdate_naive <= price_ts:
                                avail.append(_safe_float(eps_row[qdate]))
                            if len(avail) == 4:
                                break
                        if len(avail) < 4:
                            continue
                        trailing_eps = sum(v for v in avail if v is not None)
                        if trailing_eps <= 0:
                            continue
                        pe = price_val / trailing_eps
                        if 0 < pe < 1000:
                            pe_vals.append(pe)

                    period_years = round(len(pe_vals) / 12, 1) if pe_vals else 0
                    if pe_vals:
                        pe_5y_avg = _r2(sum(pe_vals) / len(pe_vals))
                        if pe_current and pe_5y_avg and pe_5y_avg != 0:
                            pe_vs_avg_pct = _r2((pe_current - pe_5y_avg) / pe_5y_avg * 100)
        except Exception:
            pass

        # --- Historical PB from quarterly balance sheet ---
        try:
            import yfinance as yf  # only used if caller passes ticker_info; we need shares
            shares = _safe_float(ticker_info.get('sharesOutstanding'))
            if shares and shares > 0 and price_hist_5y is not None and not price_hist_5y.empty:
                # We don't have the ticker object here — PB historical requires balance sheet
                # The caller can optionally pass quarterly_balance_sheet via ticker_info extras.
                # If not available, pb_5y_avg stays None.
                qbs = ticker_info.get('_quarterly_balance_sheet')  # injected by caller if available
                if qbs is not None and not qbs.empty:
                    import pandas as pd
                    close_monthly = price_hist_5y['Close'].dropna()
                    eq_row = None
                    for label in ('Total Stockholder Equity', 'Stockholders Equity',
                                  'Common Stock Equity', 'Total Equity Gross Minority Interest'):
                        if label in qbs.index:
                            eq_row = qbs.loc[label]
                            break
                    if eq_row is not None:
                        pb_vals = []
                        for col in qbs.columns:
                            eq_val = _safe_float(eq_row.get(col))
                            if eq_val is None or eq_val <= 0:
                                continue
                            bv_per_share = eq_val / shares
                            try:
                                fy_ts = pd.Timestamp(col)
                                idx_naive = close_monthly.index.tz_localize(None) if close_monthly.index.tz is not None else close_monthly.index
                                fy_ts_naive = fy_ts.tz_localize(None) if fy_ts.tz is not None else fy_ts
                                window = close_monthly[(idx_naive >= fy_ts_naive - pd.Timedelta(days=45))
                                                       & (idx_naive <= fy_ts_naive + pd.Timedelta(days=45))]
                                if window.empty:
                                    continue
                                q_price = _safe_float(window.iloc[-1])
                                if q_price and q_price > 0 and bv_per_share > 0:
                                    pb_q = q_price / bv_per_share
                                    if 0 < pb_q < 500:
                                        pb_vals.append(pb_q)
                            except Exception:
                                continue
                        if pb_vals:
                            pb_5y_avg = _r2(sum(pb_vals) / len(pb_vals))
                            if pb_current and pb_5y_avg and pb_5y_avg != 0:
                                pb_vs_avg_pct = _r2((pb_current - pb_5y_avg) / pb_5y_avg * 100)
        except Exception:
            pass

        return {
            'pe_current': _r2(pe_current),
            'pe_5y_avg': pe_5y_avg,
            'pe_vs_avg_pct': pe_vs_avg_pct,
            'pb_current': _r2(pb_current),
            'pb_5y_avg': pb_5y_avg,
            'pb_vs_avg_pct': pb_vs_avg_pct,
            'period_years': period_years,
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 3. Earnings surprises
# ---------------------------------------------------------------------------

def parse_earnings_surprises(earnings_dates_df) -> list | None:
    """Parse last 4 past quarters from t.get_earnings_dates(limit=12).

    Returns list of dicts with quarter, estimate, actual, surprise_pct, verdict.
    Returns None if no usable data.
    """
    try:
        if earnings_dates_df is None or earnings_dates_df.empty:
            return None

        # Filter to past quarters where Reported EPS is not null
        past = earnings_dates_df[earnings_dates_df['Reported EPS'].notna()].head(4)
        if past.empty:
            return None

        results = []
        for dt, row in past.iterrows():
            est = _safe_float(row.get('EPS Estimate'))
            actual = _safe_float(row.get('Reported EPS'))
            if est is None or actual is None or est == 0:
                continue
            surprise_pct = _r2((actual - est) / abs(est) * 100)
            verdict = 'beat' if surprise_pct > 1 else 'miss' if surprise_pct < -1 else 'meet'
            try:
                import pandas as pd
                ts = pd.Timestamp(dt)
                q_num = (ts.month - 1) // 3 + 1
                quarter_label = f'Q{q_num} {ts.year}'
            except Exception:
                quarter_label = str(dt)[:7]
            results.append({
                'quarter': quarter_label,
                'estimate': _r2(est),
                'actual': _r2(actual),
                'surprise_pct': surprise_pct,
                'verdict': verdict,
            })
        return results if results else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 4. Ownership trend
# ---------------------------------------------------------------------------

def compute_ownership_trend(current_snapshot, prior_snapshot) -> dict:
    """Compute QoQ delta between two ownership snapshots.

    Both dicts have keys: institutional, insider (floats or None).
    Returns dict with delta values, or None for missing fields.
    """
    try:
        result = {
            'institutional': None,
            'insider': None,
            'promoter': None,
            'fii': None,
            'dii': None,
            'public': None,
        }
        if not current_snapshot or not prior_snapshot:
            return result
        for field in ['institutional', 'insider']:
            curr = _safe_float(current_snapshot.get(field))
            prev = _safe_float(prior_snapshot.get(field))
            if curr is not None and prev is not None:
                result[field] = _r2(curr - prev)
        return result
    except Exception:
        return {
            'institutional': None,
            'insider': None,
            'promoter': None,
            'fii': None,
            'dii': None,
            'public': None,
        }


# ---------------------------------------------------------------------------
# 5. Retail signal (India-only)
# ---------------------------------------------------------------------------

def classify_retail_signal(public_pct, trend_qoq_public) -> dict | None:
    """Classify retail (public) holding trend for India stocks.

    public_pct: current public holding % (float or None)
    trend_qoq_public: QoQ delta in pp (float or None)
    Returns dict or None if public_pct is None.
    """
    try:
        if public_pct is None:
            return None
        interp = 'stable'
        if trend_qoq_public is not None:
            if trend_qoq_public > 0.5:
                interp = 'increasing'
            elif trend_qoq_public < -0.5:
                interp = 'decreasing'
        return {
            'public_pct': _r2(public_pct),
            'trend_qoq': _r2(trend_qoq_public),
            'interpretation': interp,
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 6. Promoter activity (India-only)
# ---------------------------------------------------------------------------

def classify_promoter_activity(promoter_pct, trend_qoq_promoter, pledged_pct) -> dict | None:
    """Classify promoter activity signal for India stocks.

    Signal rules:
      'open_market_buying' — trend > 0.3 AND pledged is flat/down (< 0.5 delta, or None)
      'promoter_selling'   — trend < -0.3
      'stable'             — otherwise

    Returns None if promoter_pct is None.
    """
    try:
        if promoter_pct is None:
            return None

        signal = 'stable'
        if trend_qoq_promoter is not None:
            pledged_increasing = (
                pledged_pct is not None and _safe_float(pledged_pct) is not None
                and _safe_float(pledged_pct) > 0.5
            )
            if trend_qoq_promoter > 0.3 and not pledged_increasing:
                signal = 'open_market_buying'
            elif trend_qoq_promoter < -0.3:
                signal = 'promoter_selling'

        return {
            'promoter_pct': _r2(promoter_pct),
            'trend_qoq': _r2(trend_qoq_promoter),
            'pledged_pct': _r2(_safe_float(pledged_pct)) if pledged_pct is not None else None,
            'signal': signal,
        }
    except Exception:
        return None
