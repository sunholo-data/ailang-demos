#!/usr/bin/env bash
# Check Firestore data for the website-builder database.
# Uses ADC (Application Default Credentials) — run `gcloud auth application-default login` first.
#
# Usage:
#   ./check-firestore.sh                       # list recent sites (prod, default)
#   ./check-firestore.sh sites [UID]           # list sites (optionally for a specific user)
#   ./check-firestore.sh rules                 # show local rules file
#   ./check-firestore.sh deploy-rules          # deploy rules from firestore.rules
#
# Override the target project with WEBSITE_BUILDER_PROJECT:
#   WEBSITE_BUILDER_PROJECT=ailang-multivac-dev ./check-firestore.sh
#   WEBSITE_BUILDER_PROJECT=ailang-multivac-test ./check-firestore.sh

set -euo pipefail

PROJECT="${WEBSITE_BUILDER_PROJECT:-ailang-multivac}"
DATABASE="website-builder"
RULES_FILE="$(dirname "$0")/../firestore.rules"

# Get access token from ADC
TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token 2>/dev/null)
BASE="https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents"

fetch_sites() {
  local filter="${1:-}"
  local url="${BASE}/sites?pageSize=20"
  local result
  result=$(curl -s -H "Authorization: Bearer $TOKEN" "$url")

  echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
docs = data.get('documents', [])
if not docs:
    print('  (no sites found)')
    sys.exit(0)
for doc in docs:
    f = doc.get('fields', {})
    name = doc['name'].split('/')[-1]
    title = f.get('title', {}).get('stringValue', '—')
    owner = f.get('ownerUid', {}).get('stringValue', '—')
    builder = f.get('builderName', {}).get('stringValue', '')
    updated = f.get('updatedAt', {}).get('timestampValue', '')
    created = f.get('createdAt', {}).get('timestampValue', '')
    ts = updated or created or '—'
    # Filter by owner if requested
    if '${filter}' and owner != '${filter}':
        continue
    builder_str = f' [{builder}]' if builder else ''
    print(f'  {name:50s}  {title[:40]:40s}{builder_str:20s}  {ts}')
" 2>/dev/null || echo "  (failed to parse response)"
}

case "${1:-sites}" in
  sites)
    OWNER_UID="${2:-}"
    echo "=== Firestore Sites ($PROJECT / $DATABASE) ==="
    echo ""
    fetch_sites "$OWNER_UID"
    ;;

  rules)
    echo "=== Local Firestore Rules ==="
    if [ -f "$RULES_FILE" ]; then
      cat "$RULES_FILE"
    else
      echo "(not found at $RULES_FILE)"
    fi
    echo ""
    echo "Deploy with: $0 deploy-rules"
    echo "Or view live: https://console.firebase.google.com/project/$PROJECT/firestore/rules"
    ;;

  deploy-rules)
    if [ ! -f "$RULES_FILE" ]; then
      echo "Rules file not found: $RULES_FILE"
      exit 1
    fi
    echo "Deploying rules from: $RULES_FILE"
    echo "Project: $PROJECT | Database: $DATABASE"
    echo ""
    # Named databases need --only firestore:<database-name>, NOT firestore:rules
    npx firebase-tools deploy --only "firestore:${DATABASE}" --project "$PROJECT" --force
    ;;

  *)
    echo "Usage: $0 [sites [UID] | rules | deploy-rules]"
    ;;
esac
