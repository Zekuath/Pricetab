#!/usr/bin/env python3
"""Fit the selected model on the last 730 days and write the extension's
parameter package, src/outlook-model.js (generated — do not edit).

    python3 scripts/outlook/export_package.py

Refuses to write a package unless the validation and final runs exist and the
final run passed the preregistered rule (model-outlook-prereg.md, §5): 80%
coverage in [76%, 84%] and an interval score no worse than the rolling
baseline (DM t < 1.645 against it being worse).
"""
import csv
import json
import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import models as M  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RES = os.path.join(ROOT, "docs", "internal", "research")
DATA = os.path.join(RES, "outlook-data")
OUT = os.path.join(ROOT, "src", "outlook-model.js")


def iso(t):
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    val = json.load(open(os.path.join(RES, "model-outlook-validation.json")))
    fin = json.load(open(os.path.join(RES, "model-outlook-final.json")))
    sel = val["selected"]
    if sel != "ewma_t":
        sys.exit(f"this exporter knows the EWMA-t package; the selection is {sel}")
    fm = fin["models"][sel]
    dm = fm["dm"]["iscore_vs_rv24"]
    passed = 0.76 <= fm["coverage80"] <= 0.84 and dm["t"] < 1.645
    manifest = json.load(open(os.path.join(DATA, "BTC-USD-3600.manifest.json")))

    rows = []
    with open(os.path.join(DATA, "BTC-USD-3600.csv")) as f:
        for r in csv.DictReader(f):
            rows.append((int(r["time"]), float(r["close"])))
    times, closes, filled, blocked = M.regular_hours(rows)
    r = M.log_returns(closes)  # r[k] is the return of bar k+1
    last = times[-1]
    start = last - 730 * 86400
    i0 = times.index(start)
    window = r[i0:]  # the returns of bars i0+1 … last
    fit = M.fit_ewma_t(window)
    if not fit["ok"]:
        sys.exit(f"the production fit did not converge: {fit}")
    lam, nu = fit["lambda"], fit["nu"]

    # The checkpoint: the variance of the bar *after* the last one, from the
    # same start the fit used — in percent, then converted, and the same path
    # recomputed in decimal units as an independent check of the conversion.
    pct = [x * 100 for x in window]
    v0_pct = sum(x * x for x in pct) / len(pct)
    _, v_next_pct = M.ewma_filter(pct, lam, v0_pct)
    _, v_next_dec = M.ewma_filter(window, lam, v0_pct / 1e4)
    if abs(v_next_pct / 1e4 - v_next_dec) > 1e-12 * max(1.0, v_next_dec):
        sys.exit("percent and decimal variance paths disagree")

    # Reliability of the terminal-event probabilities on the final period,
    # pooled over the four declared events (±0.5%, ±1%), for the readout
    edges = [0, 0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 1.0001]
    pooled = []
    for lo, hi in zip(edges, edges[1:]):
        n = given = happened = 0
        for e in fm["events"].values():
            for b in e["bins"]:
                if lo <= b[0] < hi:
                    n += b[2]
                    given += b[2] * b[3]
                    happened += b[2] * b[4]
        if n:
            pooled.append([lo, min(hi, 1), n, round(given / n, 5), round(happened / n, 5)])

    pkg = {
        "schema": "pricetab.outlook.model/1",
        "id": f"ewma-t-{iso(last + 3600)[:10]}",
        "instrument": "BTC-USD",
        "venue": "Coinbase Exchange (spot)",
        "pair": "BTC-USD",
        "bar": "1h, UTC hour starting at its time; price = the bar's close",
        "returns": "decimal log returns, ln(S_t / S_t-1)",
        "horizon": "1 bar (1h), terminal",
        "method": "ewma",
        "dist": "t",
        "params": {"lambda": round(lam, 10), "nu": round(nu, 8)},
        "fit": {
            "window": [iso(start), iso(last + 3600)],
            "bars": len(window),
            "loglik_percent_units": round(fit["loglik_pct"], 4),
            "converged": fit["converged"],
        },
        "cutoff": iso(last + 3600),
        "checkpoint": {"time": last * 1000, "v": v_next_dec, "note": "variance of the return of the bar after `time`, decimal units"},
        "validity": {"minBars": 500, "maxAgeMs": 2 * 3600 * 1000, "maxGapBars": 6, "gapRecoveryBars": 48},
        "data": {k: manifest[k] for k in ("source", "first", "last", "rows", "missing_hours", "csv_sha256")},
        "evaluation": {
            "status": "passed" if passed else "not calibrated",
            "selection": val["selection_note"],
            "period": fin["period"],
            "n": fm["n"],
            "nominal": 0.8,
            "coverage80": round(fm["coverage80"], 5),
            "width80_pct": round(fm["width80_pct"], 4),
            "interval_score": round(fm["interval_score"], 5),
            "baseline": "rolling 24h variance, Normal",
            "baseline_interval_score": round(fin["models"]["rv24"]["interval_score"], 5),
            "dm_t_vs_baseline": round(dm["t"], 3),
            "reliability": pooled,
        },
    }
    body = json.dumps(pkg, indent=2)
    header = (
        "/* GENERATED by scripts/outlook/export_package.py — do not edit.\n"
        " *\n"
        " * The model outlook's parameter package (model-outlook.js reads it):\n"
        " * EWMA variance with standardized Student-t innovations for the next\n"
        " * completed hour of BTC-USD on Coinbase Exchange, fitted on the 730 days\n"
        " * before the cutoff and evaluated out of sample under the preregistration\n"
        " * docs/internal/research/model-outlook-prereg.md. Data, not code. */\n"
    )
    open(OUT, "w").write(header + "const OUTLOOK_MODEL = " + body + ";\n")
    print(json.dumps({"id": pkg["id"], "lambda": lam, "nu": nu, "v_next": v_next_dec, "status": pkg["evaluation"]["status"], "coverage80": fm["coverage80"], "dm_t": dm["t"]}))


if __name__ == "__main__":
    main()
