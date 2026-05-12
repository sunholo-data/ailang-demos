#!/usr/bin/env bash
# Run the LinkedIn pure-function tests. Exit non-zero on any FAIL.
#
# Why a bash wrapper around ailang run? AILANG's inline `tests [...]` syntax
# has a known harness bug on functions that call imported stdlib, so we use a
# main() that prints PASS/FAIL lines and grep them here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Filter AILANG's runtime preamble; keep only PASS/FAIL/sectioning lines.
output="$(ailang run --entry main --caps IO linkedin/tests/test_pure.ail 2>&1 \
  | grep -E '^(PASS:|FAIL:|── )' || true)"

if [ -z "$output" ]; then
  echo "test_pure.ail produced no output — likely a runtime error. Re-run:"
  echo "  ailang run --entry main --caps IO linkedin/tests/test_pure.ail"
  exit 2
fi

echo "$output"

pass="$(echo "$output" | grep -c '^PASS:' || true)"
fail="$(echo "$output" | grep -c '^FAIL:' || true)"
echo ""
echo "Summary: ${pass} passed, ${fail} failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
