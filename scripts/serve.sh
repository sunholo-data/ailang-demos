#!/usr/bin/env bash
# Assemble _site/ from multiple source directories and serve locally.
# Mirrors what CI does, but uses symlinks for fast iteration.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$REPO_ROOT/_site"
PORT="${1:-8080}"

echo "Assembling site in $SITE ..."
rm -rf "$SITE"
mkdir -p "$SITE"

# Hub page
cp "$REPO_ROOT/site/index.html" "$SITE/"

# WASM demos (rename index.html → extractor.html)
# Use symlinks for css/, js/, wasm/, ailang/, assets/ so edits are live
for item in css js wasm ailang assets sunholo-logo.svg; do
  [ -e "$REPO_ROOT/invoice_processor_wasm/$item" ] && \
    ln -s "$REPO_ROOT/invoice_processor_wasm/$item" "$SITE/$item"
done
# Copy HTML files (rename index → extractor)
cp "$REPO_ROOT/invoice_processor_wasm/index.html" "$SITE/extractor.html"
for f in docparse.html verify.html contracts-ai.html; do
  [ -f "$REPO_ROOT/invoice_processor_wasm/$f" ] && \
    cp "$REPO_ROOT/invoice_processor_wasm/$f" "$SITE/$f"
done

# Streaming demos
mkdir -p "$SITE/streaming/shared"
ln -s "$REPO_ROOT/streaming/shared/audio-worklet.js" "$SITE/streaming/shared/"
ln -s "$REPO_ROOT/streaming/shared/nav.js" "$SITE/streaming/shared/"
for demo in claude_chat gemini_live safe_agent transcription voice_analytics voice_docparse voice_pipeline; do
  mkdir -p "$SITE/streaming/$demo"
  ln -s "$REPO_ROOT/streaming/$demo/browser/index.html" "$SITE/streaming/$demo/index.html"
done

echo ""
echo "Site assembled. Serving at http://localhost:$PORT/"
echo "  Hub:       http://localhost:$PORT/"
echo "  Extractor: http://localhost:$PORT/extractor.html"
echo "  DocParse:  http://localhost:$PORT/docparse.html"
echo "  Streaming: http://localhost:$PORT/streaming/"
echo ""
echo "Press Ctrl+C to stop."
cd "$SITE" && python3 -m http.server "$PORT"
