#!/usr/bin/env bash
# Detect stale wasm/ailang.wasm vs the upstream AILANG source repo.
#
# Background: the browser demos in this repo embed wasm/ailang.wasm, but the
# AILANG language + parser + type-checker evolves in /Users/mark/dev/sunholo/ailang
# (or wherever $AILANG_SRC points). When the .ail source files here use syntax
# the OLD wasm doesn't understand, the browser repl.loadModule() can HANG the
# main thread silently — page freezes, no error, no console output. This script
# catches the drift before serve.sh starts so users get a loud warning instead.
#
# Usage:
#   scripts/check-wasm-freshness.sh              # warn-only
#   scripts/check-wasm-freshness.sh --rebuild    # rebuild via make build-wasm in source repo
#
# Exit codes:
#   0  WASM is up to date (or rebuild succeeded)
#   1  WASM is stale (warn-only mode)
#   2  Could not locate AILANG source repo
#   3  Rebuild failed

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM_PATH="$REPO_ROOT/wasm/ailang.wasm"
REBUILD=false
QUIET=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild) REBUILD=true; shift ;;
    --quiet)   QUIET=true;   shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Resolve the AILANG source repo. Priority:
#   1. $AILANG_SRC env var
#   2. ../ailang relative to this repo (most common dev layout)
#   3. $HOME/dev/sunholo/ailang (mark's default)
if [[ -n "${AILANG_SRC:-}" && -d "$AILANG_SRC" ]]; then
  SRC="$AILANG_SRC"
elif [[ -d "$REPO_ROOT/../ailang" ]]; then
  SRC="$(cd "$REPO_ROOT/../ailang" && pwd)"
elif [[ -d "$HOME/dev/sunholo/ailang" ]]; then
  SRC="$HOME/dev/sunholo/ailang"
else
  if [[ "$QUIET" == "false" ]]; then
    echo "⚠  AILANG source repo not found (set \$AILANG_SRC, or place it at ../ailang)."
    echo "   Skipping wasm freshness check. Old wasm may hang the browser on newer .ail files."
  fi
  exit 2
fi

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
DIM='\033[0;90m'
BOLD='\033[1m'
RESET='\033[0m'

if [[ ! -f "$WASM_PATH" ]]; then
  echo -e "${RED}${BOLD}✗ wasm/ailang.wasm is MISSING.${RESET}"
  if [[ "$REBUILD" == "true" ]]; then
    echo "  Rebuilding from $SRC ..."
  else
    echo "  Re-run with --rebuild to build it, or copy from $SRC/bin/ailang.wasm."
    exit 1
  fi
fi

# WASM age: file mtime
if [[ -f "$WASM_PATH" ]]; then
  WASM_MTIME=$(stat -f %m "$WASM_PATH" 2>/dev/null || stat -c %Y "$WASM_PATH" 2>/dev/null)
fi

# Source repo HEAD commit time — proxy for "last possible source change"
SRC_HEAD_TIME=$(cd "$SRC" && git log -1 --format=%ct 2>/dev/null || echo 0)
SRC_HEAD_SHA=$(cd "$SRC" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
SRC_DIRTY=$(cd "$SRC" && git diff --quiet 2>/dev/null && echo "clean" || echo "DIRTY (uncommitted changes)")

# Pull the AILANG version stamped into the WASM by `make build-wasm` via
# -ldflags. We embedded "internal/version.Version" so the binary contains
# the exact CLI describe at build time. Scan for the well-known shape.
# Falls back to mtime-based heuristic if no stamp is found.
WASM_VER=""
if [[ -f "$WASM_PATH" ]]; then
  # The ldflags stamp looks like e.g. "v0.20.1-54-g61412cbe" — a v + semver +
  # optional dev suffix. Restrict to that exact shape so we don't pick up
  # stray version strings from Go stdlib deps (net/http v0.276.0 etc.).
  WASM_VER=$(strings "$WASM_PATH" 2>/dev/null \
    | grep -oE 'v0\.[0-9]+\.[0-9]+-[0-9]+-g[0-9a-f]+(-dirty)?' \
    | sort -u | head -1 || echo "")
  # No dev-tagged build? Try a plain release tag (v0.X.Y exact).
  if [[ -z "$WASM_VER" ]]; then
    WASM_VER=$(strings "$WASM_PATH" 2>/dev/null \
      | grep -oE 'v0\.(20|21|22|23|24|25)\.[0-9]+' \
      | sort -V -u | tail -1 || echo "")
  fi
fi

# CLI version is what we want the WASM to track. If ailang is installed,
# trust its --version. Otherwise derive from the source repo's git describe.
if command -v ailang >/dev/null 2>&1; then
  CLI_VER=$(ailang --version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9a-z.-]+)?' | head -1 || echo "")
  CLI_VER="${CLI_VER#v}"  # strip leading v if present
  CLI_VER="v$CLI_VER"
else
  CLI_VER=$(cd "$SRC" && git describe --tags --always 2>/dev/null || echo "unknown")
fi

# Decide: is the wasm stale?
# Two signals:
#   (a) Source HEAD commit is NEWER than the wasm binary mtime.
#   (b) The CLI's installed version differs from the highest version marker
#       in the wasm binary.
STALE=false
REASONS=()

if [[ "$SRC_HEAD_TIME" -gt "$WASM_MTIME" ]]; then
  STALE=true
  AGE_SEC=$(( SRC_HEAD_TIME - WASM_MTIME ))
  AGE_HUMAN=""
  if   [[ $AGE_SEC -lt 3600 ]];   then AGE_HUMAN="$((AGE_SEC / 60))m"
  elif [[ $AGE_SEC -lt 86400 ]];  then AGE_HUMAN="$((AGE_SEC / 3600))h"
  else                                  AGE_HUMAN="$((AGE_SEC / 86400))d"
  fi
  REASONS+=("source repo HEAD ($SRC_HEAD_SHA, $SRC_DIRTY) is $AGE_HUMAN newer than wasm/ailang.wasm")
fi

# Strip the leading v + the suffix after the patch number for comparison.
strip_ver() { echo "${1#v}" | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+' || true; }
WASM_BASE=$(strip_ver "$WASM_VER")
CLI_BASE=$(strip_ver "$CLI_VER")
if [[ -n "$WASM_BASE" && -n "$CLI_BASE" && "$WASM_BASE" != "$CLI_BASE" ]]; then
  STALE=true
  REASONS+=("wasm contains $WASM_VER but CLI is $CLI_VER")
fi

if [[ "$STALE" == "false" ]]; then
  if [[ "$QUIET" == "false" ]]; then
    echo -e "${GREEN}✓ wasm/ailang.wasm is up to date${RESET} ${DIM}(wasm: $WASM_VER · cli: $CLI_VER · src HEAD: $SRC_HEAD_SHA)${RESET}"
  fi
  exit 0
fi

# Stale — print a loud diagnostic.
echo
echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${RED}${BOLD}⚠  STALE wasm/ailang.wasm DETECTED${RESET}"
echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo
for r in "${REASONS[@]}"; do
  echo -e "  ${YELLOW}•${RESET} $r"
done
echo
echo -e "  ${BOLD}Why this matters:${RESET} the browser repl.loadModule() can hang"
echo -e "  the main thread silently when .ail source uses syntax the wasm doesn't"
echo -e "  yet support. Page freezes with no console error, no banner — just dead."
echo
echo -e "  ${BOLD}Fix:${RESET} rebuild the wasm:"
echo -e "    ${DIM}cd $SRC && make build-wasm && cp bin/ailang.wasm $REPO_ROOT/wasm/ailang.wasm${RESET}"
echo -e "  or re-run this with ${BOLD}--rebuild${RESET}:"
echo -e "    ${DIM}$0 --rebuild${RESET}"
echo

if [[ "$REBUILD" == "true" ]]; then
  echo -e "${YELLOW}Rebuilding now via make build-wasm in $SRC ...${RESET}"
  if (cd "$SRC" && make build-wasm) 2>&1 | sed 's/^/    /'; then
    cp "$SRC/bin/ailang.wasm" "$WASM_PATH"
    NEW_VER=$(strings "$WASM_PATH" 2>/dev/null | grep -oE 'v0\.[0-9]+\.[0-9]+' | sort -V | tail -1)
    echo -e "${GREEN}${BOLD}✓ wasm rebuilt and copied${RESET} ${DIM}(now contains $NEW_VER)${RESET}"
    exit 0
  else
    echo -e "${RED}${BOLD}✗ Rebuild failed.${RESET} See output above."
    exit 3
  fi
fi

exit 1
