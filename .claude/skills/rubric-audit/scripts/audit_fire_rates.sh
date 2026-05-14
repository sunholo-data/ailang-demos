#!/usr/bin/env bash
# audit_fire_rates.sh — measure per-signal fire rates across every
# rendered sketch. Pulls the (name, detected, points, max) tuples
# from each sketch's rubric breakdown table and tabulates them.
#
# Output bucketed by fire rate:
#   - Always firing (100%)       → signal collapsed, no discrimination
#   - Never firing (0%)          → vocabulary too narrow, or moonshot
#   - Healthy discriminators     → 15–60% fire rate
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"

python3 << 'PYEOF'
import re
from pathlib import Path
from collections import defaultdict

rows = defaultdict(list)

for h in sorted(Path('site/linkedin/topics').glob('*/*/index.html')):
    if h.parent.name == '' or 'leaderboard' in h.parent.name:
        continue
    html = h.read_text()
    score_m = re.search(r'<span class="sk-readiness-num">(\d+)/10</span>', html)
    score = int(score_m.group(1)) if score_m else None
    for tr in re.finditer(
        r'<tr>\s*<td>([^<]+)</td>\s*<td>([^<]+)</td>\s*<td class="sig-(ok|no)">[^<]+</td>\s*<td>(\d+)/(\d+)</td>',
        html):
        sig_name, sig_topic, sig_class, pts, mx = tr.groups()
        rows[sig_name].append({
            'topic': sig_topic,
            'page_score': score,
            'detected': sig_class == 'ok',
            'points': int(pts),
            'max': int(mx),
        })

print(f'\nFire-rate audit across {sum(len(v) for v in rows.values()) // max(1, len(rows))} sketches × {len(rows)} signals\n')
print(f'{"Signal":42s}  Fired  Total  Rate    Mean pts/max  Bucket')
print('─' * 92)

def bucket(rate):
    if rate == 1.0: return 'COLLAPSED — always fires, drop or tighten'
    if rate == 0.0: return 'DEAD — never fires, broaden or drop'
    if 0.15 <= rate <= 0.60: return 'healthy discriminator'
    if rate < 0.15: return 'narrow — consider broadening'
    return 'high but not 100% — OK'

for sig, hits in sorted(rows.items(), key=lambda x: -sum(h['detected'] for h in x[1]) / max(1, len(x[1]))):
    n = len(hits)
    fired = sum(h['detected'] for h in hits)
    rate = fired / n if n else 0
    avg_pts = sum(h['points'] for h in hits) / n if n else 0
    mx = hits[0]['max'] if hits else 0
    print(f'{sig:42s}  {fired:>5}/{n:<3}  {rate*100:>4.0f}%   {avg_pts:.1f}/{mx}          {bucket(rate)}')
PYEOF
