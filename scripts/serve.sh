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

# Pre-flight: the embedded wasm/ailang.wasm must match the AILANG source repo,
# otherwise browser repl.loadModule() can hang silently on newer .ail syntax.
# This was a debugging nightmare on 2026-05-20 — added the check so it can't
# recur silently. Pass --rebuild-wasm to auto-rebuild before serving.
WASM_REBUILD_ARGS=()
if [[ "${REBUILD_WASM:-false}" == "true" ]]; then
  WASM_REBUILD_ARGS=("--rebuild")
fi
"$REPO_ROOT/scripts/check-wasm-freshness.sh" "${WASM_REBUILD_ARGS[@]}" || {
  status=$?
  if [[ "$status" -eq 1 ]]; then
    echo "⚠  Continuing anyway — set REBUILD_WASM=true scripts/serve.sh to auto-rebuild."
  elif [[ "$status" -eq 2 ]]; then
    echo "ℹ  No AILANG source repo found — using existing wasm/ailang.wasm as-is."
  fi
}

echo "Assembling site in $SITE ..."
rm -rf "$SITE"
mkdir -p "$SITE"

# Hub page + assets — copy every top-level site/*.html
for html in "$REPO_ROOT"/site/*.html; do
  [ -f "$html" ] && cp "$html" "$SITE/"
done
for svg in "$REPO_ROOT"/site/*.svg; do
  [ -f "$svg" ] && cp "$svg" "$SITE/"
done

# site/linkedin/ — copy (not symlink) so we can layer in comments.json without
# polluting the source tree. Re-run scripts/serve.sh to pick up edits.
if [ -d "$REPO_ROOT/site/linkedin" ]; then
  mkdir -p "$SITE/linkedin"
  cp -R "$REPO_ROOT/site/linkedin/." "$SITE/linkedin/"
  # Overlay the latest comments JSON if it exists
  [ -f "$REPO_ROOT/linkedin/data/comments.json" ] && \
    cp "$REPO_ROOT/linkedin/data/comments.json" "$SITE/linkedin/comments.json"
  # Expose the sketch template directory for visual iteration —
  # symlinked so edits to linkedin/templates/sketch.html show on reload.
  if [ -d "$REPO_ROOT/linkedin/templates" ]; then
    ln -sfn "$REPO_ROOT/linkedin/templates" "$SITE/linkedin/templates"
  fi
  # Expose generated sketch topic galleries — symlinked so newly
  # generated sketches appear immediately under /linkedin/topics/<topic>/.
  if [ -d "$REPO_ROOT/site/linkedin/topics" ]; then
    ln -sfn "$REPO_ROOT/site/linkedin/topics" "$SITE/linkedin/topics"
  fi
fi

# Any other site/*/ sub-pages — symlink for live editing
for sub in "$REPO_ROOT"/site/*/; do
  name="$(basename "$sub")"
  case "$name" in thumbnails|shared|linkedin) continue ;; esac
  ln -sfn "$sub" "$SITE/$name"
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

# Cognitive Commons — multi-tab debating society
# Browser demo references ../wasm/ (the top-level symlink at $SITE/wasm)
# and ../invoice_processor_wasm/js/ailang-wrapper.js. The latter is the
# shared AilangEngine wrapper that all WASM demos use.
ln -sfn "$REPO_ROOT/cognitive_commons" "$SITE/cognitive_commons"
mkdir -p "$SITE/invoice_processor_wasm"
ln -sfn "$REPO_ROOT/invoice_processor_wasm/js" "$SITE/invoice_processor_wasm/js"

# Vendor AILANG package modules (for WASM pkg/ imports)
# Runs early because website_builder and docparse both link to vendored files.
"$REPO_ROOT/scripts/vendor-wasm-packages.sh" "$SITE/ailang/pkg"

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
  # Sourced from the vendored sunholo/ailang_parse registry package.
  VENDORED_DOCPARSE="$SITE/ailang/pkg/sunholo/ailang_parse/docparse"
  if [ -d "$VENDORED_DOCPARSE" ]; then
    mkdir -p "$SITE/website_builder/ailang/docparse"
    ln -sf "$VENDORED_DOCPARSE/types" "$SITE/website_builder/ailang/docparse/types"
    ln -sf "$VENDORED_DOCPARSE/services" "$SITE/website_builder/ailang/docparse/services"
  fi
  VENDORED_PKG="$SITE/ailang/pkg"
  if [ -d "$VENDORED_PKG" ]; then
    mkdir -p "$SITE/website_builder/ailang"
    ln -sfn "$VENDORED_PKG" "$SITE/website_builder/ailang/pkg"
  fi
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

# Co-Presenter
mkdir -p "$SITE/co-presenter"
ln -sf "$REPO_ROOT/co-presenter/index.html" "$SITE/co-presenter/index.html"
mkdir -p "$SITE/ailang/co_presenter"
ln -sf "$REPO_ROOT/co-presenter/co_presenter.ail" "$SITE/ailang/co_presenter/co_presenter.ail"

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
echo "  Co-Present:http://localhost:$PORT/co-presenter/"
echo ""
echo "Press Ctrl+C to stop."
# ThreadingHTTPServer instead of the default single-threaded http.server:
# the cognitive_commons + invoice_processor demos load a ~40MB ailang.wasm
# AND parallel small .ail module fetches in the same boot. Single-threaded
# http.server wedges on a 40MB transfer if a second concurrent request lands
# during the stream — every subsequent request returns "Empty reply from
# server" until the process is killed. Threaded variant handles each request
# in its own thread; the WASM transfer no longer blocks the small fetches.
cd "$SITE" && exec python3 -c "
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import sys
ThreadingHTTPServer(('', int(sys.argv[1])), SimpleHTTPRequestHandler).serve_forever()
" "$PORT"
