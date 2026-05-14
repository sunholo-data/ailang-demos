#!/usr/bin/env bash
# show_leaderboards.sh — pretty-print the three topic leaderboards.
# Healthy spread is 0-10 range with ≥3 distinct scores per topic.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"

for t in agent-ready privacy portable; do
  echo ""
  echo "═══ $t ═══"
  python3 -c "
import json
d = json.load(open('site/linkedin/topics/$t/leaderboard.json'))
for e in d['entries']:
    print(f\"  #{e['rank']:2}  {e['registrableDomain']:35s} {e['score']}/10\")
scores = [e['score'] for e in d['entries']]
print(f\"     spread: {min(scores) if scores else 0}-{max(scores) if scores else 0}, {len(set(scores))} distinct values, {len(scores)} entries\")
"
done
