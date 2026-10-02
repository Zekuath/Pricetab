"""Volatility models for the 1h model outlook — standard library only.

Units: every return here is a *decimal* log return r = log(S_t / S_{t-1}),
and every variance is in decimal units squared, except inside the GARCH
fitter, which works on percent returns (x100) for conditioning and converts
its results back (omega and variances / 1e4) before anything leaves it.
That conversion is checked numerically in `test_models.py`.

Conventions for one forecast: `v_next` is the conditional variance of the
*next* bar's return given everything up to and including the current bar.
"""
import math

HOUR = 3600
GAP_INSUFFICIENT_H = 6  # a gap longer than this makes the next 48h insufficient
GAP_RECOVERY_H = 48


# ── bars ─────────────────────────────────────────────────────────────────
def regular_hours(rows):
    """rows: [(time, close)] in any order, possibly duplicated or gappy.
    Returns (times, closes, filled, blocked): one entry per whole UTC hour from
    the first to the last row; a missing hour takes the previous close (the
    documented meaning of an hour with no trade) and is marked `filled`; the
    48 hours after a gap longer than 6 hours are marked `blocked`."""
    by_t = {}
    for t, c in rows:
        t = int(t)
        if t % HOUR or not (c > 0):
            continue
        by_t[t] = float(c)  # a duplicate keeps the last value seen
    if not by_t:
        return [], [], [], []
    ts = sorted(by_t)
    times, closes, filled, blocked = [], [], [], []
    block_until = -1
    prev = None
    t = ts[0]
    end = ts[-1]
    run = 0
    while t <= end:
        if t in by_t:
            if run > GAP_INSUFFICIENT_H:
                block_until = t + GAP_RECOVERY_H * HOUR
            run = 0
            prev = by_t[t]
            filled.append(False)
        else:
            run += 1
            filled.append(True)
        times.append(t)
        closes.append(prev)
        blocked.append(t < block_until or run > GAP_INSUFFICIENT_H)
        t += HOUR
    return times, closes, filled, blocked


def log_returns(closes):
    return [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]


# ── the standardized Student-t ──────────────────────────────────────────
def _betacf(a, b, x, eps=1e-15, max_iter=500):
    """Continued fraction for the incomplete beta (modified Lentz)."""
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / c
        c = c if abs(c) > tiny else tiny
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / c
        c = c if abs(c) > tiny else tiny
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            return h
    raise ArithmeticError("betacf did not converge")


def betainc(a, b, x):
    """Regularized incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1.0 - x) / b


def t_cdf(x, nu):
    """Ordinary Student-t CDF (unit scale). Two equivalent forms, each used
    where it keeps its precision: near zero the tail form is 1 minus a number
    close to 1 and loses about eight digits, so the centre is computed from
    I_{x²/(ν+x²)}(1/2, ν/2) instead."""
    x2 = x * x
    if x2 < nu:
        half = 0.5 * betainc(0.5, nu / 2.0, x2 / (nu + x2))
        return 0.5 + half if x > 0 else 0.5 - half
    tail = 0.5 * betainc(nu / 2.0, 0.5, nu / (nu + x2))
    return 1.0 - tail if x > 0 else tail


def std_t_scale(nu):
    """Ordinary-t scale that gives unit variance: sqrt((nu - 2) / nu)."""
    return math.sqrt((nu - 2.0) / nu)


def std_t_cdf(z, nu):
    """CDF of the *standardized* (unit-variance) t at z."""
    return t_cdf(z / std_t_scale(nu), nu)


def std_t_ppf(p, nu):
    """Quantile of the standardized t, by bisection on the CDF."""
    if not 0.0 < p < 1.0:
        raise ValueError("p must be in (0, 1)")
    lo, hi = -60.0, 60.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if std_t_cdf(mid, nu) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def norm_cdf(z):
    return 0.5 * math.erfc(-z / math.sqrt(2.0))


def norm_ppf(p):
    lo, hi = -40.0, 40.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if norm_cdf(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ── GARCH(1,1), zero mean ────────────────────────────────────────────────
def garch_filter(r, omega, alpha, beta, v0):
    """v[i] is the variance of r[i] given r[:i]; returns v and the variance
    of the return after the last one (v_next)."""
    v = [0.0] * len(r)
    cur = v0
    for i, x in enumerate(r):
        v[i] = cur
        cur = omega + alpha * x * x + beta * cur
    return v, cur


def _nll(params, r, dist, v0):
    if dist == "t":
        omega, alpha, beta, nu = params
        if not (2.05 < nu <= 500.0):
            return float("inf")
    else:
        omega, alpha, beta = params
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 0.9999:
        return float("inf")
    cur = v0
    total = 0.0
    if dist == "t":
        const = math.lgamma((nu + 1) / 2) - math.lgamma(nu / 2) - 0.5 * math.log(math.pi * (nu - 2))
        k = (nu + 1) / 2
        nm2 = nu - 2
        for x in r:
            if cur <= 0:
                return float("inf")
            total += const - 0.5 * math.log(cur) - k * math.log(1 + x * x / (cur * nm2))
            cur = omega + alpha * x * x + beta * cur
    else:
        c = 0.5 * math.log(2 * math.pi)
        for x in r:
            if cur <= 0:
                return float("inf")
            total += -c - 0.5 * math.log(cur) - 0.5 * x * x / cur
            cur = omega + alpha * x * x + beta * cur
    return -total


def nelder_mead(f, x0, step, max_iter=2000, xtol=1e-7, ftol=1e-9):
    n = len(x0)
    pts = [list(x0)]
    for i in range(n):
        p = list(x0)
        p[i] += step[i]
        pts.append(p)
    vals = [f(p) for p in pts]
    it = 0
    converged = False
    while it < max_iter:
        it += 1
        order = sorted(range(n + 1), key=lambda i: vals[i])
        pts = [pts[i] for i in order]
        vals = [vals[i] for i in order]
        size = max(max(abs(pts[i][j] - pts[0][j]) for j in range(n)) for i in range(1, n + 1))
        if size < xtol and abs(vals[-1] - vals[0]) < ftol * (1 + abs(vals[0])):
            converged = True
            break
        cen = [sum(pts[i][j] for i in range(n)) / n for j in range(n)]
        xr = [cen[j] + (cen[j] - pts[-1][j]) for j in range(n)]
        fr = f(xr)
        if fr < vals[0]:
            xe = [cen[j] + 2 * (cen[j] - pts[-1][j]) for j in range(n)]
            fe = f(xe)
            if fe < fr:
                pts[-1], vals[-1] = xe, fe
            else:
                pts[-1], vals[-1] = xr, fr
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = [cen[j] + 0.5 * (pts[-1][j] - cen[j]) for j in range(n)]
            fc = f(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                for i in range(1, n + 1):
                    pts[i] = [pts[0][j] + 0.5 * (pts[i][j] - pts[0][j]) for j in range(n)]
                    vals[i] = f(pts[i])
    best = min(range(n + 1), key=lambda i: vals[i])
    return pts[best], vals[best], converged, it


def fit_garch(r_decimal, dist="normal", start=None):
    """Gaussian QMLE (dist="normal") or standardized-t MLE (dist="t") of a
    zero-mean GARCH(1,1). Fits on percent returns; returns parameters in
    decimal units. Never forces a constraint after the fact: a non-converged
    or boundary fit is reported as such (`ok` False) for the caller to reject."""
    r = [x * 100.0 for x in r_decimal]
    var = sum(x * x for x in r) / len(r)
    v0 = var  # backcast: the sample variance of the estimation window
    if start is None:
        start = [var * 0.05, 0.08, 0.90] + ([6.0] if dist == "t" else [])
    # Search in a reparameterised space so the simplex stays inside the
    # constraints: omega = exp(a), alpha = s(b)*s(c)... kept simple: logs and
    # logits of alpha and beta/(1-alpha), nu = 2.05 + exp(d).
    def to_params(x):
        omega = math.exp(x[0])
        alpha = 1 / (1 + math.exp(-x[1])) * 0.9999
        beta = (0.9999 - alpha) / (1 + math.exp(-x[2]))
        out = [omega, alpha, beta]
        if dist == "t":
            out.append(2.05 + math.exp(x[3]))
        return out

    def from_params(p):
        omega, alpha, beta = p[:3]
        a = alpha / 0.9999
        x1 = math.log(a / (1 - a))
        b = beta / (0.9999 - alpha)
        x2 = math.log(b / (1 - b))
        x = [math.log(omega), x1, x2]
        if dist == "t":
            x.append(math.log(p[3] - 2.05))
        return x

    f = lambda x: _nll(to_params(x), r, dist, v0)
    x0 = from_params(start)
    best_x, best_f, converged, iters = nelder_mead(f, x0, [0.5] * len(x0))
    # A restart from the optimum guards against an early collapse of the simplex
    best_x, best_f, converged2, iters2 = nelder_mead(f, best_x, [0.1] * len(x0))
    p = to_params(best_x)
    omega_pct, alpha, beta = p[:3]
    persistence = alpha + beta
    # The search caps alpha + beta at 0.9999, so a fit that wants more lands
    # *on* the cap and reads 0.99989999…: compared with 0.9999 it passed. A fit
    # within 1.5e-5 of the cap is a boundary fit (amendment 1) and is rejected.
    boundary = persistence >= 0.99985
    ok = converged2 and math.isfinite(best_f) and not boundary and omega_pct > 0
    out = {
        "dist": dist,
        "omega": omega_pct / 1e4,  # percent^2 -> decimal^2
        "alpha": alpha,
        "beta": beta,
        "persistence": persistence,
        "loglik_pct": -best_f,
        "n": len(r),
        "converged": bool(converged2),
        "iterations": iters + iters2,
        "ok": bool(ok),
        "boundary": bool(boundary),
        "omega_pct": omega_pct,
        "v0_pct": v0,
    }
    if dist == "t":
        out["nu"] = p[3]
    return out


# ── EWMA and the rolling window ─────────────────────────────────────────
def ewma_filter(r, lam, v0):
    v = [0.0] * len(r)
    cur = v0
    for i, x in enumerate(r):
        v[i] = cur
        cur = lam * cur + (1 - lam) * x * x
    return v, cur


def qlike(v, r):
    """Mean QLIKE in the form robust to a zero proxy: r²/v + log v."""
    return sum(x * x / s + math.log(s) for s, x in zip(v, r)) / len(r)


def fit_ewma(r, grid=None):
    grid = grid or [0.80 + 0.005 * i for i in range(40)]  # 0.80 … 0.995
    v0 = sum(x * x for x in r[:500]) / min(500, len(r))
    burn = 200
    best = None
    for lam in grid:
        v, _ = ewma_filter(r, lam, v0)
        score = qlike(v[burn:], r[burn:])
        if best is None or score < best[1]:
            best = (lam, score)
    return {"lambda": best[0], "qlike": best[1]}


def _ewma_t_nll(lam, nu, r, v0):
    if not (0.8 < lam < 0.9995) or not (2.05 < nu <= 500.0):
        return float("inf")
    const = math.lgamma((nu + 1) / 2) - math.lgamma(nu / 2) - 0.5 * math.log(math.pi * (nu - 2))
    k = (nu + 1) / 2
    nm2 = nu - 2
    cur = v0
    total = 0.0
    for x in r:
        total += const - 0.5 * math.log(cur) - k * math.log(1 + x * x / (cur * nm2))
        cur = lam * cur + (1 - lam) * x * x
    return -total


def fit_ewma_t(r_decimal):
    """EWMA-t (amendment 1): lambda and nu by maximum likelihood with
    standardized-t innovations. The integrated recursion has no unconditional
    variance, and none is used; v0 is the window's own sample variance."""
    r = [x * 100.0 for x in r_decimal]
    v0 = sum(x * x for x in r) / len(r)
    to = lambda x: (0.8 + 0.1995 / (1 + math.exp(-x[0])), 2.05 + math.exp(x[1]))
    f = lambda x: _ewma_t_nll(*to(x), r, v0)
    x0 = [math.log((0.97 - 0.8) / (0.9995 - 0.97)), math.log(4.0)]
    bx, bf, c1, i1 = nelder_mead(f, x0, [0.5, 0.5])
    bx, bf, c2, i2 = nelder_mead(f, bx, [0.1, 0.1])
    lam, nu = to(bx)
    return {"lambda": lam, "nu": nu, "converged": bool(c2), "ok": bool(c2 and math.isfinite(bf)), "loglik_pct": -bf, "iterations": i1 + i2}
