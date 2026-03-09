#!/usr/bin/env bash
# Deploy the Website Builder to Cloud Run (Terraform-managed infrastructure).
#
# Builds the image via Cloud Build and updates the existing Cloud Run service.
# Infrastructure (SA, secrets, IAM) is managed by ailang-multivac Terraform.
#
# Usage:
#   ./website_builder/scripts/deploy.sh          # deploy to dev (default)
#   ./website_builder/scripts/deploy.sh test      # deploy to test
#   ./website_builder/scripts/deploy.sh prod      # deploy to prod
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Cloud Build SA: sa-cloudbuild@multivac-deploy.iam.gserviceaccount.com

set -euo pipefail

ENV="${1:-dev}"

case "$ENV" in
  dev)  PROJECT="ailang-multivac-dev";  PREFIX="ailang-dev"  ;;
  test) PROJECT="ailang-multivac-test"; PREFIX="ailang-test" ;;
  prod) PROJECT="ailang-multivac";      PREFIX="ailang"      ;;
  *)    echo "Unknown environment: $ENV (use dev/test/prod)"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTAL_DIR="$(cd "$SCRIPT_DIR/../portal" && pwd)"
REGION="europe-west1"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/ailang/website-builder:latest"
SERVICE="${PREFIX}-website-builder"
CB_SA="projects/multivac-deploy/serviceAccounts/sa-cloudbuild@multivac-deploy.iam.gserviceaccount.com"

echo "=== Deploy website-builder (${ENV}) ==="
echo "  Project:  ${PROJECT}"
echo "  Service:  ${SERVICE}"
echo "  Image:    ${IMAGE}"
echo "  Source:   ${PORTAL_DIR}"
echo ""

# Build and push image via Cloud Build
echo "Building image via Cloud Build..."
gcloud builds submit "${PORTAL_DIR}" \
  --project=multivac-deploy \
  --region="${REGION}" \
  --service-account="${CB_SA}" \
  --tag="${IMAGE}" \
  --quiet

# Update Cloud Run service (Terraform created it, we just swap the image)
echo ""
echo "Updating Cloud Run service..."
gcloud run services update "${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT}" \
  --image "${IMAGE}" \
  --quiet

# Print result
SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" --project="${PROJECT}" \
  --format="value(status.url)")

echo ""
echo "=========================================="
echo "Deployed successfully!"
echo "  Service URL: ${SERVICE_URL}"
echo "  API base:    ${SERVICE_URL}/api"
echo "=========================================="
echo ""
echo "Test: curl -s ${SERVICE_URL}/api/sites/default | python3 -m json.tool"
