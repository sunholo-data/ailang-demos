#!/usr/bin/env bash
# Add a user to the AILANG ecommerce BigQuery demo.
# Grants Firebase test-user access + BigQuery Job User IAM role.
#
# Usage:
#   bash scripts/add-demo-user.sh user@gmail.com
#   bash scripts/add-demo-user.sh user1@gmail.com user2@example.com
#
# Prerequisites:
#   - gcloud CLI authenticated with owner/editor on ailang-dev
#   - Firebase CLI: npm install -g firebase-tools && firebase login
set -euo pipefail

PROJECT="ailang-dev"
BQ_ROLE="roles/bigquery.jobUser"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <email> [email ...]"
  echo ""
  echo "Adds users to the AILANG ecommerce BigQuery demo:"
  echo "  1. Grants BigQuery Job User role on $PROJECT (run queries)"
  echo "  2. Prints reminder to add as OAuth test user in Firebase Console"
  echo ""
  echo "Example: $0 alice@gmail.com bob@example.com"
  exit 1
fi

for EMAIL in "$@"; do
  echo "━━━ Adding $EMAIL ━━━"

  # 1. Grant BigQuery Job User IAM role
  echo "  Granting $BQ_ROLE on $PROJECT ..."
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="user:$EMAIL" \
    --role="$BQ_ROLE" \
    --condition=None \
    --quiet \
    --format="none" 2>&1 | sed 's/^/  /'

  echo "  BigQuery IAM: OK"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MANUAL STEP: Add these users as OAuth test users in Firebase Console:"
echo ""
echo "  https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT"
echo ""
echo "  1. Open the link above"
echo "  2. Scroll to 'Test users' section"
echo "  3. Click '+ Add Users'"
echo "  4. Add:"
for EMAIL in "$@"; do
  echo "     - $EMAIL"
done
echo ""
echo "  5. Click 'Save'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
