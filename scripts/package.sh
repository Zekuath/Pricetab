#!/usr/bin/env bash
# Build the Chrome Web Store upload from the working tree.
#
# Why a script rather than "zip the folder": the tracked tree is asset-heavy —
# docs, tests, mockups, screenshots, promotional art, previous releases — and a
# hand-made archive is one drag away from shipping any of it. Every one of
# those is either dead weight in the package or something that should not be
# published at all. So the archive is built from an allowlist, and the
# allowlist is checked against what `index.html` actually loads: a new src file
# that nobody added here would be missing from the upload and the extension
# would break for everyone on the store, not on the machine that built it.
#
# Produces both forms, side by side:
#   assets/upload/pricetab-<version>/       the unpacked folder (Load unpacked)
#   assets/upload/pricetab-<version>.zip    the archive the dashboard takes
#
# Dependency-free: bash, zip, and the tools macOS and Linux already have.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)"
[ -n "$VERSION" ] || { echo "could not read version from manifest.json" >&2; exit 1; }

OUT="assets/upload/pricetab-$VERSION"
ZIP="$OUT.zip"

# What ships. Anything not named here is not in the extension.
FILES=(
  manifest.json
  index.html
  privacy.html
  rate.html
  LICENSE
)
DIRS=(
  src
  vendor
)
# Only the icons the manifest actually names. `assets/icons/` also holds the
# source art and the 512 used for store listings, and neither is loaded by the
# extension — shipping them is dead weight in every install.
ICONS=(
  assets/icons/icon16.png
  assets/icons/icon48.png
  assets/icons/icon128.png
)

echo "PriceTab $VERSION"

# ── The allowlist has to agree with the page ────────────────────────────
# `index.html` names its scripts in load order; a file it loads that is not in
# `src/` (or a `src/` file it does not load) is a packaging bug either way.
missing=0
while IFS= read -r ref; do
  [ -f "$ref" ] || { echo "  ! index.html loads $ref, which is not in the tree"; missing=1; }
done < <(grep -oE '(src|href)="\./[^"]+"' index.html | sed 's/.*"\.\///;s/"$//')
[ "$missing" -eq 0 ] || { echo "refusing to package an index.html that cannot load" >&2; exit 1; }

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
done
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || { echo "missing $d/" >&2; exit 1; }
done
for f in "${ICONS[@]}"; do
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
done

# ── Stage ───────────────────────────────────────────────────────────────
rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"
for f in "${FILES[@]}"; do
  cp "$f" "$OUT/"
done
for d in "${DIRS[@]}"; do
  mkdir -p "$OUT/$d"
  # -R rather than a glob: `vendor/fonts/` is a directory and has to come too
  cp -R "$d/." "$OUT/$d/"
done
mkdir -p "$OUT/assets/icons"
for f in "${ICONS[@]}"; do
  cp "$f" "$OUT/assets/icons/"
done

# Nothing the operating system left behind, and no editor droppings
find "$OUT" \( -name '.DS_Store' -o -name '*.orig' -o -name '*.rej' -o -name '*~' \) -delete

# ── Archive ─────────────────────────────────────────────────────────────
( cd "$(dirname "$OUT")" && zip -qr "$(basename "$ZIP")" "$(basename "$OUT")" -x '*.DS_Store' )

# ── Say what was built, so it can be checked before it is uploaded ──────
echo
echo "  folder : $OUT"
echo "  archive: $ZIP  ($(du -h "$ZIP" | cut -f1))"
echo
echo "  contents:"
( cd "$OUT" && find . -type f | sed 's|^\./|    |' | sort )
echo
echo "  files: $(find "$OUT" -type f | wc -l | tr -d ' ')"
echo
echo "Load unpacked → $ROOT/$OUT"
