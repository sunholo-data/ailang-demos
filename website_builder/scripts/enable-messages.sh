#!/usr/bin/env bash
# Enable the coordinator/messages build path for a specific user.
#
# Usage:
#   ./website_builder/scripts/enable-messages.sh mark@sunholo.com
#   ./website_builder/scripts/enable-messages.sh mark@sunholo.com mum@gmail.com
#   ./website_builder/scripts/enable-messages.sh --list          # show enabled users
#   ./website_builder/scripts/enable-messages.sh --disable mark@sunholo.com
#
# Defaults to the prod website_builder project. Override with:
#   WEBSITE_BUILDER_PROJECT=ailang-multivac-dev ./enable-messages.sh ...
#   WEBSITE_BUILDER_PROJECT=ailang-multivac-test ./enable-messages.sh ...
#
# Prerequisites:
#   - gcloud CLI authenticated with Firestore access
#   - User must have signed in to the portal at least once (creates Firebase Auth account)
#
# What it does:
#   1. Looks up the user's Firebase UID by email
#   2. Sets messagesEnabled=true in their Firestore doc (users/{uid})
#   3. Firestore security rules prevent users from changing this themselves

set -euo pipefail

PROJECT="${WEBSITE_BUILDER_PROJECT:-ailang-multivac}"
DATABASE="website-builder"
FIRESTORE_BASE="https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents"

# Get access token once
TOKEN=$(gcloud auth print-access-token 2>/dev/null) || {
  echo "Error: gcloud auth failed. Run: gcloud auth application-default login"
  exit 1
}

lookup_uid() {
  local email="$1"
  # Use Identity Platform REST API to find user by email
  local resp
  resp=$(curl -s -X POST \
    "https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-goog-user-project: ${PROJECT}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":[\"${email}\"]}" 2>/dev/null)

  local uid
  uid=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('users',[{}])[0].get('localId',''))" 2>/dev/null)

  if [ -z "$uid" ]; then
    echo ""
    return
  fi
  echo "$uid"
}

set_messages_enabled() {
  local uid="$1"
  local enabled="$2"  # true or false

  curl -s -X PATCH \
    "${FIRESTORE_BASE}/users/${uid}?updateMask.fieldPaths=messagesEnabled" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-goog-user-project: ${PROJECT}" \
    -H "Content-Type: application/json" \
    -d "{\"fields\":{\"messagesEnabled\":{\"booleanValue\":${enabled}}}}" \
    > /dev/null
}

list_enabled_users() {
  echo "Users with messagesEnabled=true:"
  echo ""

  local resp
  resp=$(curl -s -X POST \
    "${FIRESTORE_BASE}:runQuery" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-goog-user-project: ${PROJECT}" \
    -H "Content-Type: application/json" \
    -d '{
      "structuredQuery": {
        "from": [{"collectionId": "users"}],
        "where": {
          "fieldFilter": {
            "field": {"fieldPath": "messagesEnabled"},
            "op": "EQUAL",
            "value": {"booleanValue": true}
          }
        }
      }
    }')

  echo "$resp" | python3 -c "
import sys, json
docs = json.load(sys.stdin)
for item in docs:
    doc = item.get('document', {})
    if not doc:
        continue
    name = doc.get('name', '')
    uid = name.split('/')[-1] if name else '?'
    fields = doc.get('fields', {})
    email = fields.get('geminiApiKey', {}).get('stringValue', '')  # no email stored, show UID
    print(f'  UID: {uid}')
if not any(item.get('document') for item in docs):
    print('  (none)')
" 2>/dev/null || echo "  (failed to query — check permissions)"
}

# ── Main ──────────────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  echo "Usage: enable-messages.sh [--list] [--disable] <email> [email...]"
  exit 1
fi

DISABLE=false
if [ "$1" = "--list" ]; then
  list_enabled_users
  exit 0
elif [ "$1" = "--disable" ]; then
  DISABLE=true
  shift
fi

for email in "$@"; do
  uid=$(lookup_uid "$email")
  if [ -z "$uid" ]; then
    echo "  ✗ ${email} — not found (user must sign in to the portal first)"
    continue
  fi

  if [ "$DISABLE" = true ]; then
    set_messages_enabled "$uid" "false"
    echo "  ✓ ${email} (${uid}) — messages DISABLED"
  else
    set_messages_enabled "$uid" "true"
    echo "  ✓ ${email} (${uid}) — messages ENABLED"
  fi
done
