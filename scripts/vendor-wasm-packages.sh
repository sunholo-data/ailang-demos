#!/usr/bin/env bash
# vendor-wasm-packages.sh — Copy AILANG package .ail files into the WASM-serving
# directory so browser demos can fetch them via HTTP.
#
# Usage:
#   scripts/vendor-wasm-packages.sh [TARGET_DIR]
#
# TARGET_DIR defaults to _site/ailang/pkg (for serve.sh) but CI can override
# to invoice_processor_wasm/ailang/pkg for deployment.
#
# Reads ailang.lock to determine which packages/versions to vendor,
# then copies from the registry cache (~/.ailang/cache/registry/).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$REPO_ROOT/_site/ailang/pkg}"
LOCK="$REPO_ROOT/ailang.lock"
CACHE_ROOT="${AILANG_CACHE:-$HOME/.ailang/cache/registry}"

if [ ! -f "$LOCK" ]; then
  echo "No ailang.lock found at $LOCK — run 'ailang lock' first" >&2
  exit 1
fi

# Parse JSON lock file for package entries: "name"+"version" fields
# Uses python3 (available on macOS + CI) to extract name@version pairs
PACKAGES=$(python3 -c "
import json, sys
with open('$LOCK') as f:
    lock = json.load(f)
for pkg in lock.get('packages', []):
    print(pkg['name'] + '@' + pkg['version'])
" 2>/dev/null || true)

if [ -z "$PACKAGES" ]; then
  echo "No packages found in $LOCK" >&2
  exit 0
fi

echo "Vendoring AILANG packages for WASM..."

for entry in $PACKAGES; do
  PKG_NAME="${entry%@*}"    # e.g. sunholo/gemini_live
  PKG_VER="${entry#*@}"     # e.g. 0.3.0
  CACHE_DIR="$CACHE_ROOT/$PKG_NAME/$PKG_VER"

  if [ ! -d "$CACHE_DIR" ]; then
    echo "  WARN: cache miss for $PKG_NAME@$PKG_VER at $CACHE_DIR" >&2
    echo "  Run 'ailang lock' to populate the cache" >&2
    continue
  fi

  # Create target directory mirroring pkg/ import path
  PKG_DIR="$TARGET/$PKG_NAME"
  rm -rf "$PKG_DIR"
  mkdir -p "$PKG_DIR"

  # Copy only .ail files
  count=0
  for f in "$CACHE_DIR"/*.ail; do
    [ -f "$f" ] || continue
    cp "$f" "$PKG_DIR/"
    count=$((count + 1))
  done

  echo "  $PKG_NAME@$PKG_VER — $count modules → $PKG_DIR"
done

echo "Done."
