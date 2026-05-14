#!/usr/bin/env bash
# grep_missed_signals.sh — fetch each URL and scan against an extended
# pattern set (broader synonyms than the live rubric). Output shows
# which signals would fire under broader vocabulary — drives the
# Phase-3 broadening decisions.
#
# Usage: grep_missed_signals.sh <url> [<url> ...]
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <url> [<url> ...]" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:115.0) Gecko/20100101 Firefox/115.0"

i=0
for url in "$@"; do
  i=$((i + 1))
  out="$WORK/page_$i.html"
  /usr/bin/curl -sfL -A "$UA" "$url" -o "$out" -w "  fetched: %{http_code} %{size_download} bytes (%{url_effective})\n"
  echo "$url" > "$WORK/page_$i.url"
done

python3 << 'PYEOF'
import re, os, glob
from pathlib import Path

work = os.environ.get('WORK') or sorted(glob.glob('/tmp/tmp.*'))[-1]

CURRENT = {
    'agent.json':  [r'/\.well-known/agent\.json', r'agent\.json"', r"agent\.json'"],
    'openapi':     [r'openapi\.json', r'openapi\.yaml', r'swagger', r'redoc', r'api specification', r'postman collection'],
    'mcp':         [r'/mcp/', r'/mcp/sse', r'mcp-server', r'model context protocol'],
    'api-docs':    [r'api documentation', r'/api/docs', r'developers\.', r'/docs/api', r'api reference'],
    'webhooks':    [r'webhook', r'/webhooks', r'callback url', r'callback_url', r' callback', r'event subscription'],
    'rate-limit':  [r'rate limit', r'rate-limit', r'x-ratelimit', r'429', r'throttl'],
    'streaming':   [r'server-sent events', r'text/event-stream', r'/sse', r'eventsource', r'streaming endpoint', r'real-time api', r'websocket api'],
    'sandbox':     [r'\bsandbox\b', r'test mode', r'test environment'],
    'auth':        [r'oauth ?2', r'\bjwt\b', r'bearer token', r'access token', r'api key', r'client credentials'],
    'idempotency': [r'idempoten\w*'],
    'e2ee':        [r'end-to-end encryption', r'e2ee', r'zero-knowledge', r'client-side encryption'],
    'certs':       [r'soc ?2', r'iso 27001', r'gdpr', r'hipaa', r'ccpa'],
    'data-min':    [r'we do not sell', r"we don't sell", r'no third-party', r'privacy-first', r'data minimi[sz]ation'],
}

EXTENDED = {
    'streaming+': [r'realtime api', r'stream api', r'real-time updates'],
    'sse+':       [r'\bsse\b'],
    'webhooks+':  [r'notifications? api', r'event notification'],
    'auth+':      [r'\bsso\b', r'mtls', r'mutual tls'],
    'cert+':      [r'fedramp', r'pci dss'],
    'data-min+':  [r'no third party sharing', r'we never sell', r'no data sharing'],
}

import glob as g
for p in sorted(Path(work).glob('page_*.html')):
    url = (p.parent / (p.stem + '.url')).read_text().strip()
    body = p.read_text(errors='replace').lower()
    if len(body) < 500:
        print(f'\n=== {url} ({len(body)} bytes — blocked/404) ===')
        continue
    print(f'\n=== {url} ({len(body):,} chars) ===')
    for name, pats in CURRENT.items():
        hits = sum(len(re.findall(p, body)) for p in pats)
        mark = '✓' if hits else '·'
        print(f'  {mark} {name:13s} {hits:>4}')
    extended_hits = []
    for name, pats in EXTENDED.items():
        hits = sum(len(re.findall(p, body)) for p in pats)
        if hits:
            extended_hits.append(f'    + {name}: {hits}')
    if extended_hits:
        print('  EXTENDED (not in live rubric):')
        for line in extended_hits:
            print(line)
PYEOF
