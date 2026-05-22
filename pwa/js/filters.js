export const FILTERS = {
  india: {
    name: 'India equities',
    universe: 170,
    groups: [
      { name: 'Market cap', filters: [
        { id: 'minMcap', label: 'Min market cap', sub: '₹ Cr', value: 500, op: 'gte', tip: { what: 'Minimum company size by market value.', why: 'Tiny companies are illiquid and prone to manipulation.', signal: 'Good: > ₹500 Cr.' } },
        { id: 'maxMcap', label: 'Max market cap', sub: '₹ Cr', value: 50000, op: 'lte', tip: { what: 'Excludes mega-caps above this size.', why: 'Mega-caps grow slowly; mid/small-caps can multiply.', signal: 'Good: < ₹50,000 Cr.' } },
      ]},
      { name: 'Profitability', filters: [
        { id: 'minROE', label: 'Min ROE', sub: '%', value: 15, op: 'gte', tip: { what: 'Net Profit / Shareholder Equity.', why: 'Buffett favorite. Sustained high ROE = competitive moat.', signal: 'Good: > 15%. Excellent: > 20%.' } },
        { id: 'onlyProfitable', label: 'Only profitable', sub: 'EPS > 0', value: 1, op: 'flag', tip: { what: 'Excludes loss-making companies.', why: 'Loss-makers depend on capital raises.', signal: 'Keep ON for quality investing.' } },
      ]},
      { name: 'Balance sheet', filters: [
        { id: 'maxDE', label: 'Max debt/equity', sub: 'ratio', value: 1.0, op: 'lte', tip: { what: 'Total debt / shareholder equity.', why: 'High debt = fragile in downturns.', signal: 'Good: < 0.5. Acceptable: < 1.0.' } },
        { id: 'minCR', label: 'Min current ratio', sub: 'ratio', value: 1.0, op: 'gte', tip: { what: 'Short-term assets / liabilities.', why: 'Below 1 = liquidity crunch possible.', signal: 'Good: > 1.5.' } },
        { id: 'minICR', label: 'Min interest coverage', sub: 'x', value: 5, op: 'gte', tip: { what: 'Operating profit / interest.', why: 'Below 2x = one bad quarter from default.', signal: 'Good: > 5x.' } },
      ]},
      { name: 'Growth', filters: [
        { id: 'minRevG', label: 'Min revenue growth YoY', sub: '%', value: 15, op: 'gte', tip: { what: 'YoY revenue growth.', why: 'Declining revenue is a melting ice cube.', signal: 'Good: > 15%.' } },
        { id: 'minEPSG', label: 'Min earnings growth YoY', sub: '%', value: 15, op: 'gte', tip: { what: 'YoY EPS growth.', why: 'Profits grow share price long-term.', signal: 'Good: > 15%.' } },
        { id: 'minQEPSG', label: 'Min QoQ EPS growth', sub: '%', value: 10, op: 'gte', tip: { what: 'Quarter-over-quarter EPS change.', why: 'Catches recovery stocks.', signal: 'Good: > 10%.' } },
        { id: 'min5YSales', label: 'Min 5Y sales CAGR', sub: '%', value: 12, op: 'gte', tip: { what: '5Y compounded revenue growth.', why: 'Long-term track record.', signal: 'Good: > 12%.' } },
        { id: 'min5YProfit', label: 'Min 5Y profit CAGR', sub: '%', value: 12, op: 'gte', tip: { what: '5Y compounded profit growth.', why: 'Profit > sales CAGR = improving margins.', signal: 'Good: > 12%.' } },
      ]},
      { name: 'Valuation', filters: [
        { id: 'maxPE', label: 'Max P/E', sub: 'ratio', value: 30, op: 'lte', tip: { what: 'Price / Earnings.', why: 'Lower = cheaper. Watch for value traps.', signal: 'Good for India: < 30.' } },
        { id: 'maxPEG', label: 'Max PEG', sub: 'ratio', value: 1.5, op: 'lte', tip: { what: 'PE / growth rate.', why: 'Adjusts valuation for growth.', signal: 'Good: < 1.5.' } },
      ]},
      { name: 'Risk & price', filters: [
        { id: 'maxBeta', label: 'Max beta', sub: 'vs Nifty', value: 1.2, op: 'lte', tip: { what: 'Volatility vs Nifty.', why: 'Match to your stomach.', signal: 'Defensive: < 1.0.' } },
        { id: 'maxPrice', label: 'Max price', sub: '₹', value: 5000, op: 'lte', tip: { what: 'Max share price.', why: 'Practical for fixed capital.', signal: 'Set based on your capital.' } },
        { id: 'minDip', label: 'Min dip from 52W high', sub: '%', value: 20, op: 'gte', tip: { what: 'Distance from 52-week peak.', why: 'Quality + dip = bargain.', signal: 'Good: > 20% off.' } },
      ]},
      { name: 'Ownership', filters: [
        { id: 'minPromoter', label: 'Min promoter holding', sub: '%', value: 40, op: 'gte', tip: { what: '% held by founders/parent.', why: 'High = skin in the game.', signal: 'Good: > 40%.' } },
        { id: 'maxPledged', label: 'Max pledged shares', sub: '%', value: 5, op: 'lte', tip: { what: 'Promoter shares pledged as collateral.', why: 'Falling stock → forced selling cascade.', signal: 'Good: 0%. Danger: > 25%.' } },
      ]},
      { name: 'Sector', filters: [
        { id: 'excludePSU', label: 'Exclude PSU', sub: 'public sector', value: 1, op: 'flag', tip: { what: 'Excludes govt-owned companies.', why: 'Politically driven capital allocation.', signal: 'ON for shareholder alignment.' } },
        { id: 'excludeBanks', label: 'Exclude banks/NBFCs', sub: '', value: 1, op: 'flag', tip: { what: 'Excludes lenders.', why: 'Banks use different metrics.', signal: 'ON unless you understand banking.' } },
        { id: 'excludeRealty', label: 'Exclude real estate', sub: '', value: 1, op: 'flag', tip: { what: 'Excludes RE developers.', why: 'Cyclical, opaque accounting.', signal: 'ON unless specific thesis.' } },
      ]},
    ]
  },
  us: {
    name: 'US equities',
    universe: 500,
    groups: [
      { name: 'Market cap', filters: [
        { id: 'minMcapUS', label: 'Min market cap', sub: '$B', value: 2, op: 'gte', tip: { what: 'Minimum company size in billions.', why: 'US micro-caps are pump-and-dump territory.', signal: 'Good: > $2B.' } },
        { id: 'maxMcapUS', label: 'Max market cap', sub: '$B (0 = off)', value: 0, op: 'lte', tip: { what: 'Optional mega-cap ceiling.', why: 'Mega-caps grow slowly.', signal: 'Set 0 to disable.' } },
      ]},
      { name: 'Profitability', filters: [
        { id: 'positiveEPS', label: 'Positive EPS', sub: 'mandatory', value: 1, op: 'flag', tip: { what: 'Company must have positive earnings.', why: 'Many US tech stocks lose money.', signal: 'Always ON.' } },
        { id: 'minROEUS', label: 'Min ROE', sub: '%', value: 15, op: 'gte', tip: { what: 'Capital efficiency.', why: 'Wide-moat businesses sustain >20%.', signal: 'Good: > 15%.' } },
        { id: 'minROIC', label: 'Min ROIC', sub: '%', value: 12, op: 'gte', tip: { what: 'Return on Invested Capital.', why: 'Better than ROE, ignores leverage.', signal: 'Good: > 12%.' } },
        { id: 'minOpMargin', label: 'Min operating margin', sub: '%', value: 15, op: 'gte', tip: { what: 'Operating profit / revenue.', why: 'Below 15% = thin margins, weak pricing power.', signal: 'Good: > 15%. Software: 30-40%.' } },
      ]},
      { name: 'Balance sheet', filters: [
        { id: 'maxDEUS', label: 'Max debt/equity', sub: 'ratio', value: 1.0, op: 'lte', tip: { what: 'Total debt / equity.', why: 'High debt amplifies downside.', signal: 'Good: < 1.0.' } },
        { id: 'minCRUS', label: 'Min current ratio', sub: 'ratio', value: 1.5, op: 'gte', tip: { what: 'Short-term liquidity.', why: 'US has stricter benchmarks.', signal: 'Good: > 1.5.' } },
        { id: 'minICRUS', label: 'Min interest coverage', sub: 'x', value: 5, op: 'gte', tip: { what: 'EBIT / interest.', why: 'Margin of safety on debt.', signal: 'Good: > 5x.' } },
      ]},
      { name: 'Growth', filters: [
        { id: 'minRevGUS', label: 'Min revenue growth YoY', sub: '%', value: 10, op: 'gte', tip: { what: 'YoY revenue growth.', why: 'US matures faster than India.', signal: 'Good: > 10%.' } },
        { id: 'minEPSGUS', label: 'Min EPS growth YoY', sub: '%', value: 10, op: 'gte', tip: { what: 'YoY EPS growth.', why: 'Tracks profit scaling.', signal: 'Good: > 10%.' } },
        { id: 'min5YSalesUS', label: 'Min 5Y sales CAGR', sub: '%', value: 10, op: 'gte', tip: { what: 'Long-term revenue compounding.', why: 'Smooths individual quarters.', signal: 'Good: > 10%.' } },
        { id: 'min5YProfitUS', label: 'Min 5Y profit CAGR', sub: '%', value: 10, op: 'gte', tip: { what: 'Long-term profit compounding.', why: 'Profit < sales CAGR = margin erosion.', signal: 'Good: > 10%.' } },
      ]},
      { name: 'Cash flow', filters: [
        { id: 'minFCFY', label: 'Min FCF yield', sub: '%', value: 4, op: 'gte', tip: { what: 'Free cash flow / market cap.', why: 'Harder to fake than earnings.', signal: 'Good: > 4%.' } },
        { id: 'fcfPositive5Y', label: 'FCF positive 5 years', sub: '', value: 1, op: 'flag', tip: { what: 'FCF positive every year for 5 years.', why: 'Filters out cash-burning SaaS.', signal: 'Always ON.' } },
      ]},
      { name: 'Valuation', filters: [
        { id: 'maxPEUS', label: 'Max P/E', sub: 'ratio', value: 35, op: 'lte', tip: { what: 'Price / Earnings.', why: 'US tolerates higher PE than India.', signal: 'Reasonable: < 35.' } },
        { id: 'maxPEGUS', label: 'Max PEG', sub: 'ratio', value: 1.5, op: 'lte', tip: { what: 'PE adjusted for growth.', why: 'Normalizes across growth rates.', signal: 'Good: < 1.5.' } },
      ]},
      { name: 'Risk', filters: [
        { id: 'maxBetaUS', label: 'Max beta', sub: 'vs S&P', value: 1.3, op: 'lte', tip: { what: 'Volatility vs S&P 500.', why: 'Higher beta = bigger swings.', signal: 'Balanced: 1.0–1.3.' } },
        { id: 'minGM', label: 'Min gross margin', sub: '%', value: 40, op: 'gte', tip: { what: 'Gross profit / revenue.', why: 'Software 70%+. Below 30% = commodity.', signal: 'Good: > 40%.' } },
      ]},
      { name: 'Shareholder', filters: [
        { id: 'sharesFlat', label: 'Shares flat or decreasing', sub: '', value: 1, op: 'flag', tip: { what: 'Share count not growing.', why: 'Issuance = dilution.', signal: 'Best: declining 1-3%/yr.' } },
        { id: 'maxSBC', label: 'Max stock-based comp', sub: '% of rev', value: 10, op: 'lte', tip: { what: 'Employee stock grants as % of revenue.', why: 'Hides salary, dilutes shareholders.', signal: 'Good: < 5%.' } },
        { id: 'minInstOwn', label: 'Min institutional ownership', sub: '%', value: 60, op: 'gte', tip: { what: '% held by funds, pensions.', why: 'High = vetted by pros.', signal: 'Good: > 60%.' } },
        { id: 'maxShort', label: 'Max short interest', sub: '% float', value: 10, op: 'lte', tip: { what: '% shorted by hedge funds.', why: 'High = smart money skeptical.', signal: 'Good: < 5%.' } },
      ]},
      { name: 'Sentiment', filters: [
        { id: 'analystBuy', label: 'Analyst consensus Buy+', sub: '', value: 1, op: 'flag', tip: { what: 'Wall Street consensus rating.', why: 'Useful sanity check.', signal: 'Use as gut-check, not gospel.' } },
        { id: 'minMSPR', label: 'Min insider sentiment (MSPR)', sub: 'score', value: 0, op: 'gte', tip: { what: 'Monthly Share Purchase Ratio: -100 (insiders selling heavily) to +100 (insiders buying heavily). Sourced from Finnhub via SEC filings.', why: 'Company executives know more than analysts. Sustained insider buying = strong bullish signal. Heavy selling = caution.', signal: 'Strong buy signal: > +50. Mild bullish: 0 to +50. Bearish: < -20. Note: Some execs (Cook, Zuckerberg) sell regularly per pre-set 10b5-1 plans — context matters.' } },
        { id: 'excludeChina', label: 'Exclude China ADRs', sub: '', value: 1, op: 'flag', tip: { what: 'Excludes Chinese US-listed companies.', why: 'Delisting risk, audit issues.', signal: 'Always ON.' } },
      ]},
    ]
  },
  mf: {
    name: 'Indian mutual funds',
    universe: 280,
    groups: [
      { name: 'Cost', filters: [
        { id: 'maxER', label: 'Max expense ratio (Direct)', sub: '%', value: 1.0, op: 'lte', tip: { what: 'Annual fee charged by the fund.', why: 'Compounds to huge difference over 20 years.', signal: 'Good: < 1.0%.' } },
        { id: 'zeroExitAfter1Y', label: 'Zero exit load after 1Y', sub: '', value: 1, op: 'flag', tip: { what: 'No charge to exit after 1 year.', why: 'PPFAS charges 1% up to 2Y.', signal: 'ON to filter long lock-ins.' } },
      ]},
      { name: 'Returns', filters: [
        { id: 'min1Y', label: 'Min 1Y return', sub: '%', value: 12, op: 'gte', tip: { what: 'Trailing 1-year return.', why: 'Recent momentum check.', signal: 'Good: > 12%.' } },
        { id: 'min3Y', label: 'Min 3Y CAGR', sub: '%', value: 15, op: 'gte', tip: { what: '3-year compounded return.', why: 'Best balance of recency and signal.', signal: 'Good: > 15%.' } },
        { id: 'min5Y', label: 'Min 5Y CAGR', sub: '%', value: 15, op: 'gte', tip: { what: '5-year compounded return.', why: 'Smooths one full cycle.', signal: 'Good: > 15%.' } },
      ]},
      { name: 'Risk-adjusted', filters: [
        { id: 'minSharpe', label: 'Min Sharpe ratio', sub: '3Y', value: 0.8, op: 'gte', tip: { what: 'Return per unit of risk.', why: 'High return with huge swings may be worse.', signal: 'Good: > 0.8.' } },
        { id: 'minAlpha', label: 'Min alpha', sub: '3Y', value: 1.0, op: 'gte', tip: { what: 'Excess return vs benchmark.', why: 'Justifies active fees.', signal: 'Good: > 1.' } },
        { id: 'maxStdDev', label: 'Max standard deviation', sub: '3Y', value: 18, op: 'lte', tip: { what: 'Volatility of returns.', why: 'High = roller coaster.', signal: 'Conservative: < 15.' } },
        { id: 'maxBetaMF', label: 'Max beta', sub: '3Y', value: 1.1, op: 'lte', tip: { what: 'Sensitivity to benchmark.', why: 'Lower beta = downside protection.', signal: 'Conservative: < 1.' } },
      ]},
      { name: 'Fund quality', filters: [
        { id: 'minAUM', label: 'Min AUM', sub: '₹ Cr', value: 500, op: 'gte', tip: { what: 'Total assets under management.', why: 'Below ₹500 Cr = high impact cost.', signal: 'Good: > ₹500 Cr.' } },
        { id: 'maxAUM', label: 'Max AUM', sub: '₹ Cr (size drag)', value: 50000, op: 'lte', tip: { what: 'Cap on fund size.', why: 'Too large = drift to index.', signal: 'Small cap: < ₹15,000 Cr.' } },
        { id: 'minFundAge', label: 'Min fund age', sub: 'years', value: 5, op: 'gte', tip: { what: 'How long fund has been running.', why: 'New funds lack track record.', signal: 'Good: > 5 years.' } },
        { id: 'minMgrTenure', label: 'Min manager tenure', sub: 'years', value: 3, op: 'gte', tip: { what: 'Current manager tenure.', why: 'Track record belongs to manager.', signal: 'Good: > 3 years.' } },
      ]},
      { name: 'Portfolio', filters: [
        { id: 'maxTop10', label: 'Max top-10 concentration', sub: '%', value: 50, op: 'lte', tip: { what: 'Share of portfolio in top 10 holdings.', why: 'High = concentrated. Low = closet index.', signal: 'Balanced: 35-50%.' } },
        { id: 'maxTurnover', label: 'Max portfolio turnover', sub: '%', value: 100, op: 'lte', tip: { what: 'How often manager replaces holdings.', why: 'High = tax + transaction costs.', signal: 'Good: < 100%.' } },
        { id: 'directPlan', label: 'Direct plan only', sub: 'cheaper', value: 1, op: 'flag', tip: { what: 'Filter to Direct plans only.', why: 'Direct = no distributor commission.', signal: 'ALWAYS ON.' } },
      ]},
    ]
  }
};

export const SAMPLE_DATA = {
  india: [
    { ticker: 'COFORGE', name: 'Coforge Ltd', livePrice: 1084.50, metrics: { minMcap: 24500, maxMcap: 24500, minROE: 22, onlyProfitable: true, maxDE: 0.4, minCR: 1.8, minICR: 12, minRevG: 24, minEPSG: 18, minQEPSG: 15, min5YSales: 22, min5YProfit: 20, maxPE: 28, maxPEG: 1.3, maxBeta: 1.1, maxPrice: 1084, minDip: 18, minPromoter: 38, maxPledged: 0, excludePSU: true, excludeBanks: true, excludeRealty: true } },
    { ticker: 'GULFOILLUB', name: 'Gulf Oil Lubricants', livePrice: 890.20, metrics: { minMcap: 4200, maxMcap: 4200, minROE: 24, onlyProfitable: true, maxDE: 0.1, minCR: 2.1, minICR: 25, minRevG: 18, minEPSG: 22, minQEPSG: 12, min5YSales: 16, min5YProfit: 14, maxPE: 18, maxPEG: 0.9, maxBeta: 0.9, maxPrice: 890, minDip: 24, minPromoter: 72, maxPledged: 8, excludePSU: true, excludeBanks: true, excludeRealty: true } },
    { ticker: 'ZYDUSLIFE', name: 'Zydus Lifesciences', livePrice: 900.45, metrics: { minMcap: 88000, maxMcap: 88000, minROE: 19, onlyProfitable: true, maxDE: 0.2, minCR: 1.6, minICR: 18, minRevG: 16, minEPSG: 20, minQEPSG: 14, min5YSales: 11, min5YProfit: 9, maxPE: 24, maxPEG: 1.2, maxBeta: 0.7, maxPrice: 900, minDip: 22, minPromoter: 75, maxPledged: 6, excludePSU: true, excludeBanks: true, excludeRealty: true } },
    { ticker: 'NH', name: 'Narayana Hrudayalaya', livePrice: 1380.00, metrics: { minMcap: 28000, maxMcap: 28000, minROE: 28, onlyProfitable: true, maxDE: 0.6, minCR: 1.4, minICR: 9, minRevG: 18, minEPSG: 16, minQEPSG: 11, min5YSales: 18, min5YProfit: 32, maxPE: 38, maxPEG: 1.4, maxBeta: 1.3, maxPrice: 1380, minDip: 8, minPromoter: 63, maxPledged: 0, excludePSU: true, excludeBanks: true, excludeRealty: true } },
    { ticker: 'PERSISTENT', name: 'Persistent Systems', livePrice: 4868.20, metrics: { minMcap: 87000, maxMcap: 87000, minROE: 24, onlyProfitable: true, maxDE: 0.1, minCR: 2.0, minICR: 30, minRevG: 21, minEPSG: 19, minQEPSG: 13, min5YSales: 19, min5YProfit: 25, maxPE: 42, maxPEG: 1.6, maxBeta: 1.45, maxPrice: 4868, minDip: 12, minPromoter: 31, maxPledged: 0, excludePSU: true, excludeBanks: true, excludeRealty: true } },
    { ticker: 'KPITTECH', name: 'KPIT Technologies', livePrice: 1400.30, metrics: { minMcap: 36000, maxMcap: 36000, minROE: 21, onlyProfitable: true, maxDE: 0.2, minCR: 1.7, minICR: 14, minRevG: 8, minEPSG: 6, minQEPSG: -2, min5YSales: 24, min5YProfit: 28, maxPE: 52, maxPEG: 1.9, maxBeta: 1.5, maxPrice: 1400, minDip: 32, minPromoter: 39, maxPledged: 0, excludePSU: true, excludeBanks: true, excludeRealty: true } },
    { ticker: 'NETWEB', name: 'Netweb Technologies', livePrice: 2500.10, metrics: { minMcap: 12000, maxMcap: 12000, minROE: 18, onlyProfitable: true, maxDE: 0.3, minCR: 1.9, minICR: 22, minRevG: 32, minEPSG: 28, minQEPSG: 18, min5YSales: 28, min5YProfit: 30, maxPE: 98, maxPEG: 2.4, maxBeta: 1.8, maxPrice: 2500, minDip: 15, minPromoter: 68, maxPledged: 12, excludePSU: true, excludeBanks: true, excludeRealty: true } },
  ],
  us: [
    { ticker: 'GOOGL', name: 'Alphabet Inc.', livePrice: 178.45, metrics: { minMcapUS: 2100, maxMcapUS: 2100, positiveEPS: true, minROEUS: 32, minROIC: 28, minOpMargin: 32, maxDEUS: 0.1, minCRUS: 1.9, minICRUS: 50, minRevGUS: 14, minEPSGUS: 28, min5YSalesUS: 16, min5YProfitUS: 22, minFCFY: 3.8, fcfPositive5Y: true, maxPEUS: 24, maxPEGUS: 1.1, maxBetaUS: 1.0, minGM: 58, sharesFlat: true, maxSBC: 7, minInstOwn: 70, maxShort: 1, analystBuy: true, minMSPR: 8, excludeChina: true }, news: [
      { headline: 'Google Cloud revenue surges 35% on Gemini AI demand', source: 'Reuters', date: '2d ago', sentiment: 'positive' },
      { headline: 'DOJ antitrust case enters remedy phase, structural breakup possible', source: 'WSJ', date: '4d ago', sentiment: 'negative' },
      { headline: 'YouTube ad revenue beats estimates as Shorts monetization improves', source: 'CNBC', date: '6d ago', sentiment: 'positive' },
      { headline: 'Apple-Google AI search deal extends through 2027', source: 'Bloomberg', date: '1w ago', sentiment: 'positive' },
    ]},
    { ticker: 'MSFT', name: 'Microsoft Corp.', livePrice: 432.10, metrics: { minMcapUS: 3200, maxMcapUS: 3200, positiveEPS: true, minROEUS: 32, minROIC: 25, minOpMargin: 44, maxDEUS: 0.3, minCRUS: 1.8, minICRUS: 40, minRevGUS: 15, minEPSGUS: 17, min5YSalesUS: 14, min5YProfitUS: 14, minFCFY: 2.5, fcfPositive5Y: true, maxPEUS: 33, maxPEGUS: 1.4, maxBetaUS: 0.9, minGM: 70, sharesFlat: true, maxSBC: 4, minInstOwn: 72, maxShort: 1, analystBuy: true, minMSPR: 5, excludeChina: true }, news: [
      { headline: 'Azure growth accelerates to 32% as AI workloads scale', source: 'Reuters', date: '1d ago', sentiment: 'positive' },
      { headline: 'Microsoft Copilot adoption hits 70% of Fortune 500', source: 'Bloomberg', date: '3d ago', sentiment: 'positive' },
      { headline: 'EU regulator opens probe into Teams bundling practices', source: 'FT', date: '5d ago', sentiment: 'negative' },
      { headline: 'CFO Hood signals continued capex acceleration on AI infrastructure', source: 'CNBC', date: '1w ago', sentiment: 'neutral' },
    ]},
    { ticker: 'META', name: 'Meta Platforms', livePrice: 562.30, metrics: { minMcapUS: 1500, maxMcapUS: 1500, positiveEPS: true, minROEUS: 36, minROIC: 30, minOpMargin: 42, maxDEUS: 0.3, minCRUS: 2.4, minICRUS: 35, minRevGUS: 18, minEPSGUS: 47, min5YSalesUS: 14, min5YProfitUS: 20, minFCFY: 4.5, fcfPositive5Y: true, maxPEUS: 26, maxPEGUS: 1.0, maxBetaUS: 1.3, minGM: 82, sharesFlat: true, maxSBC: 9, minInstOwn: 75, maxShort: 1, analystBuy: true, minMSPR: -10, excludeChina: true }, news: [
      { headline: 'Meta Q1 ad revenue up 21%, beats expectations', source: 'WSJ', date: '2d ago', sentiment: 'positive' },
      { headline: 'Reality Labs losses widen to $4.5B as Quest 4 launch nears', source: 'Bloomberg', date: '4d ago', sentiment: 'negative' },
      { headline: 'Llama 4 open-source release sets new benchmark scores', source: 'TechCrunch', date: '1w ago', sentiment: 'positive' },
      { headline: 'Zuckerberg sells $200M in shares per 10b5-1 plan', source: 'Reuters', date: '2w ago', sentiment: 'negative' },
    ]},
    { ticker: 'NVDA', name: 'NVIDIA Corp.', livePrice: 138.90, metrics: { minMcapUS: 3400, maxMcapUS: 3400, positiveEPS: true, minROEUS: 114, minROIC: 117, minOpMargin: 62, maxDEUS: 0.06, minCRUS: 3.4, minICRUS: 100, minRevGUS: 65, minEPSGUS: 80, min5YSalesUS: 65, min5YProfitUS: 80, minFCFY: 2.3, fcfPositive5Y: true, maxPEUS: 34, maxPEGUS: 0.52, maxBetaUS: 1.7, minGM: 75, sharesFlat: true, maxSBC: 3, minInstOwn: 68, maxShort: 1, analystBuy: true, minMSPR: 15, excludeChina: true }, news: [
      { headline: 'NVIDIA Blackwell B200 sold out through end of 2026', source: 'Reuters', date: '1d ago', sentiment: 'positive' },
      { headline: 'Q4 data center revenue up 80% YoY to $35.6B', source: 'CNBC', date: '3d ago', sentiment: 'positive' },
      { headline: 'China export restrictions tighten, $5B revenue at risk', source: 'WSJ', date: '5d ago', sentiment: 'negative' },
      { headline: 'CEO Huang: "AI agents will be the next trillion-dollar opportunity"', source: 'Bloomberg', date: '1w ago', sentiment: 'positive' },
    ]},
    { ticker: 'V', name: 'Visa Inc.', livePrice: 290.50, metrics: { minMcapUS: 580, maxMcapUS: 580, positiveEPS: true, minROEUS: 50, minROIC: 30, minOpMargin: 62, maxDEUS: 0.5, minCRUS: 1.5, minICRUS: 60, minRevGUS: 11, minEPSGUS: 17, min5YSalesUS: 11, min5YProfitUS: 13, minFCFY: 4.2, fcfPositive5Y: true, maxPEUS: 31, maxPEGUS: 1.4, maxBetaUS: 0.9, minGM: 80, sharesFlat: true, maxSBC: 4, minInstOwn: 95, maxShort: 1, analystBuy: true, minMSPR: 2, excludeChina: true }, news: [
      { headline: 'Visa cross-border volume up 13% as travel rebounds', source: 'Reuters', date: '2d ago', sentiment: 'positive' },
      { headline: 'Stablecoin payment rails: threat or opportunity for Visa?', source: 'FT', date: '5d ago', sentiment: 'neutral' },
      { headline: 'Visa announces $25B buyback authorization', source: 'CNBC', date: '1w ago', sentiment: 'positive' },
    ]},
    { ticker: 'AAPL', name: 'Apple Inc.', livePrice: 228.40, metrics: { minMcapUS: 3500, maxMcapUS: 3500, positiveEPS: true, minROEUS: 152, minROIC: 60, minOpMargin: 31, maxDEUS: 1.0, minCRUS: 0.9, minICRUS: 25, minRevGUS: 13, minEPSGUS: 29, min5YSalesUS: 8, min5YProfitUS: 9, minFCFY: 3.5, fcfPositive5Y: true, maxPEUS: 30, maxPEGUS: 1.6, maxBetaUS: 1.2, minGM: 47, sharesFlat: true, maxSBC: 3, minInstOwn: 63, maxShort: 1, analystBuy: true, minMSPR: -20, excludeChina: true }, news: [
      { headline: 'iPhone 17 launch beats estimates, services revenue at record', source: 'Bloomberg', date: '2d ago', sentiment: 'positive' },
      { headline: 'China revenue declines 8% as Huawei competition intensifies', source: 'WSJ', date: '4d ago', sentiment: 'negative' },
      { headline: 'Tim Cook sells $35M in shares per quarterly 10b5-1 plan', source: 'Reuters', date: '6d ago', sentiment: 'neutral' },
      { headline: 'Apple Intelligence rollout delayed in EU pending DSA review', source: 'FT', date: '1w ago', sentiment: 'negative' },
    ]},
    { ticker: 'AMZN', name: 'Amazon.com', livePrice: 195.10, metrics: { minMcapUS: 2000, maxMcapUS: 2000, positiveEPS: true, minROEUS: 24, minROIC: 14, minOpMargin: 11, maxDEUS: 0.3, minCRUS: 1.1, minICRUS: 18, minRevGUS: 11, minEPSGUS: 20, min5YSalesUS: 12, min5YProfitUS: 28, minFCFY: 2.5, fcfPositive5Y: true, maxPEUS: 35, maxPEGUS: 1.3, maxBetaUS: 1.2, minGM: 48, sharesFlat: false, maxSBC: 5, minInstOwn: 65, maxShort: 1, analystBuy: true, minMSPR: -5, excludeChina: true }, news: [
      { headline: 'AWS growth re-accelerates to 19% on AI workload migration', source: 'Reuters', date: '1d ago', sentiment: 'positive' },
      { headline: 'Amazon retail operating margin hits new high of 8%', source: 'CNBC', date: '3d ago', sentiment: 'positive' },
      { headline: 'FTC antitrust trial begins, breakup remedy on the table', source: 'WSJ', date: '5d ago', sentiment: 'negative' },
      { headline: 'Anthropic partnership deepens with $4B additional investment', source: 'Bloomberg', date: '1w ago', sentiment: 'positive' },
    ]},
    { ticker: 'MA', name: 'Mastercard Inc.', livePrice: 554.20, metrics: { minMcapUS: 510, maxMcapUS: 510, positiveEPS: true, minROEUS: 210, minROIC: 95, minOpMargin: 56, maxDEUS: 2.6, minCRUS: 1.0, minICRUS: 35, minRevGUS: 16, minEPSGUS: 24, min5YSalesUS: 14, min5YProfitUS: 16, minFCFY: 3.5, fcfPositive5Y: true, maxPEUS: 31, maxPEGUS: 1.6, maxBetaUS: 1.1, minGM: 76, sharesFlat: true, maxSBC: 3, minInstOwn: 90, maxShort: 1, analystBuy: true, minMSPR: 0, excludeChina: true }, news: [
      { headline: 'Mastercard Q1 EPS beats by 5%, raises guidance', source: 'Reuters', date: '2d ago', sentiment: 'positive' },
      { headline: 'Mastercard expands stablecoin settlement to 100+ banks', source: 'Bloomberg', date: '5d ago', sentiment: 'neutral' },
    ]},
    { ticker: 'PYPL', name: 'PayPal Holdings', livePrice: 44.50, metrics: { minMcapUS: 42, maxMcapUS: 42, positiveEPS: true, minROEUS: 25, minROIC: 23, minOpMargin: 18, maxDEUS: 0.6, minCRUS: 1.3, minICRUS: 12, minRevGUS: 4, minEPSGUS: 14, min5YSalesUS: 9, min5YProfitUS: 4, minFCFY: 8, fcfPositive5Y: true, maxPEUS: 10, maxPEGUS: 1.0, maxBetaUS: 1.4, minGM: 38, sharesFlat: true, maxSBC: 5, minInstOwn: 80, maxShort: 2, analystBuy: false, minMSPR: -25, excludeChina: true }, news: [
      { headline: 'PayPal Q1 transaction margin shrinks, branded checkout flat', source: 'WSJ', date: '2d ago', sentiment: 'negative' },
      { headline: 'UK FCA opens investigation into PayPal merchant practices', source: 'Reuters', date: '4d ago', sentiment: 'negative' },
      { headline: 'CEO insider selling activity intensifies, Form 4 filings show', source: 'Bloomberg', date: '6d ago', sentiment: 'negative' },
      { headline: 'Venmo growth slows as Cash App and Zelle gain share', source: 'CNBC', date: '1w ago', sentiment: 'negative' },
      { headline: 'PayPal announces $5B buyback, but stock barely moves', source: 'FT', date: '2w ago', sentiment: 'neutral' },
    ]},
  ],
  mf: [
    { ticker: 'PPFAS-FLEXI', name: 'Parag Parikh Flexi Cap', livePrice: 78.45, metrics: { maxER: 0.63, zeroExitAfter1Y: false, min1Y: 18, min3Y: 22, min5Y: 24, minSharpe: 1.2, minAlpha: 3.5, maxStdDev: 14, maxBetaMF: 0.85, minAUM: 70000, maxAUM: 70000, minFundAge: 12, minMgrTenure: 8, maxTop10: 42, maxTurnover: 25, directPlan: true } },
    { ticker: 'HDFC-MIDCAP', name: 'HDFC Mid-Cap Opportunities', livePrice: 195.30, metrics: { maxER: 0.85, zeroExitAfter1Y: true, min1Y: 22, min3Y: 26, min5Y: 28, minSharpe: 1.1, minAlpha: 2.8, maxStdDev: 19, maxBetaMF: 0.95, minAUM: 65000, maxAUM: 65000, minFundAge: 17, minMgrTenure: 6, maxTop10: 35, maxTurnover: 30, directPlan: true } },
    { ticker: 'MOTILAL-MIDCAP', name: 'Motilal Oswal Midcap', livePrice: 112.50, metrics: { maxER: 0.65, zeroExitAfter1Y: true, min1Y: 38, min3Y: 32, min5Y: 30, minSharpe: 1.0, minAlpha: 4.2, maxStdDev: 22, maxBetaMF: 1.15, minAUM: 18000, maxAUM: 18000, minFundAge: 9, minMgrTenure: 4, maxTop10: 48, maxTurnover: 65, directPlan: true } },
    { ticker: 'NIPPON-SMALL', name: 'Nippon India Small Cap', livePrice: 218.70, metrics: { maxER: 0.78, zeroExitAfter1Y: true, min1Y: 22, min3Y: 28, min5Y: 30, minSharpe: 0.9, minAlpha: 2.2, maxStdDev: 24, maxBetaMF: 1.18, minAUM: 55000, maxAUM: 55000, minFundAge: 15, minMgrTenure: 8, maxTop10: 28, maxTurnover: 45, directPlan: true } },
    { ticker: 'JM-FLEXI', name: 'JM Flexicap', livePrice: 92.10, metrics: { maxER: 0.45, zeroExitAfter1Y: true, min1Y: 20, min3Y: 24, min5Y: 22, minSharpe: 1.0, minAlpha: 2.0, maxStdDev: 20, maxBetaMF: 1.05, minAUM: 4500, maxAUM: 4500, minFundAge: 8, minMgrTenure: 2, maxTop10: 38, maxTurnover: 80, directPlan: true } },
    { ticker: 'QUANT-SMALL', name: 'Quant Small Cap', livePrice: 248.90, metrics: { maxER: 0.79, zeroExitAfter1Y: true, min1Y: 28, min3Y: 35, min5Y: 32, minSharpe: 0.85, minAlpha: 5.0, maxStdDev: 28, maxBetaMF: 1.25, minAUM: 28000, maxAUM: 28000, minFundAge: 13, minMgrTenure: 7, maxTop10: 55, maxTurnover: 220, directPlan: true } },
  ]
};
