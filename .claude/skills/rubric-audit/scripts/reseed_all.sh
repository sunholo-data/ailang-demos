#!/usr/bin/env bash
# reseed_all.sh — re-run the full 30-URL seed under the current rubric.
# Memory-safe: six batches of 5 with AILANG_TRACE=off, fresh process
# per batch so the OS reclaims RAM between runs.
#
# Optional argv[1] = date string for the snapshot header (default today).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"

DATE="${1:-$(date +%Y-%m-%d)}"

echo "Re-seeding all 30 sketches for $DATE in 6 batches of 5 (AILANG_TRACE=off)..."
echo ""

for slice in "0 5" "5 10" "10 15" "15 20" "20 25" "25 30"; do
  start="${slice% *}"
  end="${slice#* }"
  echo "──────── slice [$start, $end) ────────"
  AILANG_TRACE=off GOOGLE_API_KEY="" ailang run \
    --entry main --caps IO,Env,Net,FS,AI,Process \
    --ai gemini-2.5-flash \
    linkedin/sketch_seed_main.ail "$DATE" "$start" "$end" 2>&1 | tail -8
  echo ""
done

echo "All 30 re-seeded. Leaderboard JSONs rebuilt after the last batch."
echo "Inspect with: .claude/skills/rubric-audit/scripts/show_leaderboards.sh"
