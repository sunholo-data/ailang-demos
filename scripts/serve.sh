#!/usr/bin/env bash
# Assemble _site/ from multiple source directories and serve locally.
# Mirrors what CI does, but uses symlinks for fast iteration.
#
# Usage:
#   scripts/serve.sh                  # serve on port 8080
#   scripts/serve.sh --port 3000      # custom port
#   scripts/serve.sh --build          # rebuild website builder portal first
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$REPO_ROOT/_site"
PORT=8080
BUILD_WB=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)  PORT="$2"; shift 2 ;;
    --build) BUILD_WB=true; shift ;;
    *)       PORT="$1"; shift ;;  # positional arg = port
  esac
done

# Kill any existing server on the target port
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "Killing existing process on port $PORT ..."
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

echo "Assembling site in $SITE ..."
rm -rf "$SITE"
mkdir -p "$SITE"

# Hub page + assets
cp "$REPO_ROOT/site/index.html" "$SITE/"
for svg in "$REPO_ROOT"/site/*.svg; do
  [ -f "$svg" ] && cp "$svg" "$SITE/"
done

# Thumbnails for hub page cards
[ -d "$REPO_ROOT/site/thumbnails" ] && ln -s "$REPO_ROOT/site/thumbnails" "$SITE/thumbnails"

# Shared WASM runtime (top-level, used by all demos)
ln -s "$REPO_ROOT/wasm" "$SITE/wasm"

# WASM demos (rename index.html → extractor.html)
# Use symlinks for css/, js/, ailang/, assets/ so edits are live
for item in css js ailang assets; do
  [ -e "$REPO_ROOT/invoice_processor_wasm/$item" ] && \
    ln -s "$REPO_ROOT/invoice_processor_wasm/$item" "$SITE/$item"
done
# sunholo-logo.svg may already exist from site/ copy — use -sf
[ -e "$REPO_ROOT/invoice_processor_wasm/sunholo-logo.svg" ] && \
  [ ! -e "$SITE/sunholo-logo.svg" ] && \
  ln -s "$REPO_ROOT/invoice_processor_wasm/sunholo-logo.svg" "$SITE/sunholo-logo.svg"
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
cp "$REPO_ROOT/streaming/index.html" "$SITE/streaming/" 2>/dev/null || true
ln -s "$REPO_ROOT/streaming/shared/audio-worklet.js" "$SITE/streaming/shared/"
ln -s "$REPO_ROOT/streaming/shared/gemini-live-core.js" "$SITE/streaming/shared/"
ln -s "$REPO_ROOT/streaming/shared/streaming-ui.js" "$SITE/streaming/shared/"
ln -s "$REPO_ROOT/streaming/shared/ailang-logo.svg" "$SITE/streaming/shared/" 2>/dev/null || true
for demo in claude_chat gemini_live safe_agent voice_docparse ambient_assistant; do
  if [ -f "$REPO_ROOT/streaming/$demo/browser/index.html" ]; then
    mkdir -p "$SITE/streaming/$demo"
    ln -s "$REPO_ROOT/streaming/$demo/browser/index.html" "$SITE/streaming/$demo/index.html"
  fi
done

# Ecommerce landing page (CLI demo — no WASM)
mkdir -p "$SITE/ecommerce"
ln -s "$REPO_ROOT/ecommerce/browser/index.html" "$SITE/ecommerce/index.html"
ln -s "$REPO_ROOT/ecommerce/img" "$SITE/ecommerce/img"

# Website Builder portal
if [ "$BUILD_WB" = true ] && [ -f "$REPO_ROOT/website_builder/portal/package.json" ]; then
  echo "Building website builder portal..."
  (cd "$REPO_ROOT/website_builder/portal" && npm install --silent && npm run build --silent)
fi
mkdir -p "$SITE/website_builder"
if [ -d "$REPO_ROOT/website_builder/portal/dist" ]; then
  # Copy built SPA assets
  cp -r "$REPO_ROOT/website_builder/portal/dist/"* "$SITE/website_builder/"
  # Persona avatars (not in dist due to copyPublicDir: false)
  cp -r "$REPO_ROOT/website_builder/portal/public/avatars" "$SITE/website_builder/avatars"
  # WASM runtime needed by the portal
  mkdir -p "$SITE/website_builder/wasm"
  ln -sf "$REPO_ROOT/wasm/wasm_exec.js" "$SITE/website_builder/wasm/"
  ln -sf "$REPO_ROOT/wasm/ailang-repl.js" "$SITE/website_builder/wasm/"
  ln -sf "$REPO_ROOT/wasm/ailang.wasm" "$SITE/website_builder/wasm/"
  # AILANG modules fetched at runtime from ailang/ (relative to portal root)
  mkdir -p "$SITE/website_builder/ailang/website_builder/types"
  mkdir -p "$SITE/website_builder/ailang/website_builder/services"
  ln -sf "$REPO_ROOT/website_builder/types/"*.ail "$SITE/website_builder/ailang/website_builder/types/"
  ln -sf "$REPO_ROOT/website_builder/services/"*.ail "$SITE/website_builder/ailang/website_builder/services/"
  # DocParse modules (used by website builder for document parsing)
  mkdir -p "$SITE/website_builder/ailang/docparse/types"
  mkdir -p "$SITE/website_builder/ailang/docparse/services"
  ln -sf "$REPO_ROOT/docparse/types/"*.ail "$SITE/website_builder/ailang/docparse/types/"
  ln -sf "$REPO_ROOT/docparse/services/"*.ail "$SITE/website_builder/ailang/docparse/services/"
fi

# DocParse hub
if [ -f "$REPO_ROOT/docparse/site/index.html" ]; then
  mkdir -p "$SITE/document-intelligence"
  cp "$REPO_ROOT/docparse/site/index.html" "$SITE/document-intelligence/"
fi

# Shared design system CSS
mkdir -p "$SITE/shared"
cp "$REPO_ROOT/site/shared/design-system.css" "$SITE/shared/" 2>/dev/null || true
cp "$REPO_ROOT/site/shared/design-system.css" "$SITE/streaming/shared/" 2>/dev/null || true

# Streaming AILANG modules (for WASM demos)
mkdir -p "$SITE/ailang/streaming/gemini_live"
ln -sf "$REPO_ROOT/streaming/gemini_live/gemini_live_browser.ail" \
  "$SITE/ailang/streaming/gemini_live/gemini_live_browser.ail"

# Ambient Assistant AILANG modules
mkdir -p "$SITE/ailang/streaming/ambient_assistant"
ln -sf "$REPO_ROOT/streaming/ambient_assistant/ambient_browser.ail" \
  "$SITE/ailang/streaming/ambient_assistant/ambient_browser.ail"

# Claude Chat AILANG modules (SSE demo)
mkdir -p "$SITE/ailang/streaming/claude_chat/types"
mkdir -p "$SITE/ailang/streaming/claude_chat/services"
ln -sf "$REPO_ROOT/streaming/claude_chat/types/claude_types.ail" \
  "$SITE/ailang/streaming/claude_chat/types/claude_types.ail"
ln -sf "$REPO_ROOT/streaming/claude_chat/services/claude_sse.ail" \
  "$SITE/ailang/streaming/claude_chat/services/claude_sse.ail"
ln -sf "$REPO_ROOT/streaming/claude_chat/services/claude_chat_browser.ail" \
  "$SITE/ailang/streaming/claude_chat/services/claude_chat_browser.ail"

# Safe Agent AILANG modules (contract-verified tools)
mkdir -p "$SITE/ailang/streaming/safe_agent/types"
mkdir -p "$SITE/ailang/streaming/safe_agent/services"
ln -sf "$REPO_ROOT/streaming/safe_agent/types/agent_types.ail" \
  "$SITE/ailang/streaming/safe_agent/types/agent_types.ail"
ln -sf "$REPO_ROOT/streaming/safe_agent/services/verified_tools.ail" \
  "$SITE/ailang/streaming/safe_agent/services/verified_tools.ail"
ln -sf "$REPO_ROOT/streaming/safe_agent/services/safe_agent_browser.ail" \
  "$SITE/ailang/streaming/safe_agent/services/safe_agent_browser.ail"
ln -sf "$REPO_ROOT/streaming/safe_agent/services/business_tools.ail" \
  "$SITE/ailang/streaming/safe_agent/services/business_tools.ail"
ln -sf "$REPO_ROOT/streaming/safe_agent/services/business_browser.ail" \
  "$SITE/ailang/streaming/safe_agent/services/business_browser.ail"

echo ""
echo "Site assembled. Serving at http://localhost:$PORT/"
echo "  Hub:       http://localhost:$PORT/"
echo "  Extractor: http://localhost:$PORT/extractor.html"
echo "  DocParse:  http://localhost:$PORT/docparse.html"
echo "  Ecommerce: http://localhost:$PORT/ecommerce/"
echo "  Website:   http://localhost:$PORT/website_builder/"
echo "  Streaming: http://localhost:$PORT/streaming/"
echo "  Ambient:   http://localhost:$PORT/streaming/ambient_assistant/"
echo ""
echo "Press Ctrl+C to stop."
cd "$SITE" && python3 -m http.server "$PORT"
