#!/usr/bin/env bash
set -euo pipefail

# Minimal OAuth callback catcher using netcat.
# Listens on localhost:8080, captures the ?code= from LinkedIn's redirect.
# No Python, no dependencies — just bash + nc.

PORT="${1:-8080}"

echo "Listening on http://localhost:$PORT/callback for OAuth redirect..."
echo "Waiting for LinkedIn to redirect back..."
echo ""

# Listen for one request, extract the code
RESPONSE_BODY="<html><body style='font-family:system-ui;padding:40px;text-align:center'><h1>OAuth Success!</h1><p>Code captured. Check your terminal.</p></body></html>"

REQUEST=$(echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${#RESPONSE_BODY}\r\nConnection: close\r\n\r\n${RESPONSE_BODY}" | nc -l "$PORT" 2>/dev/null | head -1)

# Extract code from GET /callback?code=XXX&state=YYY HTTP/1.1
CODE=$(echo "$REQUEST" | grep -oP 'code=\K[^& ]+' 2>/dev/null || echo "")

if [ -z "$CODE" ]; then
  # Try macOS grep (no -P flag)
  CODE=$(echo "$REQUEST" | sed -n 's/.*code=\([^& ]*\).*/\1/p')
fi

if [ -n "$CODE" ]; then
  echo "=== OAuth Code Captured ==="
  echo "$CODE"
  echo ""
  echo "$CODE" > /tmp/linkedin_oauth_code.txt
  echo "Code saved to /tmp/linkedin_oauth_code.txt"
  echo ""
  echo "Now run:"
  echo "  linkedin/scripts/exchange-token.sh YOUR_CLIENT_ID YOUR_CLIENT_SECRET"
else
  echo "Error: Could not extract code from request:"
  echo "$REQUEST"
  exit 1
fi
