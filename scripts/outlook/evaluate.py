#!/usr/bin/env python3
"""Walk-forward evaluation of the 1h model outlook (model-outlook-prereg.md).

    python3 scripts/outlook/evaluate.py --phase validation   # selects the model
    python3 scripts/outlook/evaluate.py --phase final        # the untouched period, once

Standard library only. Reads the bars written by fetch_bars.py. Every number
in the output files comes from this run; nothing is typed in by hand.
"""
import argparse
import csv
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import models as M  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "docs", "internal", "research", "outlook-data")
OUT = os.path.join(ROOT, "docs", "internal", "research")
PERIODS = {
    "validation": ("2023-01-01", "2025-01-01"),
    "final": ("2025-01-01", "2026-10-01"),
}
WINDOW_DAYS = 730
QS = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
EVENTS = [("up", 0.005), ("up", 0.01), ("down", 0.005), ("down", 0.01)]
ALPHA = 0.2  # the central 80% interval
NW_LAGS = 24
MODELS = ["rv24", "rv168", "rv720", "ewma", "ewma_t", "garch_n", "garch_t"]
SIMPLICITY = {"rv24": 1, "rv168": 1, "rv720": 1, "ewma": 2, "ewma_t": 2.5, "garch_n": 3, "garch_t": 4}


def ts(day):
    return int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())


def month_starts(a, b):
    d = datetime.fromtimestamp(a, tz=timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    out = []
    while int(d.timestamp()) < b:
        out.append(int(d.timestamp()))
        d = d.replace(year=d.year + (d.month // 12), month=d.month % 12 + 1)
    return out


def load():
    rows = []
    with open(os.path.join(DATA, "BTC-USD-3600.csv")) as f:
        for r in csv.DictReader(f):
            rows.append((int(r["time"]), float(r["close"])))
    times, closes, filled, blocked = M.regular_hours(rows)
    manifest = json.load(open(os.path.join(DATA, "BTC-USD-3600.manifest.json")))
    return times, closes, filled, blocked, manifest


T_MODELS = ("garch_t", "ewma_t")


def quantile_z(model, p, nu=None):
    return M.std_t_ppf(p, nu) if model in T_MODELS else M.norm_ppf(p)


def cdf_z(model, z, nu=None):
    return M.std_t_cdf(z, nu) if model in T_MODELS else M.norm_cdf(z)


def nw_se(d, lags=NW_LAGS):
    """Newey–West standard error of the mean of d."""
    n = len(d)
    m = sum(d) / n
    e = [x - m for x in d]
    g0 = sum(x * x for x in e) / n
    s = g0
    for k in range(1, lags + 1):
        gk = sum(e[i] * e[i - k] for i in range(k, n)) / n
        s += 2 * (1 - k / (lags + 1)) * gk
    return math.sqrt(max(s, 0) / n)


def run(phase):
    t_start = time.time()
    times, closes, filled, blocked, manifest = load()
    # r[j] is the return of bar j (times[j]); its forecast is issued at
    # times[j] — the end of bar j-1 — from returns up to r[j-1].
    r = [0.0] + M.log_returns(closes)
    index = {t: i for i, t in enumerate(times)}
    a, b = (ts(x) for x in PERIODS[phase])
    per_model = {m: [] for m in MODELS}
    fits = []
    nu_cache = {}
    for ms in month_starts(a, b):
        me = month_starts(ms + 32 * 86400, ms + 33 * 86400)[0] if True else None
        me = min(me, b)
        w0 = index.get(ms - WINDOW_DAYS * 86400)
        i0 = index.get(ms)
        i1 = index.get(me, len(times))
        if w0 is None or i0 is None:
            continue
        window = r[w0 + 1 : i0]  # returns strictly before the month starts
        # Fit each model on the window only
        params = {}
        rejected = {}
        for dist, key in (("normal", "garch_n"), ("t", "garch_t")):
            prev = fits[-1]["params"].get(key) if fits else None
            fit = M.fit_garch(window, dist)
            if not fit["ok"]:
                # Not adjusted: the previous month's valid fit is kept, if any
                rejected[key] = {k: fit[k] for k in ("alpha", "beta", "persistence", "boundary", "converged") if k in fit}
                fit = dict(prev, carried=True) if prev else None
            params[key] = fit
        params["ewma"] = M.fit_ewma(window)
        prev_et = fits[-1]["params"].get("ewma_t") if fits else None
        et = M.fit_ewma_t(window)
        params["ewma_t"] = et if et["ok"] else (dict(prev_et, carried=True) if prev_et else None)
        if params["ewma_t"] is None or params["ewma_t"].get("carried"):
            rejected["ewma_t"] = True
        fits.append({"month": datetime.fromtimestamp(ms, tz=timezone.utc).strftime("%Y-%m"), "params": params, "rejected": rejected})
        # Filter from the start of the window through the month
        span = r[w0 + 1 : i1]
        v0 = sum(x * x for x in window) / len(window)
        paths = {}
        for key in ("garch_n", "garch_t"):
            p = params[key]
            if p is None:
                continue
            v, _ = M.garch_filter(span, p["omega"], p["alpha"], p["beta"], v0)
            paths[key] = v
        v, _ = M.ewma_filter(span, params["ewma"]["lambda"], v0)
        paths["ewma"] = v
        if params["ewma_t"]:
            v, _ = M.ewma_filter(span, params["ewma_t"]["lambda"], v0)
            paths["ewma_t"] = v
        offset = w0 + 1
        for j in range(i0, i1):
            if blocked[j] or blocked[j - 1] or filled[j]:
                continue  # insufficient data, or an outcome with no trade
            k = j - offset
            sigma2 = {key: paths[key][k] for key in paths}
            for wname, W in (("rv24", 24), ("rv168", 168), ("rv720", 720)):
                seg = r[j - W : j]
                sigma2[wname] = sum(x * x for x in seg) / W
            for m in MODELS:
                if m not in sigma2 or not sigma2[m] > 0:
                    continue
                nu = params[m]["nu"] if m in T_MODELS else None
                per_model[m].append(score(m, r[j], sigma2[m], nu, nu_cache))
    result = summarise(per_model, phase)
    result["fits"] = fits
    result["data"] = {k: manifest[k] for k in ("product", "venue", "first", "last", "rows", "gaps", "missing_hours", "csv_sha256")}
    result["period"] = PERIODS[phase]
    result["seconds"] = round(time.time() - t_start, 1)
    return result


def score(model, x, v, nu, cache):
    """One forecast's scores. x: realised log return; v: forecast variance."""
    s = math.sqrt(v)
    key = (model, round(nu, 6) if nu else None)
    if key not in cache:
        cache[key] = {p: quantile_z(model, p, nu) for p in QS}
    zq = cache[key]
    lo, hi = s * zq[0.10], s * zq[0.90]
    width = hi - lo
    iscore = width + (2 / ALPHA) * (lo - x) * (x < lo) + (2 / ALPHA) * (x - hi) * (x > hi)
    pin = 0.0
    for p in QS:
        q = s * zq[p]
        pin += (p - (x < q)) * (x - q)
    pin /= len(QS)
    out = {
        "inside": lo <= x <= hi,
        "width": width * 100,  # percent of S0 (log points ×100)
        "iscore": iscore * 100,
        "pinball": pin * 100,
        "qlike": x * x / v + math.log(v),
    }
    for side, k in EVENTS:
        if side == "up":
            thr = math.log(1 + k)
            p = 1 - cdf_z(model, thr / s, nu)
            hit = x > thr
        else:
            thr = math.log(1 - k)
            p = cdf_z(model, thr / s, nu)
            hit = x < thr
        out[f"{side}{k}"] = (p, 1 if hit else 0)
    return out


def summarise(per_model, phase):
    res = {"phase": phase, "models": {}}
    base_key = None
    for m, rows in per_model.items():
        n = len(rows)
        if not n:
            continue
        mean = lambda f: sum(f(o) for o in rows) / n
        ev = {}
        for side, k in EVENTS:
            name = f"{side}{k}"
            pairs = [o[name] for o in rows]
            brier = sum((p - h) ** 2 for p, h in pairs) / n
            base = sum(h for _, h in pairs) / n
            bins = []
            edges = [0, 0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 1.0001]
            for lo, hi in zip(edges, edges[1:]):
                sel = [(p, h) for p, h in pairs if lo <= p < hi]
                if sel:
                    bins.append([lo, min(hi, 1), len(sel), sum(p for p, _ in sel) / len(sel), sum(h for _, h in sel) / len(sel)])
            ev[name] = {"brier": brier, "climatology_brier": base * (1 - base), "rate": base, "mean_p": sum(p for p, _ in pairs) / n, "bins": bins}
        res["models"][m] = {
            "n": n,
            "coverage80": mean(lambda o: 1 if o["inside"] else 0),
            "width80_pct": mean(lambda o: o["width"]),
            "interval_score": mean(lambda o: o["iscore"]),
            "pinball": mean(lambda o: o["pinball"]),
            "qlike": mean(lambda o: o["qlike"]),
            "events": ev,
        }
    # Diebold–Mariano on the interval score and QLIKE against each rolling window
    for m in res["models"]:
        res["models"][m]["dm"] = {}
    names = list(res["models"])
    for m in names:
        for ref in ("rv24", "rv168", "rv720"):
            if ref not in per_model or m == ref or len(per_model[m]) != len(per_model[ref]):
                continue
            for metric in ("iscore", "qlike"):
                d = [x[metric] - y[metric] for x, y in zip(per_model[m], per_model[ref])]
                se = nw_se(d)
                mean_d = sum(d) / len(d)
                res["models"][m]["dm"][f"{metric}_vs_{ref}"] = {"mean_diff": mean_d, "se": se, "t": mean_d / se if se else None}
    return res


def select(res):
    """The preregistered rule: lowest interval score among models with 80%
    coverage in [77%, 83%]; within one DM standard error, the simpler."""
    ms = res["models"]
    eligible = [m for m in ms if 0.77 <= ms[m]["coverage80"] <= 0.83]
    if not eligible:
        return None, "no model's 80% coverage was inside [77%, 83%]"
    best = min(eligible, key=lambda m: ms[m]["interval_score"])
    note = f"lowest interval score among {eligible}: {best}"
    for m in sorted(eligible, key=lambda m: SIMPLICITY[m]):
        if SIMPLICITY[m] >= SIMPLICITY[best]:
            break
        diff = ms[best]["interval_score"] - ms[m]["interval_score"]
        dm = ms[best]["dm"].get(f"iscore_vs_{m}") if m.startswith("rv") else None
        se = dm["se"] if dm else None
        if se and abs(diff) <= se:
            note += f"; {m} is within one DM standard error ({diff:.4f} vs se {se:.4f}) and simpler"
            return m, note
    return best, note


def write(res, phase):
    path = os.path.join(OUT, f"model-outlook-{phase}.json")
    json.dump(res, open(path, "w"), indent=1)
    lines = [f"# Model outlook — {phase} ({res['period'][0]} → {res['period'][1]})", ""]
    lines.append(f"Data: {res['data']['product']} {res['data']['venue']}, {res['data']['rows']} bars {res['data']['first']} → {res['data']['last']}, sha256 {res['data']['csv_sha256'][:16]}…  ·  run {res['seconds']}s")
    lines.append("")
    lines.append("| model | n | 80% coverage | width % | interval score | pinball | QLIKE | Brier up1% | Brier down1% |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for m, s in res["models"].items():
        lines.append(f"| {m} | {s['n']} | {100*s['coverage80']:.2f}% | {s['width80_pct']:.3f} | {s['interval_score']:.4f} | {s['pinball']:.5f} | {s['qlike']:.4f} | {s['events']['up0.01']['brier']:.5f} | {s['events']['down0.01']['brier']:.5f} |")
    lines.append("")
    lines.append("Diebold–Mariano (Newey–West, 24 lags), mean loss difference model − baseline (negative = model better):")
    for m, s in res["models"].items():
        bits = [f"{k}: {v['mean_diff']:+.5f} (t {v['t']:+.2f})" for k, v in s["dm"].items() if v["t"] is not None]
        if bits:
            lines.append(f"- {m}: " + "; ".join(bits))
    if "selected" in res:
        lines += ["", f"**Selected:** {res['selected']} — {res['selection_note']}"]
    lines += ["", f"Monthly refits: {len(res['fits'])}."]
    for k in ("garch_n", "garch_t", "ewma_t"):
        rej = sum(1 for f in res["fits"] if f["rejected"].get(k))
        none = sum(1 for f in res["fits"] if not f["params"].get(k))
        lines.append(f"- {k}: {rej} of {len(res['fits'])} monthly fits rejected (boundary or non-converged); months with no valid fit to use: {none}")
    open(os.path.join(OUT, f"model-outlook-{phase}.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=list(PERIODS), required=True)
    args = ap.parse_args()
    if args.phase == "final":
        sel_path = os.path.join(OUT, "model-outlook-validation.json")
        if not os.path.exists(sel_path):
            sys.exit("run the validation phase first: the selection is made there, never on the final period")
        done = os.path.join(OUT, "model-outlook-final.json")
        if os.path.exists(done) and "--again" not in sys.argv:
            sys.exit("the final period has been evaluated already; it is touched once")
    res = run(args.phase)
    if args.phase == "validation":
        sel, note = select(res)
        res["selected"] = sel
        res["selection_note"] = note
    else:
        val = json.load(open(os.path.join(OUT, "model-outlook-validation.json")))
        res["selected"] = val["selected"]
        res["selection_note"] = "fixed on the validation period: " + val["selection_note"]
    write(res, args.phase)


if __name__ == "__main__":
    main()
