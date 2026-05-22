"""
Build the MF universe by resolving hand-curated fund names to MFAPI scheme codes.
Uses current SEBI-mandated fund names (many AMCs renamed funds after 2018 rationalization).

Update CURATED_FUNDS every 6 months.
Run: cd scripts && python3 build_mf_universe.py
"""

import httpx
import json
import time
import sys
from pathlib import Path

# Hand-curated list using CURRENT fund names as of mid-2026.
# Several AMCs renamed "Bluechip" → "Large Cap", "Emerging Equity" → "Midcap", etc.
# after SEBI's 2018 fund categorization mandate.
# Format: (mfapi_search_query, category, amc)
CURATED_FUNDS = [
    # --- Flexi Cap ---
    ("Parag Parikh Flexi Cap Fund Direct Plan Growth",               "Flexi Cap",        "PPFAS"),
    ("HDFC Flexi Cap Fund Growth Direct Plan",                       "Flexi Cap",        "HDFC"),
    ("Kotak Flexicap Fund Growth Direct",                            "Flexi Cap",        "Kotak"),
    ("ICICI Prudential Flexicap Fund Direct Plan Growth",            "Flexi Cap",        "ICICI Pru"),
    ("SBI Flexicap Fund DIRECT PLAN Growth",                         "Flexi Cap",        "SBI"),
    ("Aditya Birla Sun Life Flexi Cap Fund Growth Direct Plan",      "Flexi Cap",        "Aditya Birla SL"),
    ("UTI Flexi Cap Fund Growth Direct",                             "Flexi Cap",        "UTI"),
    ("DSP Flexi Cap Fund Direct Plan Growth",                        "Flexi Cap",        "DSP"),
    ("Mirae Asset Flexi Cap Fund Direct Plan Growth",                "Flexi Cap",        "Mirae Asset"),
    ("Nippon India Flexi Cap Fund Direct Plan Growth",               "Flexi Cap",        "Nippon India"),

    # --- Large Cap (note: many renamed from Bluechip after SEBI 2018) ---
    ("ICICI Prudential Large Cap Fund erstwhile Bluechip Direct Growth", "Large Cap",    "ICICI Pru"),
    ("Axis Large Cap Fund - Direct Plan - Growth",                   "Large Cap",        "Axis"),
    ("SBI Large Cap Fund DIRECT PLAN GROWTH",                        "Large Cap",        "SBI"),
    ("HDFC Large Cap Fund Growth Direct Plan",                       "Large Cap",        "HDFC"),
    ("Nippon India Large Cap Fund Direct Plan Growth",               "Large Cap",        "Nippon India"),
    ("Mirae Asset Large Cap Fund Direct Plan Growth",                "Large Cap",        "Mirae Asset"),
    ("CANARA ROBECO LARGE CAP FUND DIRECT PLAN GROWTH",              "Large Cap",        "Canara Robeco"),
    ("Kotak Large Cap Fund Growth Direct",                           "Large Cap",        "Kotak"),

    # --- Mid Cap ---
    ("HDFC Mid Cap Fund Growth Direct Plan",                         "Mid Cap",          "HDFC"),
    ("Motilal Oswal Midcap Fund Direct Plan Growth",                 "Mid Cap",          "Motilal Oswal"),
    ("Kotak Midcap Fund Direct Plan Growth",                         "Mid Cap",          "Kotak"),
    ("Nippon India Growth Mid Cap Fund Direct Growth Option",        "Mid Cap",          "Nippon India"),
    ("Axis Midcap Fund Direct Plan Growth",                          "Mid Cap",          "Axis"),
    ("DSP Midcap Fund Direct Plan Growth",                           "Mid Cap",          "DSP"),
    ("SBI Midcap Fund Direct Plan Growth",                           "Mid Cap",          "SBI"),
    ("Edelweiss Mid Cap Fund Direct Plan Growth Option",             "Mid Cap",          "Edelweiss"),
    ("Mirae Asset Midcap Fund Direct Growth",                        "Mid Cap",          "Mirae Asset"),

    # --- Small Cap ---
    ("Nippon India Small Cap Fund Direct Plan Growth",               "Small Cap",        "Nippon India"),
    ("HDFC Small Cap Fund Growth Direct Plan",                       "Small Cap",        "HDFC"),
    ("SBI Small Cap Fund Direct Plan Growth",                        "Small Cap",        "SBI"),
    ("Axis Small Cap Fund Direct Plan Growth",                       "Small Cap",        "Axis"),
    ("quant Small Cap Fund Growth Direct Plan",                      "Small Cap",        "Quant"),
    ("DSP Small Cap Fund Direct Plan Growth",                        "Small Cap",        "DSP"),
    ("Kotak Small Cap Fund Growth Direct",                           "Small Cap",        "Kotak"),
    ("ICICI Prudential Smallcap Fund Direct Plan Growth",            "Small Cap",        "ICICI Pru"),

    # --- Large & Mid Cap ---
    ("Mirae Asset Large Midcap Fund Direct Plan Growth",             "Large & Mid Cap",  "Mirae Asset"),
    ("CANARA ROBECO LARGE AND MID CAP FUND DIRECT PLAN GROWTH",      "Large & Mid Cap",  "Canara Robeco"),
    ("ICICI Prudential Large Mid Cap Fund Direct Plan Growth",       "Large & Mid Cap",  "ICICI Pru"),
    # Kotak Equity Opportunities renamed/merged — not available in MFAPI

    # --- ELSS ---
    ("Mirae Asset ELSS Tax Saver Fund Direct Plan Growth",           "ELSS",             "Mirae Asset"),
    ("Axis ELSS Tax Saver Fund Direct Plan Growth",                  "ELSS",             "Axis"),
    ("Parag Parikh ELSS Tax Saver Fund Direct Growth",               "ELSS",             "PPFAS"),
    ("quant ELSS Tax Saver Fund Growth Direct Plan",                 "ELSS",             "Quant"),
    ("DSP ELSS Tax Saver Fund Direct Plan Growth",                   "ELSS",             "DSP"),
    ("CANARA ROBECO ELSS TAX SAVER DIRECT PLAN GROWTH",              "ELSS",             "Canara Robeco"),

    # --- Focused ---
    ("ICICI Prudential Focused Equity Fund Direct Plan Growth",      "Focused",          "ICICI Pru"),
    ("Axis Focused Fund Direct Plan Growth",                         "Focused",          "Axis"),
    ("SBI FOCUSED FUND DIRECT PLAN GROWTH",                          "Focused",          "SBI"),
    ("HDFC Focused 30 Fund Direct Plan Growth",                      "Focused",          "HDFC"),
    ("quant Focused Fund Growth Direct Plan",                        "Focused",          "Quant"),

    # --- Value / Contra ---
    ("ICICI Prudential Value Fund erstwhile Value Discovery Direct Growth", "Value",     "ICICI Pru"),
    ("SBI CONTRA FUND DIRECT PLAN GROWTH",                           "Contra",           "SBI"),
    ("Tata Value Fund -Direct Plan Growth Option",                   "Value",            "Tata"),
    ("Nippon India Value Fund Direct Plan Growth",                   "Value",            "Nippon India"),

    # --- Index ---
    ("UTI Nifty 50 Index Fund Growth Direct",                        "Index",            "UTI"),
    ("HDFC Nifty 50 Index Fund Direct Plan",                         "Index",            "HDFC"),
    ("ICICI Prudential Nifty 50 Index Fund Direct Plan",             "Index",            "ICICI Pru"),
    ("Motilal Oswal Nifty 500 Index Fund Direct Plan",               "Index",            "Motilal Oswal"),
    ("Motilal Oswal Nifty Midcap 150 Index Fund Direct Plan",        "Index",            "Motilal Oswal"),
    ("Nippon India Index Fund Nifty 50 Plan Direct Growth",          "Index",            "Nippon India"),

    # --- International ---
    ("Motilal Oswal Nasdaq 100 Fund of Fund Direct Growth",          "International",    "Motilal Oswal"),
    ("Mirae Asset NYSE FANG ETF Fund of Fund Direct Growth",         "International",    "Mirae Asset"),
    ("ICICI Prudential US Bluechip Equity Fund Direct Growth",       "International",    "ICICI Pru"),
    ("Parag Parikh Conservative Hybrid Fund Direct Plan Growth",     "Hybrid",           "PPFAS"),

    # --- Balanced Advantage / Hybrid ---
    ("HDFC Balanced Advantage Fund Growth Direct Plan",              "Balanced Advantage","HDFC"),
    ("ICICI Prudential Balanced Advantage Fund Direct Growth",       "Balanced Advantage","ICICI Pru"),
    ("SBI Balanced Advantage Fund Direct Plan Growth",               "Balanced Advantage","SBI"),
    ("Edelweiss Balanced Advantage Fund Direct Plan Growth",         "Balanced Advantage","Edelweiss"),

    # --- Sector / Thematic ---
    ("Nippon India Pharma Fund Direct Plan Growth",                  "Sectoral",         "Nippon India"),
    ("ICICI Prudential Technology Fund Direct Plan Growth",          "Sectoral",         "ICICI Pru"),
    ("SBI BANKING FINANCIAL SERVICES FUND DIRECT PLAN GROWTH",      "Sectoral",         "SBI"),
    ("ICICI Prudential Infrastructure Fund Direct Plan Growth",      "Sectoral",         "ICICI Pru"),
    ("Tata Digital India Fund Direct Plan Growth",                   "Sectoral",         "Tata"),

    # --- Debt ---
    ("ICICI Prudential Corporate Bond Fund Direct Growth",           "Corporate Bond",   "ICICI Pru"),
    ("HDFC Corporate Bond Fund Growth Direct Plan",                  "Corporate Bond",   "HDFC"),
    ("Aditya Birla Sun Life Corporate Bond Fund Growth Direct Plan", "Corporate Bond",   "Aditya Birla SL"),
    ("SBI SHORT TERM DEBT FUND DIRECT PLAN GROWTH",                  "Short Duration",   "SBI"),
]


# Direct code overrides for funds where MFAPI search returns the wrong result
# (typically Large Cap vs Large&MidCap confusion, or growth vs bonus option).
DIRECT_CODE_OVERRIDES = {
    "Axis Large Cap Fund - Direct Plan - Growth":           "120465",
    "SBI Midcap Fund Direct Plan Growth":                   "119716",
    "Nippon India Growth Mid Cap Fund Direct Growth Option":"118668",
    "Edelweiss Mid Cap Fund Direct Plan Growth Option":     "140228",
    "HDFC Focused 30 Fund Direct Plan Growth":              "133529",
    "HDFC Large Cap Fund Growth Direct Plan":               "119018",
}


def find_scheme(query: str) -> dict | None:
    if query in DIRECT_CODE_OVERRIDES:
        code = DIRECT_CODE_OVERRIDES[query]
        try:
            resp = httpx.get(f"https://api.mfapi.in/mf/{code}", timeout=15)
            if resp.status_code == 200:
                meta = resp.json().get("meta", {})
                return {"schemeCode": int(code), "schemeName": meta.get("scheme_name", "")}
        except Exception as e:
            print(f"    Direct lookup error for {code}: {e}")
        return None

    url = f"https://api.mfapi.in/mf/search?q={query}"
    try:
        resp = httpx.get(url, timeout=15)
        if resp.status_code != 200:
            return None
        results = resp.json()
        return results[0] if results else None
    except Exception as e:
        print(f"    API error: {e}")
        return None


def main():
    universe = []
    failed = []

    print(f"Resolving {len(CURATED_FUNDS)} funds via MFAPI search...\n")

    for query, category, amc in CURATED_FUNDS:
        match = find_scheme(query)
        if not match:
            failed.append((query, category, amc))
            print(f"  ✗  [{category} / {amc}]  {query[:60]}")
        else:
            entry = {
                "scheme_code": str(match["schemeCode"]),
                "name": match["schemeName"],
                "category": category,
                "amc": amc,
            }
            universe.append(entry)
            print(f"  ✓  {match['schemeCode']}  {match['schemeName'][:65]}")
        time.sleep(0.2)

    # Deduplicate by scheme_code (same fund matched twice)
    seen = set()
    deduped = []
    dupes = []
    for entry in universe:
        if entry["scheme_code"] in seen:
            dupes.append(entry)
        else:
            seen.add(entry["scheme_code"])
            deduped.append(entry)
    universe = deduped

    print(f"\n--- Results ---")
    print(f"Found:      {len(universe)}")
    print(f"Duplicates: {len(dupes)}")
    print(f"Failed:     {len(failed)}")

    if len(universe) == 0:
        print("\nERROR: Zero schemes resolved. Not writing file.")
        sys.exit(1)

    out = Path("universes/mf_top300.json")
    out.write_text(json.dumps(universe, indent=2))
    print(f"\n✓ Wrote {len(universe)} funds to {out}")

    if dupes:
        print(f"\n⚠  Duplicate scheme codes (removed):")
        for d in dupes:
            print(f"   {d['scheme_code']}  {d['name'][:60]}")

    if failed:
        print(f"\n⚠  Could not resolve {len(failed)} funds:")
        for q, cat, amc in failed:
            print(f"   [{cat} / {amc}]  {q}")

    ppfas = next((f for f in universe if "Parag Parikh" in f["name"] and "Flexi" in f["name"]), None)
    print(f"\n✓ Spot-check PPFAS Flexi Cap: {ppfas['scheme_code'] if ppfas else 'NOT FOUND'}")


if __name__ == "__main__":
    main()
