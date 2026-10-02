#!/usr/bin/env python3
"""Checks for models.py against independent references:
closed forms of the t CDF (nu = 1 is Cauchy, nu = 2 has an elementary CDF), a
t-table value, numerical integration of the standardized density, parameter
recovery on a simulated GARCH-t, and the percent/decimal unit conversion.

    python3 scripts/outlook/test_models.py
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import models as M  # noqa: E402

checks = 0


def ok(cond, msg):
    global checks
    if not cond:
        raise AssertionError(msg)
    checks += 1


def near(a, b, tol, msg):
    ok(abs(a - b) <= tol, f"{msg}: {a} vs {b}")


# t CDF, closed forms
for x in (-3.0, -0.5, 0.0, 1.0, 4.0):
    near(M.t_cdf(x, 1.0), 0.5 + math.atan(x) / math.pi, 1e-10, f"Cauchy CDF at {x}")
    near(M.t_cdf(x, 2.0), 0.5 + x / (2 * math.sqrt(x * x + 2)), 1e-10, f"t(2) CDF at {x}")
near(M.t_cdf(2.015048, 5.0), 0.95, 1e-5, "t(5) table value")
near(M.t_cdf(1.959964, 1e7), 0.975, 1e-5, "t(1e7) is the normal")


# the standardized density integrates to 1 and has unit variance (Simpson)
def std_t_pdf(z, nu):
    s = M.std_t_scale(nu)
    x = z / s
    c = math.exp(math.lgamma((nu + 1) / 2) - math.lgamma(nu / 2)) / math.sqrt(nu * math.pi)
    return c * (1 + x * x / nu) ** (-(nu + 1) / 2) / s


def simpson(f, a, b, n=200000):
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


for nu in (4.3, 7.0):
    near(simpson(lambda z: std_t_pdf(z, nu), -400, 400), 1.0, 2e-3, f"density mass, nu={nu}")
    near(simpson(lambda z: z * z * std_t_pdf(z, nu), -2000, 2000, 400000), 1.0, 0.03, f"unit variance, nu={nu}")
    # CDF by the incomplete beta agrees with integrating the density
    for z in (-2.0, 0.3, 1.5):
        near(M.std_t_cdf(z, nu), simpson(lambda u: std_t_pdf(u, nu), -400, z), 2e-4, f"std t CDF vs integral, nu={nu}, z={z}")
    for p in (0.05, 0.1, 0.5, 0.9, 0.95):
        near(M.std_t_cdf(M.std_t_ppf(p, nu), nu), p, 1e-9, f"ppf inverts cdf, nu={nu}, p={p}")
near(M.norm_ppf(0.9), 1.2815515655, 1e-8, "normal 90th percentile")

# percent vs decimal units: the same filter, scaled
r = [random.Random(3).gauss(0, 0.01) for _ in range(500)]
vd, nd = M.garch_filter(r, 2e-6, 0.08, 0.9, 1e-4)
vp, np_ = M.garch_filter([x * 100 for x in r], 2e-6 * 1e4, 0.08, 0.9, 1e-4 * 1e4)
ok(all(abs(a - b / 1e4) < 1e-15 for a, b in zip(vd, vp)) and abs(nd - np_ / 1e4) < 1e-15, "decimal variance = percent variance / 1e4, omega likewise")

# parameter recovery on a simulated GARCH(1,1)-t (decimal units)
rng = random.Random(20261001)
omega, alpha, beta, nu = 2e-6, 0.08, 0.90, 5.0
s = M.std_t_scale(nu)
v = omega / (1 - alpha - beta)
sim = []
for _ in range(20000):
    # standardized t draw: normal / sqrt(chi2/nu), scaled to unit variance
    chi = sum(rng.gauss(0, 1) ** 2 for _ in range(int(nu)))
    z = rng.gauss(0, 1) / math.sqrt(chi / nu) * s
    x = math.sqrt(v) * z
    sim.append(x)
    v = omega + alpha * x * x + beta * v
ft = M.fit_garch(sim, "t")
ok(ft["ok"], f"the t fit converges inside the constraints: {ft}")
near(ft["alpha"], alpha, 0.02, "alpha recovered")
near(ft["beta"], beta, 0.025, "beta recovered")
near(ft["nu"], nu, 1.2, "nu recovered")
near(ft["omega"] / (1 - ft["persistence"]), omega / (1 - alpha - beta), 0.25 * omega / (1 - alpha - beta), "unconditional variance recovered (decimal units)")
fn = M.fit_garch(sim, "normal")
ok(fn["ok"] and fn["persistence"] < 0.9999, "the normal QMLE converges too")
ok(ft["loglik_pct"] > fn["loglik_pct"], "on t data the t likelihood is higher")

# EWMA-t recovery (amendment 1): integrated variance, standardized-t draws
rng = random.Random(77)
lam, nu = 0.96, 4.0
s = M.std_t_scale(nu)
v = 1e-4
sim2 = []
for _ in range(20000):
    chi = sum(rng.gauss(0, 1) ** 2 for _ in range(int(nu)))
    x = math.sqrt(v) * rng.gauss(0, 1) / math.sqrt(chi / nu) * s
    sim2.append(x)
    v = lam * v + (1 - lam) * x * x
fe = M.fit_ewma_t(sim2)
ok(fe["ok"], f"the EWMA-t fit converges: {fe}")
near(fe["lambda"], lam, 0.01, "lambda recovered")
near(fe["nu"], nu, 0.8, "nu recovered")
# a boundary fit is rejected, not adjusted: integrated data asks GARCH for alpha+beta = 1
fb = M.fit_garch(sim2, "t")
ok(fb["boundary"] and not fb["ok"], f"GARCH-t on integrated data lands on the bound and is rejected: {fb['persistence']}")

# bars: duplicates, order, gaps, blocking
rows = [(7200, 10), (3600, 9), (7200, 11), (10800, 12), (10800 + 3600 * 9, 13)]
times, closes, filled, blocked = M.regular_hours(rows)
ok(times == [3600 * k for k in range(1, 13)], "one entry per whole hour, sorted")
ok(closes[1] == 11, "a duplicate keeps one value")
ok(filled.count(True) == 8 and closes[5] == 12, "missing hours take the previous close and are flagged")
ok(blocked[-1] and not blocked[2], "the hours after a gap over 6 hours are blocked")

print(f"✔ {checks} model checks")
print("MODEL TESTS OK")
