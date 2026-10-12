# PriceTab for iPhone

This directory contains an experimental iPhone wrapper around the same web app
that powers the Chrome extension. It is not part of the Chrome Web Store build
and is not a supported App Store release.

The app serves a generated copy of the web UI from the bundle in a `WKWebView`.
A small JavaScript-to-Swift bridge adapts notifications, keeps the native
status area in sync with the selected theme, and shares the page's cached coin
prices with a WidgetKit widget. User data remains in the web view's persistent
local storage; the widget receives only the coin list and last cached quotes.

## Requirements

- macOS with Xcode and the iOS 17 SDK
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)
- `sips` and Python 3, both used by the web-app preparation script
- an Apple development team only when building for a physical device

## Build locally

From the repository root:

```bash
./ios/scripts/build-webapp.sh
cd ios
xcodegen generate
open PriceTab.xcodeproj
```

Choose the `PriceTab` scheme and an iPhone simulator. For a device build, set a
development team for both targets in Xcode and make sure the App Group
`group.com.pricetab.app` is available to that team.

Run `build-webapp.sh` again whenever the extension's `src/`, `vendor/`, locale,
icon, or `index.html` files change. `ios/WebApp/`, the generated Xcode project,
asset catalogues, and build products are intentionally ignored; `project.yml`
and the source directories are the source of truth.

## Layout

| Path | Role |
|---|---|
| `project.yml` | XcodeGen project definition for the app and widget targets |
| `PriceTab/` | SwiftUI shell, custom URL scheme, web view, notification bridge |
| `PriceTabWidget/` | WidgetKit presentation |
| `Shared/` | Snapshot model and App Group persistence shared by both targets |
| `webshim/ios.js` | Browser-API adaptation loaded before the web app |
| `scripts/build-webapp.sh` | Rebuilds the ignored `WebApp/` bundle and app icons |

## Platform differences

- Chrome host permissions do not exist on iOS. News sources that require them
  are refused by the shim; permission-free sources continue to work.
- Alarm notifications use iOS notification permission through the native
  bridge. They are still opt-in.
- External links open in Safari.
- The widget shows the last quotes received while the app was open; it does not
  run an independent market-data client.

The Chrome extension remains the release target. Treat this directory as a
prototype until signing, device behaviour, accessibility, privacy disclosures,
and App Store review requirements have been verified for a specific release.
