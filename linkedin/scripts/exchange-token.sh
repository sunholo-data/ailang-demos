#!/usr/bin/env bash
set -euo pipefail

# Exchange LinkedIn OAuth authorization code for access + refresh tokens.
# Uses AILANG for the HTTP call + JSON parsing (dogfooding the demo).
#
# Usage: ./exchange-token.sh <client_id> <client_secret> [code]
# If code is omitted, reads from /tmp/linkedin_oauth_code.txt

CLIENT_ID="${1:?Usage: exchange-token.sh <client_id> <client_secret> [code]}"
CLIENT_SECRET="${2:?Usage: exchange-token.sh <client_id> <client_secret> [code]}"
CODE="${3:-}"

if [ -z "$CODE" ]; then
  if [ -f /tmp/linkedin_oauth_code.txt ]; then
    CODE="$(cat /tmp/linkedin_oauth_code.txt)"
    echo "Read code from /tmp/linkedin_oauth_code.txt"
  else
    echo "Error: No code provided and /tmp/linkedin_oauth_code.txt not found."
    echo "Run oauth-callback.sh first, or pass the code as argument 3."
    exit 1
  fi
fi

ORG_URN="${LINKEDIN_ORG_URN:-urn:li:organization:99524184}"

echo "Exchanging authorization code for tokens..."
echo "Client ID: $CLIENT_ID"
echo "Org URN:   $ORG_URN"
echo ""

# Resolve script location
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_DIR"

# Use AILANG to do the token exchange
LINKEDIN_OAUTH_CODE="$CODE" \
LINKEDIN_CLIENT_ID="$CLIENT_ID" \
LINKEDIN_CLIENT_SECRET="$CLIENT_SECRET" \
LINKEDIN_ORG_URN="$ORG_URN" \
ailang run --entry main --caps IO,FS,Net,Env \
  linkedin/scripts/oauth_exchange.ail

echo ""
echo "Test with: linkedin status"

# Cleanup
rm -f /tmp/linkedin_oauth_code.txt
