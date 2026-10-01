# Changelog

Notable user-visible changes are recorded here.

## Unreleased

### Added

- Chart zoom, pan, keyboard reading, a permanent price scale and time axis,
  finer candles for narrow windows, drawing tools and a ruler.
- Optional chart studies, pattern and strategy annotations, indicator overlays,
  CPI release markers and image export.
- Portfolio activity and holding-detail views, monthly time-weighted returns,
  dated income records, additional portfolio charts and a country tax guide
  based on official sources.
- A full derivatives practice page with contract candles, order book, movable
  layout, resting and scaled orders, order history and per-order stops and
  take-profits.
- Saved news items, day and coverage views, additional sources, exchange
  notices and source controls under Settings → Permissions.
- A colour-blind direction palette and keyboard access to chart data.
- A navigator of the whole range while the chart is zoomed, zooming out past a
  range into the next one, and two-finger pinch on touch screens.

### Changed

- Panels now use separate left and right tab columns; Settings, News and Base
  rates use full-screen layouts.
- The chart, portfolio, derivatives page and widget drawer were reorganized for
  clearer controls and narrow screens.
- Background requests, cache reuse and news polling were reduced.
- Light-theme direction colours and portfolio colours were adjusted for
  contrast and clearer meaning.

### Fixed

- Chart scales, labels, candles, targets and comparison data stay aligned
  across range, theme and chart-type changes; labels inside the chart no
  longer print over each other, and the pointer's label no longer repeats the
  time shown on the axis.
- On a phone, the targets and calls sheets start below the price instead of
  cutting through it and scroll as one page, so an empty list is readable;
  the target form's Add button, the widget size buttons and the two edge
  pulls are finger-sized.
- News sources recover correctly from timeouts, permission changes and stale
  refreshes.
- Portfolio lot, purchase and income updates remain consistent with holdings.
- Derivatives orders, fills, funding, layout and narrow-screen controls no
  longer overlap or report the wrong state.

## 1.3.0 — released August 2026

- Added persistent price caching, faster startup, provider fallback and chart
  performance improvements.

## 1.2.1

- Added settings polish, auto-rotation and the optional news ticker.

## 1.2.0

- Added watchlist and market widgets, top movers and reliability improvements.

## 1.1.1

- Improved privacy, performance and responsive layout.

## 1.1.0

- Added the widget system and additional market data.

## 1.0.0

- Initial Chrome Web Store release.
