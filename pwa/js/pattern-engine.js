import { PATTERNS } from './patterns.js';

const TRUE       = 'true';
const FALSE      = 'false';
const INCOMPLETE = 'incomplete';

const METRIC_MAP = {
  india: {
    pe:            'maxPE',
    peg:           'maxPEG',
    revGrowth:     'minRevG',
    epsGrowth:     'minEPSG',
    promoterPct:   'minPromoter',
    pledgedShares: 'maxPledged',
  },
  us: {
    pe:            'maxPEUS',
    peg:           'maxPEGUS',
    revGrowth:     'minRevGUS',
    epsGrowth:     'minEPSGUS',
    pledgedShares: 'maxPledged',
    minMSPR:       'minMSPR',
    fcfPositive5Y: 'fcfPositive5Y',
  },
};

// Human-readable reasons for incomplete triggers
const FIELD_DESCRIPTIONS = {
  fcfPositive5Y:   'Free cash flow history not available',
  maxPledged:      'Pledged shares data not available',
  minMSPR:         'Insider sentiment (MSPR) data not available',
  pe_vs_avg_pct:   '5-year average P/E not computable (insufficient quarterly EPS history)',
  pb_vs_avg_pct:   '5-year average P/B not computable',
  ret_1w:          'Recent price history insufficient',
  ret_1m:          'Recent price history insufficient',
  ret_3m:          'Recent price history insufficient',
  ret_6m:          'Recent price history insufficient',
  ret_1y:          'One-year price history insufficient',
  institutional:   null,  // resolved at runtime based on market
  fii:             'FII holding trend not available',
  dii:             'DII holding trend not available',
  promoter:        'Promoter holding trend not available',
  earnings_surprises: 'Earnings surprise history not available for this market',
};

function fieldDescription(field, market) {
  if (field === 'institutional') {
    return market === 'us'
      ? 'US institutional trend from pctChange not available (insufficient holder data)'
      : 'Institutional holding trend not available';
  }
  return FIELD_DESCRIPTIONS[field] || `${field} unavailable`;
}

// ── Core compare — returns TRUE / FALSE / INCOMPLETE ─────────────────────

function compare(a, op, b) {
  if (a === null || a === undefined) return INCOMPLETE;
  switch (op) {
    case 'gte':    return a >= b ? TRUE : FALSE;
    case 'gt':     return a > b  ? TRUE : FALSE;
    case 'lte':    return a <= b ? TRUE : FALSE;
    case 'lt':     return a < b  ? TRUE : FALSE;
    case 'equals': return a === b ? TRUE : FALSE;
    case 'ne':     return a !== b ? TRUE : FALSE;
    default: throw new Error(`Unknown op: ${op}`);
  }
}

function result(state, missing = null) {
  return { state, missing };
}

// ── Trigger evaluator — returns { state, missing } ────────────────────────

function evaluateTrigger(trigger, stock) {
  try {
    switch (trigger.type) {

      case 'filter_pass_rate': {
        if (!stock.total || stock.total === 0) return result(INCOMPLETE, 'score');
        const rate = stock.passRate ?? (stock.score / stock.total);
        return result(compare(rate, trigger.op, trigger.value));
      }

      case 'metric': {
        const field = METRIC_MAP[stock.market]?.[trigger.field] ?? trigger.field;
        const value = stock.metrics?.[field];
        if (value === null || value === undefined) return result(INCOMPLETE, field);
        return result(compare(value, trigger.op, trigger.value));
      }

      case 'valuation_vs_history': {
        const ctx = stock.valuation_context;
        if (!ctx) return result(INCOMPLETE, 'valuation_context');
        const fieldName = trigger.metric === 'pe' ? 'pe_vs_avg_pct' : 'pb_vs_avg_pct';
        const value = ctx[fieldName];
        if (value === null || value === undefined) return result(INCOMPLETE, fieldName);
        return result(compare(value, trigger.op, trigger.value));
      }

      case 'institutional_trend': {
        const trend = stock.ownership?.trend_qoq;
        if (!trend) return result(INCOMPLETE, 'institutional');
        let value;
        if (stock.market === 'india') {
          const fii = trend.fii;
          const dii = trend.dii;
          if (fii === null && dii === null) return result(INCOMPLETE, 'fii');
          value = (fii ?? 0) + (dii ?? 0);
        } else {
          value = trend.institutional;
          if (value === null || value === undefined) return result(INCOMPLETE, 'institutional');
        }
        return result(compare(value, trigger.op, trigger.value));
      }

      case 'metric_delta': {
        const trend = stock.ownership?.trend_qoq;
        if (!trend) return result(INCOMPLETE, trigger.field);
        const value = trend[trigger.field];
        if (value === null || value === undefined) return result(INCOMPLETE, trigger.field);
        return result(compare(value, trigger.op, trigger.value));
      }

      case 'price_return': {
        const pa = stock.price_action;
        if (!pa) return result(INCOMPLETE, `ret_${trigger.window}`);
        const fieldMap = { '1w':'ret_1w','1m':'ret_1m','3m':'ret_3m','6m':'ret_6m','1y':'ret_1y' };
        const value = pa[fieldMap[trigger.window]];
        if (value === null || value === undefined) return result(INCOMPLETE, fieldMap[trigger.window]);
        return result(compare(value, trigger.op, trigger.value));
      }

      case 'earnings_beat_streak':
      case 'earnings_miss_streak': {
        const surprises = stock.earnings_surprises;
        if (!surprises) return result(INCOMPLETE, 'earnings_surprises');
        if (surprises.length < trigger.value) return result(INCOMPLETE, 'earnings_surprises');
        const target = trigger.type === 'earnings_beat_streak' ? 'beat' : 'miss';
        let streak = 0;
        for (const q of surprises) {
          if (q.verdict === target) streak++;
          else break;
        }
        return result(compare(streak, trigger.op, trigger.value));
      }

      case 'promoter_signal': {
        const sig = stock.promoter_activity?.signal;
        if (sig === null || sig === undefined) return result(INCOMPLETE, 'promoter');
        return result(compare(sig, trigger.op, trigger.value));
      }

      case 'retail_signal': {
        const sig = stock.retail_signal?.interpretation;
        if (sig === null || sig === undefined) return result(INCOMPLETE, 'retail_signal');
        return result(compare(sig, trigger.op, trigger.value));
      }

      case 'fcf_positive': {
        const v = stock.metrics?.fcfPositive5Y;
        if (v === null || v === undefined) return result(INCOMPLETE, 'fcfPositive5Y');
        return result(compare(v, trigger.op, trigger.value));
      }

      default:
        return result(FALSE);
    }
  } catch {
    return result(FALSE);
  }
}

// ── Verdict rendering ─────────────────────────────────────────────────────

function countEarningsStreak(stock, target) {
  const surprises = stock.earnings_surprises;
  if (!surprises) return 0;
  let count = 0;
  for (const q of surprises) {
    if (q.verdict === target) count++;
    else break;
  }
  return count;
}

function getInstitutionalTrendLabel(stock) {
  const trend = stock.ownership?.trend_qoq;
  if (!trend) return 'data unavailable';
  const value = stock.market === 'india'
    ? (trend.fii ?? 0) + (trend.dii ?? 0)
    : trend.institutional;
  if (value === null || value === undefined) return 'data unavailable';
  if (value > 1)  return 'positive';
  if (value < -1) return 'negative';
  return 'flat';
}

function renderVerdict(template, stock) {
  const m    = stock.market;
  const mspr = stock.metrics?.minMSPR;

  const replacements = {
    '{score}':                    stock.score,
    '{total}':                    stock.total,
    '{pe}':                       stock.metrics?.[m === 'us' ? 'maxPEUS' : 'maxPE']?.toFixed(1),
    '{revGrowth}':                stock.metrics?.[m === 'us' ? 'minRevGUS' : 'minRevG']?.toFixed(1),
    '{epsGrowth}':                stock.metrics?.[m === 'us' ? 'minEPSGUS' : 'minEPSG']?.toFixed(1),
    '{peg}':                      stock.metrics?.[m === 'us' ? 'maxPEGUS' : 'maxPEG']?.toFixed(2),
    '{pe_vs_avg_pct}':            Math.abs(stock.valuation_context?.pe_vs_avg_pct ?? 0).toFixed(0),
    '{ret_1m}':                   Math.abs(stock.price_action?.ret_1m ?? 0).toFixed(1),
    '{ret_3m}':                   Math.abs(stock.price_action?.ret_3m ?? 0).toFixed(1),
    '{ret_1y}':                   Math.abs(stock.price_action?.ret_1y ?? 0).toFixed(1),
    '{mspr}':                     mspr != null ? (mspr > 0 ? '+' + mspr.toFixed(1) : mspr.toFixed(1)) : '—',
    '{promoter_pct}':             stock.ownership?.current?.promoter?.toFixed(1),
    '{promoter_trend}':           stock.ownership?.trend_qoq?.promoter?.toFixed(1),
    '{fii_trend}':                Math.abs(stock.ownership?.trend_qoq?.fii ?? 0).toFixed(1),
    '{pledged_pct}':              stock.metrics?.maxPledged?.toFixed(1),
    '{beat_count}':               countEarningsStreak(stock, 'beat'),
    '{miss_count}':               countEarningsStreak(stock, 'miss'),
    '{institutional_trend_label}': getInstitutionalTrendLabel(stock),
  };

  let out = template;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.replaceAll(token, value ?? '—');
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * detectPatterns(stock, market)
 *
 * Returns { matched, incomplete } — NOT a flat array.
 *
 * matched:    patterns where ALL triggers evaluated to TRUE
 * incomplete: patterns where ≥1 trigger couldn't evaluate (missing data)
 *             each entry has { id, label, tier, priority, missing[], reason }
 *
 * Patterns where ≥1 trigger evaluated to FALSE (and none INCOMPLETE) are omitted.
 */
export function detectPatterns(stock, market) {
  const s = { ...stock, market };
  const matched    = [];
  const incomplete = [];

  for (const pattern of PATTERNS) {
    if (!pattern.markets.includes(market)) continue;

    const results = pattern.triggers.map(t => evaluateTrigger(t, s));
    const states  = results.map(r => r.state);

    if (states.every(st => st === TRUE)) {
      matched.push({
        id:       pattern.id,
        label:    pattern.label,
        tier:     pattern.tier,
        priority: pattern.priority,
        verdict:  renderVerdict(pattern.verdict, s),
      });
    } else if (states.some(st => st === INCOMPLETE)) {
      const missingFields = [...new Set(
        results.filter(r => r.state === INCOMPLETE).map(r => r.missing).filter(Boolean)
      )];
      incomplete.push({
        id:       pattern.id,
        label:    pattern.label,
        tier:     pattern.tier,
        priority: pattern.priority,
        missing:  missingFields,
        reason:   [...new Set(missingFields.map(f => fieldDescription(f, market)))].join('; '),
      });
    }
    // states has ≥1 FALSE and no INCOMPLETE → not matched, silently omit
  }

  return {
    matched:    matched.sort((a, b)    => b.priority - a.priority),
    incomplete: incomplete.sort((a, b) => b.priority - a.priority),
  };
}

export { evaluateTrigger, renderVerdict, compare, METRIC_MAP, TRUE, FALSE, INCOMPLETE };
