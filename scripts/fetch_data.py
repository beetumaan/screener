"""Phase 4: Master orchestrator — fetches India, US, MF data and writes JSON files."""
import json
import sys
import math
import time
from pathlib import Path
from datetime import datetime, timezone
from sources.india import fetch_india_stock
from sources.us import fetch_us_stock
from sources.mf import fetch_mf


def clean(obj):
    """Recursively replace NaN/Inf with None so json.dumps produces valid JSON."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    return obj


def log(msg):
    print(msg, flush=True)


def run_market(label, universe, fetch_fn, args_fn, limit=None):
    data, errors = [], []
    items = universe[:limit] if limit else universe
    for i, item in enumerate(items):
        log(f"{label} {i+1}/{len(items)}: {item.get('name', item.get('scheme_code', ''))}")
        t0 = time.time()
        try:
            result = fetch_fn(*args_fn(item))
            data.append(result)
            log(f"  ✓ {time.time() - t0:.1f}s")
        except Exception as e:
            key = item.get('yf_symbol') or item.get('scheme_code', '?')
            errors.append({'ticker': key, 'error': str(e)})
            log(f"  ✗ {key}: {e}")
    return data, errors


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

    out = Path('../pwa/data')
    out.mkdir(parents=True, exist_ok=True)
    out.joinpath('india.json').write_text(json.dumps(clean(india_data), indent=2))
    out.joinpath('us.json').write_text(json.dumps(clean(us_data), indent=2))
    out.joinpath('mf.json').write_text(json.dumps(clean(mf_data), indent=2))
    out.joinpath('meta.json').write_text(json.dumps({
        'lastSync': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'counts': {'india': len(india_data), 'us': len(us_data), 'mf': len(mf_data)},
        'errors': {'india': india_errors, 'us': us_errors, 'mf': mf_errors},
    }, indent=2))

    log(f"\n✓ India: {len(india_data)} / {len(india_universe[:limit] if limit else india_universe)}"
        f"  ({len(india_errors)} errors)")
    log(f"✓ US:    {len(us_data)} / {len(us_universe[:limit] if limit else us_universe)}"
        f"  ({len(us_errors)} errors)")
    log(f"✓ MF:    {len(mf_data)} / {len(mf_universe[:limit] if limit else mf_universe)}"
        f"  ({len(mf_errors)} errors)")

    total_errors = len(india_errors) + len(us_errors) + len(mf_errors)
    if total_errors:
        log(f"\n⚠  {total_errors} total errors logged in meta.json")


if __name__ == '__main__':
    main()
