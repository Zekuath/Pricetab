#!/usr/bin/env bash
# Copies the web app into ios/WebApp for the bundle, adds the phone shim to
# index.html, and builds the app icon set from the extension's icon.
# Run it again whenever src/ changes; then build in Xcode.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # ios/
ROOT="$(cd "$HERE/.." && pwd)"             # the extension
OUT="$HERE/WebApp"

rm -rf "$OUT"
mkdir -p "$OUT/assets"
cp -R "$ROOT/src" "$OUT/src"
cp -R "$ROOT/vendor" "$OUT/vendor"
cp -R "$ROOT/_locales" "$OUT/_locales"
cp -R "$ROOT/assets/icons" "$OUT/assets/icons"
cp "$HERE/webshim/ios.js" "$OUT/ios.js"

# index.html: the viewport covers the notch, and the shim loads first.
python3 - "$ROOT/index.html" "$OUT/index.html" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()
html = html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />',
)
assert "viewport-fit=cover" in html, "viewport meta not found"
first = re.search(r'\n(\s*)<script src="\./src/', html)
assert first, "no src script tag"
indent = first.group(1)
html = html[: first.start()] + "\n" + indent + '<script src="./ios.js"></script>' + html[first.start():]
open(dst, "w", encoding="utf-8").write(html)
print("index.html: shim added")
PY

# The app icon: one 1024px universal image, which Xcode 14+ accepts alone.
ICONSET="$HERE/PriceTab/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$ICONSET"
sips -z 1024 1024 "$ROOT/assets/icons/icon.png" --out "$ICONSET/AppIcon.png" >/dev/null
cat > "$ICONSET/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "AppIcon.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON
cat > "$HERE/PriceTab/Assets.xcassets/Contents.json" <<'JSON'
{ "info" : { "author" : "xcode", "version" : 1 } }
JSON

# The widget's own catalogue holds only its background colour name.
WSET="$HERE/PriceTabWidget/Assets.xcassets"
mkdir -p "$WSET/WidgetBackground.colorset"
cat > "$WSET/Contents.json" <<'JSON'
{ "info" : { "author" : "xcode", "version" : 1 } }
JSON
cat > "$WSET/WidgetBackground.colorset/Contents.json" <<'JSON'
{
  "colors" : [
    { "color" : { "color-space" : "srgb", "components" : { "alpha" : "1.000", "blue" : "1.000", "green" : "1.000", "red" : "1.000" } }, "idiom" : "universal" },
    { "appearances" : [ { "appearance" : "luminosity", "value" : "dark" } ], "color" : { "color-space" : "srgb", "components" : { "alpha" : "1.000", "blue" : "0.000", "green" : "0.000", "red" : "0.000" } }, "idiom" : "universal" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

echo "WebApp ready: $(du -sh "$OUT" | cut -f1)"
