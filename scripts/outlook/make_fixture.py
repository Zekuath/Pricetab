#!/usr/bin/env python3
"""Reference numbers for tests/test-model-outlook.js, computed in Python.

    python3 scripts/outlook/make_fixture.py

Three kinds: (1) the standardized-t and Normal CDFs by Simpson integration of
the density — an algorithm the JavaScript does not use; (2) a forecast from
the real last 3000 completed bars and the bundled package, by models.py;
(3) the same with the checkpoint out of reach (burn-in path).
"""
import csv
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import models as M  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
src = open(os.path.join(ROOT, "src", "outlook-model.js")).read()
pkg = json.loads(re.search(r"const OUTLOOK_MODEL = (\{.*\});", src, re.S).group(1))
lam, nu = pkg["params"]["lambda"], pkg["params"]["nu"]


def std_t_pdf(z, nu):
    s = M.std_t_scale(nu)
    x = z / s
    c = math.exp(math.lgamma((nu + 1) / 2) - math.lgamma(nu / 2)) / math.sqrt(nu * math.pi)
    return c * (1 + x * x / nu) ** (-(nu + 1) / 2) / s


def simpson(f, a, b, n=400000):
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


# The tail beyond ±600 is added analytically from the ordinary-t tail
def std_t_cdf_simpson(z, nu):
    lo = -600.0
    tail = M.t_cdf(lo / M.std_t_scale(nu), nu)
    return tail + simpson(lambda u: std_t_pdf(u, nu), lo, z)


cdf_refs = []
for z in (-3.0, -1.2816, -0.5, 0.0, 0.7, 1.5, 2.5):
    cdf_refs.append({"z": z, "nu": nu, "t": std_t_cdf_simpson(z, nu), "normal": 0.5 * math.erfc(-z / math.sqrt(2))})

rows = []
with open(os.path.join(ROOT, "docs", "internal", "research", "outlook-data", "BTC-USD-3600.csv")) as f:
    for r in csv.DictReader(f):
        rows.append((int(r["time"]), float(r["close"])))
rows = rows[-3000:]
times, closes, filled, blocked = M.regular_hours(rows)
r = M.log_returns(closes)
cp = pkg["checkpoint"]
i = times.index(cp["time"] // 1000)
# checkpoint path: from cp.v over the returns after the checkpoint bar (none, when it is the last)
_, v_cp = M.ewma_filter(r[i:], lam, cp["v"])
# burn-in path: v0 = mean square of the first 500 returns
v0 = sum(x * x for x in r[:500]) / 500
_, v_burn = M.ewma_filter(r, lam, v0)


def forecast(v):
    s = math.sqrt(v)
    s0 = closes[-1]
    q = {p: s0 * math.exp(s * M.std_t_ppf(p, nu)) for p in (0.1, 0.5, 0.9)}
    k = round(s0 * 1.006, 2)
    p_above = 1 - M.std_t_cdf(math.log(k / s0) / s, nu)
    return {"sigma": s, "s0": s0, "lo": q[0.1], "median": q[0.5], "hi": q[0.9], "k": k, "pAbove": p_above}


out = {
    "package": pkg["id"],
    "cdf": cdf_refs,
    "bars": [{"time": t * 1000, "close": c} for t, c in rows],
    "now": (times[-1] + 3600) * 1000 + 37 * 60 * 1000,  # 14:37 for a 14:00 close
    "origin": (times[-1] + 3600) * 1000,
    "checkpoint": forecast(v_cp),
    "burnin": forecast(v_burn),
}
path = os.path.join(ROOT, "tests", "fixtures", "model-outlook.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(out, open(path, "w"))
print(json.dumps({"bars": len(rows), "checkpoint": out["checkpoint"], "burnin_sigma": out["burnin"]["sigma"]}))
