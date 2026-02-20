#!/usr/bin/env bash
# Assemble _site/ from multiple source directories and serve locally.
# Mirrors what CI does, but uses symlinks for fast iteration.
# Usage: bash scripts/serve.sh [port]  (default: 8888)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$REPO_ROOT/_site"
PORT="${1:-8888}"

# Kill any existing server on the target port
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "Killing existing process on port $PORT ..."
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

echo "Assembling site in $SITE ..."
rm -rf "$SITE"
mkdir -p "$SITE"

# Hub page
cp "$REPO_ROOT/site/index.html" "$SITE/"

# Shared WASM runtime (top-level, used by all demos)
ln -s "$REPO_ROOT/wasm" "$SITE/wasm"

# WASM demos (rename index.html → extractor.html)
# Use symlinks for css/, js/, ailang/, assets/ so edits are live
for item in css js ailang assets sunholo-logo.svg; do
  [ -e "$REPO_ROOT/invoice_processor_wasm/$item" ] && \
    ln -s "$REPO_ROOT/invoice_processor_wasm/$item" "$SITE/$item"
done
# Demo-specific AILANG module alongside WASM runtime
[ -f "$REPO_ROOT/invoice_processor_wasm/wasm/invoice_processor.ail" ] && \
  ln -sf "$REPO_ROOT/invoice_processor_wasm/wasm/invoice_processor.ail" "$SITE/wasm/"
# Copy HTML files (rename index → extractor)
cp "$REPO_ROOT/invoice_processor_wasm/index.html" "$SITE/extractor.html"
for f in docparse.html verify.html contracts-ai.html; do
  [ -f "$REPO_ROOT/invoice_processor_wasm/$f" ] && \
    cp "$REPO_ROOT/invoice_processor_wasm/$f" "$SITE/$f"
done

# Streaming demos
mkdir -p "$SITE/streaming/shared"
ln -s "$REPO_ROOT/streaming/shared/audio-worklet.js" "$SITE/streaming/shared/"
ln -s "$REPO_ROOT/streaming/shared/gemini-live-core.js" "$SITE/streaming/shared/"
for demo in claude_chat gemini_live safe_agent voice_docparse; do
  mkdir -p "$SITE/streaming/$demo"
  ln -s "$REPO_ROOT/streaming/$demo/browser/index.html" "$SITE/streaming/$demo/index.html"
done

# Ecommerce landing page (CLI demo — no WASM)
mkdir -p "$SITE/ecommerce"
ln -s "$REPO_ROOT/ecommerce/browser/index.html" "$SITE/ecommerce/index.html"
ln -s "$REPO_ROOT/ecommerce/img" "$SITE/ecommerce/img"

# Streaming AILANG modules (for WASM demos)
mkdir -p "$SITE/ailang/streaming/gemini_live"
ln -sf "$REPO_ROOT/streaming/gemini_live/gemini_live_browser.ail" \
  "$SITE/ailang/streaming/gemini_live/gemini_live_browser.ail"

echo ""
echo "Site assembled. Serving at http://localhost:$PORT/"
echo "  Hub:       http://localhost:$PORT/"
echo "  Extractor: http://localhost:$PORT/extractor.html"
echo "  DocParse:  http://localhost:$PORT/docparse.html"
echo "  Ecommerce: http://localhost:$PORT/ecommerce/"
echo "  Streaming: http://localhost:$PORT/streaming/"
echo ""
echo "Press Ctrl+C to stop."
cd "$SITE" && python3 -m http.server "$PORT"
