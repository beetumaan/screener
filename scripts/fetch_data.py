"""Phase 4: Master orchestrator — fetches India, US, MF data and writes JSON files."""
import json
import sys
import math
import time
import concurrent.futures
from pathlib import Path
from datetime import datetime, timezone, date as date_cls
from sources.india import fetch_india_stock
from sources.us import fetch_us_stock, load_snapshots, save_snapshot, get_prior_snapshot
from sources.mf import fetch_mf


def clean(obj):
    """Recursively replace non-JSON-serializable values with None.
    Handles: NaN, Inf, complex numbers, numpy scalars.
    """
    if isinstance(obj, complex):
        return None
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    # numpy scalar types (int64, float32, etc.) aren't caught above
    try:
        import numpy as np
        if isinstance(obj, (np.integer, np.floating)):
            v = float(obj)
            return None if (math.isnan(v) or math.isinf(v)) else v
        if isinstance(obj, np.complexfloating):
            return None
    except ImportError:
        pass
    return obj


def log(msg):
    print(msg, flush=True)


PER_STOCK_TIMEOUT = 90  # seconds — kills hung yfinance/screener.in calls


def _fetch_with_timeout(fetch_fn, args, timeout=PER_STOCK_TIMEOUT):
    """Run fetch_fn(*args) in a thread; raise TimeoutError if it exceeds timeout."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(fetch_fn, *args)
        return future.result(timeout=timeout)


def run_market(label, universe, fetch_fn, args_fn, limit=None):
    data, errors = [], []
    items = universe[:limit] if limit else universe
    for i, item in enumerate(items):
        log(f"{label} {i+1}/{len(items)}: {item.get('name', item.get('scheme_code', ''))}")
        t0 = time.time()
        try:
            result = _fetch_with_timeout(fetch_fn, args_fn(item))
            data.append(result)
            log(f"  ✓ {time.time() - t0:.1f}s")
        except Exception as e:
            key = item.get('yf_symbol') or item.get('scheme_code', '?')
            errors.append({'ticker': key, 'error': str(e)})
            log(f"  ✗ {key}: {e}")
    return data, errors


def count_coverage(data, field):
    """Count how many stocks have a non-None value for the given top-level field."""
    return sum(1 for s in data if s.get(field) is not None)


def main():
    limit = None
    if '--limit' in sys.argv:
        idx = sys.argv.index('--limit')
        limit = int(sys.argv[idx + 1])
        log(f"[dry-run] limit={limit} per market")

    india_universe = json.loads(Path('universes/nifty500.json').read_text())
    us_universe    = json.loads(Path('universes/sp500_nasdaq100.json').read_text())
    mf_universe    = json.loads(Path('universes/mf_top300.json').read_text())

    india_data, india_errors = run_market(
        'India', india_universe, fetch_india_stock,
        lambda s: (s['yf_symbol'], s['screener_slug']), limit
    )
    us_data, us_errors = run_market(
        'US', us_universe, fetch_us_stock,
        lambda s: (s['yf_symbol'],), limit
    )
    mf_data, mf_errors = run_market(
        'MF', mf_universe, fetch_mf,
        lambda s: (s['scheme_code'],), limit
    )

    # -----------------------------------------------------------------------
    # V2: US ownership snapshot compare + trend enrichment
    # -----------------------------------------------------------------------
    try:
        today_str = date_cls.today().isoformat()
        snapshots_data = load_snapshots()
        prior_snap = get_prior_snapshot(snapshots_data, today_str)

        # Build today's US ownership map (ticker → {institutional, insider})
        today_tickers: dict = {}
        for s in us_data:
            own = s.get('ownership')
            if own and own.get('current'):
                today_tickers[s['ticker']] = {
                    'institutional': own['current'].get('institutional'),
                    'insider': own['current'].get('insider'),
                }

        # Enrich each US stock with trend_qoq
        for s in us_data:
            own = s.get('ownership')
            if not own:
                continue
            ticker = s['ticker']
            current = own.get('current') or {}
            trend_qoq = {
                'institutional': None,
                'insider': None,
                'promoter': None,
                'fii': None,
                'dii': None,
                'public': None,
            }
            trend_reason = None

            if prior_snap and ticker in prior_snap.get('tickers', {}):
                prior = prior_snap['tickers'][ticker]
                for field in ['institutional', 'insider']:
                    curr_val = current.get(field)
                    prior_val = prior.get(field)
                    if curr_val is not None and prior_val is not None:
                        try:
                            trend_qoq[field] = round(float(curr_val) - float(prior_val), 2)
                        except (TypeError, ValueError):
                            pass
            else:
                trend_reason = 'insufficient_history'

            own['trend_qoq'] = trend_qoq
            own['trend_reason'] = trend_reason

        # Persist today's snapshot
        save_snapshot(snapshots_data, today_str, today_tickers)
        Path('.cache').mkdir(exist_ok=True)
        Path('.cache/us_ownership_snapshots.json').write_text(
            json.dumps(snapshots_data, indent=2)
        )
        log(f"  [v2] US ownership snapshot saved ({len(today_tickers)} tickers)")
    except Exception as e:
        log(f"  [v2] US snapshot loop error (non-fatal): {e}")

    # -----------------------------------------------------------------------
    # V2: coverage stats
    # -----------------------------------------------------------------------
    coverage_v2 = {
        'ownership_current': {
            'india': count_coverage(india_data, 'ownership'),
            'us': count_coverage(us_data, 'ownership'),
        },
        'ownership_trend': {
            'india': sum(
                1 for s in india_data
                if s.get('ownership') and
                s['ownership'].get('trend_qoq', {}) and
                s['ownership']['trend_qoq'].get('promoter') is not None
            ),
            'us': sum(
                1 for s in us_data
                if s.get('ownership') and
                s['ownership'].get('trend_qoq', {}) and
                s['ownership']['trend_qoq'].get('institutional') is not None
            ),
        },
        'valuation_context': {
            'india': count_coverage(india_data, 'valuation_context'),
            'us': count_coverage(us_data, 'valuation_context'),
        },
        'price_action': {
            'india': count_coverage(india_data, 'price_action'),
            'us': count_coverage(us_data, 'price_action'),
        },
        'earnings_surprises': {
            'us': count_coverage(us_data, 'earnings_surprises'),
        },
        'retail_signal': {
            'india': count_coverage(india_data, 'retail_signal'),
        },
        'promoter_activity': {
            'india': count_coverage(india_data, 'promoter_activity'),
        },
    }

    out = Path('../pwa/data')
    out.mkdir(parents=True, exist_ok=True)
    out.joinpath('india.json').write_text(json.dumps(clean(india_data), indent=2))
    out.joinpath('us.json').write_text(json.dumps(clean(us_data), indent=2))
    out.joinpath('mf.json').write_text(json.dumps(clean(mf_data), indent=2))
    out.joinpath('meta.json').write_text(json.dumps({
        'lastSync': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'counts': {'india': len(india_data), 'us': len(us_data), 'mf': len(mf_data)},
        'coverage_v2': coverage_v2,
        'errors': {'india': india_errors, 'us': us_errors, 'mf': mf_errors},
    }, indent=2))

    log(f"\n✓ India: {len(india_data)} / {len(india_universe[:limit] if limit else india_universe)}"
        f"  ({len(india_errors)} errors)")
    log(f"✓ US:    {len(us_data)} / {len(us_universe[:limit] if limit else us_universe)}"
        f"  ({len(us_errors)} errors)")
    log(f"✓ MF:    {len(mf_data)} / {len(mf_universe[:limit] if limit else mf_universe)}"
        f"  ({len(mf_errors)} errors)")
    log(f"✓ V2 coverage: {json.dumps(coverage_v2)}")

    total_errors = len(india_errors) + len(us_errors) + len(mf_errors)
    if total_errors:
        log(f"\n  {total_errors} total errors logged in meta.json")


if __name__ == '__main__':
    main()
