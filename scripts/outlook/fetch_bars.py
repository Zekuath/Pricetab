#!/usr/bin/env python3
"""Download completed hourly bars for the model outlook, with a manifest.

    python3 scripts/outlook/fetch_bars.py                 # BTC-USD, Coinbase Exchange
    python3 scripts/outlook/fetch_bars.py --until 2026-10-01T00:00:00Z

Standard library only (no numpy/pandas): the pipeline is meant to be rerun on a
bare Python 3. The source is the Coinbase Exchange candles endpoint the
extension already reads (`api.exchange.coinbase.com`, no new host): granularity
3600, at most 300 candles a request, rows `[time, low, high, open, close,
volume]`, and "no data is published for intervals where there are no ticks"
(official docs, read 2026-10-01). A bar is the hour starting at `time`; its
close is the last trade in that hour. Only bars that had *ended* before
`--until` are kept, so the file never holds an incomplete hour.

Output (local research data, git-ignored with docs/internal/):
    docs/internal/research/outlook-data/<product>-3600.csv   time,open,high,low,close,volume
    docs/internal/research/outlook-data/<product>-3600.manifest.json
The manifest records the endpoint, the request window, the fetch time, row
counts, duplicates dropped, gaps found, and a SHA-256 of the CSV, so a later
fit can say exactly which data it saw.
"""
import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "internal", "research", "outlook-data")
API = "https://api.exchange.coinbase.com/products/{product}/candles?granularity={g}&start={start}&end={end}"
G = 3600
PAGE = 300


def iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url, tries=6):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pricetab-outlook-research"})
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode("utf-8"))
        except Exception as error:  # 429s and timeouts: back off and retry
            wait = 1.5 * (attempt + 1)
            sys.stderr.write(f"  retry {attempt + 1} after {error} ({wait:.1f}s)\n")
            time.sleep(wait)
    raise RuntimeError(f"gave up on {url}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--product", default="BTC-USD")
    ap.add_argument("--since", default="2016-01-01T00:00:00Z")
    ap.add_argument("--until", default=None, help="exclusive; default: the start of the current hour")
    args = ap.parse_args()

    now = int(time.time())
    until = int(datetime.strptime(args.until, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()) if args.until else now - now % G
    since = int(datetime.strptime(args.since, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
    os.makedirs(OUT, exist_ok=True)

    rows = {}
    duplicates = 0
    requests = 0
    end = until
    while end > since:
        start = max(since, end - PAGE * G)
        # The endpoint's end is inclusive of the bar starting at `end`; ask
        # for bars starting in [start, end - G].
        body = get(API.format(product=args.product, g=G, start=iso(start), end=iso(end - G)))
        requests += 1
        for r in body if isinstance(body, list) else []:
            t, low, high, opn, close, vol = (float(x) for x in r[:6])
            t = int(t)
            if t % G or not (since <= t and t + G <= until):
                continue  # misaligned, or an hour that had not ended
            if not all(v > 0 for v in (low, high, opn, close)) or not low <= min(opn, close) <= max(opn, close) <= high:
                continue
            if t in rows:
                duplicates += 1
            rows[t] = (t, opn, high, low, close, vol)
        end = start
        time.sleep(0.26)  # well under the public limit

    times = sorted(rows)
    gaps = []
    for a, b in zip(times, times[1:]):
        if b - a > G:
            gaps.append({"after": iso(a), "missing_hours": (b - a) // G - 1})
    csv_path = os.path.join(OUT, f"{args.product}-{G}.csv")
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["time", "open", "high", "low", "close", "volume"])
        for t in times:
            w.writerow(rows[t])
    digest = hashlib.sha256(open(csv_path, "rb").read()).hexdigest()
    manifest = {
        "schema": "pricetab.outlook.bars/1",
        "source": "Coinbase Exchange public REST, /products/{product}/candles",
        "endpoint": API.split("?")[0].format(product=args.product),
        "product": args.product,
        "venue": "Coinbase Exchange (spot)",
        "quote": args.product.split("-")[1],
        "granularity_s": G,
        "bar": "hour starting at `time` (UTC); close = last trade in the hour",
        "window": {"since": iso(since), "until_exclusive": iso(until)},
        "fetched_at": iso(now),
        "requests": requests,
        "rows": len(times),
        "first": iso(times[0]) if times else None,
        "last": iso(times[-1]) if times else None,
        "duplicates_dropped": duplicates,
        "gaps": len(gaps),
        "missing_hours": sum(g["missing_hours"] for g in gaps),
        "largest_gaps": sorted(gaps, key=lambda g: -g["missing_hours"])[:20],
        "csv": os.path.relpath(csv_path, ROOT),
        "csv_sha256": digest,
    }
    with open(os.path.join(OUT, f"{args.product}-{G}.manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps({k: manifest[k] for k in ("rows", "first", "last", "gaps", "missing_hours", "duplicates_dropped", "requests")}))


if __name__ == "__main__":
    main()
