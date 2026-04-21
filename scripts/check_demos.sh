#!/usr/bin/env bash
# Type-check every demo entry point with `ailang check`.
# Cheap smoke test — no API keys, no runtime, just the compiler's verdict.
#
# Usage:
#   scripts/check_demos.sh            # check all demos, exit 1 if any fail
#   scripts/check_demos.sh --verbose  # print full ailang output for failures
#   scripts/check_demos.sh --only streaming  # only entries matching substring
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERBOSE=false
FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose|-v) VERBOSE=true; shift ;;
    --only) FILTER="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! command -v ailang >/dev/null 2>&1; then
  echo "error: ailang not in PATH — install from https://github.com/sunholo-data/ailang" >&2
  exit 2
fi

# Relax strict module-name ↔ file-path matching. Several demos are loaded in
# the browser under a different module name than their repo path (e.g.
# co-presenter/, wasm/invoice_processor.ail). Type/effect checking still runs.
export AILANG_RELAX_MODULES=1

# Demo entry points. Relative to repo root. Keep in sync with CLAUDE.md.
# Excluded on purpose: bug_repro/, _archive/, invoice_processor_wasm/ailang/ (symlinks).
ENTRIES=(
  # Streaming
  streaming/test_sse.ail
  streaming/test_stream_basic.ail
  streaming/claude_chat/main.ail
  streaming/safe_agent/main.ail
  streaming/gemini_live/main.ail
  streaming/gemini_live/gemini_live_browser.ail
  streaming/voice_docparse/main.ail
  streaming/ambient_assistant/main.ail
  streaming/ambient_assistant/ambient_browser.ail
  # DocParse — note: parser modules now live in sunholo/ailang-parse.
  # Only the browser adapter + bug_repro remain here; nothing to check.
  # Ecommerce
  ecommerce/main.ail
  ecommerce/bigquery_demo.ail
  ecommerce/contracts_demo.ail
  ecommerce/trusted_analytics_demo.ail
  ecommerce/pipeline_runner.ail
  # Website builder
  website_builder/main.ail
  # Verify / contracts showcase
  verify_demo/main.ail
  verify_demo/verify_showcase.ail
  # LinkedIn
  linkedin/main.ail
  # Co-presenter (browser-only, but should still type-check)
  co-presenter/co_presenter.ail
  # Invoice processor WASM
  wasm/invoice_processor.ail
)

pass=0
fail=0
skip=0
failed_entries=()

printf "%-55s %s\n" "ENTRY" "RESULT"
printf "%-55s %s\n" "-----" "------"

for entry in "${ENTRIES[@]}"; do
  if [[ -n "$FILTER" && "$entry" != *"$FILTER"* ]]; then
    continue
  fi
  if [[ ! -e "$entry" ]]; then
    printf "%-55s %s\n" "$entry" "SKIP (missing)"
    skip=$((skip + 1))
    continue
  fi

  output=$(ailang check "$entry" 2>&1)
  status=$?
  # ailang check prints a stdlib version warning even on success; the real signal
  # is the "✓ No errors found!" line or a non-zero exit.
  if [[ $status -eq 0 ]] && grep -q "No errors found" <<<"$output"; then
    printf "%-55s %s\n" "$entry" "PASS"
    pass=$((pass + 1))
  else
    printf "%-55s %s\n" "$entry" "FAIL"
    fail=$((fail + 1))
    failed_entries+=("$entry")
    if $VERBOSE; then
      echo "----- $entry -----"
      echo "$output" | sed 's/^/    /'
      echo "-----"
    fi
  fi
done

echo
echo "Summary: $pass pass, $fail fail, $skip skipped"

if [[ $fail -gt 0 ]]; then
  echo
  echo "Failed entries:"
  printf '  %s\n' "${failed_entries[@]}"
  echo
  echo "Re-run with --verbose to see ailang output."
  exit 1
fi
exit 0
