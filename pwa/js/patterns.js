export const PATTERNS = [

  // ── Bullish ──────────────────────────────────────────────────────────────

  {
    id: "quality_at_value_entry",
    label: "Quality at Value Entry",
    tier: "bullish",
    markets: ["india", "us"],
    priority: 9,
    triggers: [
      { type: "filter_pass_rate",       op: "gte",    value: 0.80 },
      { type: "valuation_vs_history",   metric: "pe", op: "lte", value: -10 },
      { type: "institutional_trend",    op: "gte",    value: 0 },
    ],
    verdict: "Strong filter pass ({score}/{total}) with P/E {pe_vs_avg_pct}% below 5Y average. Institutional flow {institutional_trend_label}. Classic quality-at-value setup.",
  },

  {
    id: "insider_confidence",
    label: "Insider Confidence",
    tier: "bullish",
    markets: ["us"],
    priority: 8,
    triggers: [
      { type: "metric",        field: "minMSPR", op: "gte", value: 30 },
      { type: "price_return",  window: "3m",     op: "lte", value: 0  },
    ],
    verdict: "Insiders buying heavily (MSPR {mspr}) despite 3-month price decline of {ret_3m}%. Strong contrarian signal.",
  },

  {
    id: "promoter_buying",
    label: "Promoter Buying",
    tier: "bullish",
    markets: ["india"],
    priority: 8,
    triggers: [
      { type: "promoter_signal", op: "equals", value: "open_market_buying" },
    ],
    verdict: "Promoter increasing stake via open market (now {promoter_pct}%, up {promoter_trend}pp QoQ). Strong skin-in-the-game signal.",
  },

  {
    id: "growth_at_reasonable_price",
    label: "Growth at Reasonable Price",
    tier: "bullish",
    markets: ["india", "us"],
    priority: 7,
    triggers: [
      { type: "metric",       field: "revGrowth", op: "gte", value: 15  },
      { type: "metric",       field: "epsGrowth", op: "gte", value: 15  },
      { type: "metric",       field: "peg",       op: "lte", value: 1.5 },
      { type: "fcf_positive", op: "equals",                  value: true },
    ],
    verdict: "Revenue growing {revGrowth}% and EPS {epsGrowth}% with PEG {peg}. Growth at fair price, backed by positive cash flow.",
  },

  {
    id: "earnings_momentum",
    label: "Earnings Momentum",
    tier: "bullish",
    markets: ["us"],
    priority: 6,
    triggers: [
      { type: "earnings_beat_streak", op: "gte", value: 3 },
    ],
    verdict: "{beat_count} consecutive earnings beats. Management consistently outperforming estimates.",
  },

  // ── Bearish ──────────────────────────────────────────────────────────────

  {
    id: "value_trap_risk",
    label: "Value Trap Risk",
    tier: "bearish",
    markets: ["india", "us"],
    priority: 9,
    triggers: [
      { type: "metric", field: "pe",        op: "lte", value: 12 },
      { type: "metric", field: "revGrowth", op: "lte", value: 5  },
      { type: "metric", field: "epsGrowth", op: "lte", value: 5  },
    ],
    verdict: "Low P/E ({pe}) reflects weak growth (revenue {revGrowth}%, EPS {epsGrowth}%), not opportunity. High risk of being a value trap.",
  },

  {
    id: "falling_knife",
    label: "Falling Knife",
    tier: "bearish",
    markets: ["india", "us"],
    priority: 8,
    triggers: [
      { type: "price_return",       window: "1m", op: "lte", value: -15 },
      { type: "institutional_trend",              op: "lt",  value: 0   },
    ],
    verdict: "Down {ret_1m}% in last month with institutional selling. Wait for stabilization — don't catch the falling knife.",
  },

  {
    id: "earnings_miss_streak",
    label: "Earnings Disappointment",
    tier: "bearish",
    markets: ["us"],
    priority: 8,
    triggers: [
      { type: "earnings_miss_streak", op: "gte", value: 3 },
    ],
    verdict: "{miss_count} consecutive earnings misses. Management consistently under-delivering.",
  },

  {
    id: "promoter_exit",
    label: "Promoter Exit",
    tier: "bearish",
    markets: ["india"],
    priority: 9,
    triggers: [
      { type: "promoter_signal", op: "equals", value: "promoter_selling" },
    ],
    verdict: "Promoter reducing stake ({promoter_trend}pp QoQ, now {promoter_pct}%). Founders/management losing conviction.",
  },

  // ── Warning ───────────────────────────────────────────────────────────────

  {
    id: "retail_pile_on",
    label: "Retail Pile-On",
    tier: "warning",
    markets: ["india"],
    priority: 7,
    triggers: [
      { type: "retail_signal",  op: "equals", value: "increasing" },
      { type: "metric_delta",   field: "fii", op: "lt", value: 0  },
    ],
    verdict: "Retail ownership rising while FII exiting ({fii_trend}pp QoQ). Historically a contrarian warning — smart money usually exits before retail piles in.",
  },

  {
    id: "pledge_risk",
    label: "Pledge Risk",
    tier: "warning",
    markets: ["india"],
    priority: 9,
    triggers: [
      { type: "metric", field: "pledgedShares", op: "gt", value: 25 },
    ],
    verdict: "{pledged_pct}% of promoter shares pledged. Stock decline can trigger forced selling cascade.",
  },

  {
    id: "stretched_valuation",
    label: "Stretched Valuation",
    tier: "warning",
    markets: ["india", "us"],
    priority: 6,
    triggers: [
      { type: "valuation_vs_history", metric: "pe", op: "gte", value: 50 },
      { type: "price_return",         window: "1y",             op: "gte", value: 50 },
    ],
    verdict: "P/E now {pe_vs_avg_pct}% above 5Y average after running {ret_1y}% in last year. Even quality has a price ceiling.",
  },

];
