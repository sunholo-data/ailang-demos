#!/usr/bin/env bash
# Deploy the Website Builder sidecar to Cloud Run.
#
# Usage:
#   ./website_builder/scripts/deploy.sh                 # deploy with defaults
#   GITHUB_TOKEN=ghp_xxx ./website_builder/scripts/deploy.sh   # pass token explicitly
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - gh CLI authenticated (for GITHUB_TOKEN fallback)
#
# Environment overrides:
#   GCP_PROJECT    — GCP project ID          (default: ailang-dev)
#   GCP_REGION     — Cloud Run region        (default: us-central1)
#   SERVICE_NAME   — Cloud Run service name  (default: website-builder-api)
#   GITHUB_TOKEN   — GitHub PAT for repo commits (falls back to `gh auth token`)
#   GITHUB_OWNER   — GitHub org/user         (default: sunholo-voight-kampff)
#   GITHUB_REPO    — Target repo for sites   (default: sunholo-websites)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PORTAL_DIR="$REPO_ROOT/website_builder/portal"

# Defaults
GCP_PROJECT="${GCP_PROJECT:-ailang-dev}"
GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-website-builder-api}"
GITHUB_OWNER="${GITHUB_OWNER:-sunholo-voight-kampff}"
GITHUB_REPO="${GITHUB_REPO:-sunholo-websites}"
AR_REPO="cloud-run-source-deploy"
IMAGE="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$AR_REPO/$SERVICE_NAME"

# Get GitHub token (explicit env var or from gh CLI)
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "[deploy] No GITHUB_TOKEN set — getting from gh CLI..."
  GITHUB_TOKEN="$(gh auth token 2>/dev/null || true)"
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "[deploy] ERROR: No GITHUB_TOKEN and gh CLI not authenticated."
    echo "         Run: gh auth login   OR   export GITHUB_TOKEN=ghp_xxx"
    exit 1
  fi
fi

echo "[deploy] Project:  $GCP_PROJECT"
echo "[deploy] Region:   $GCP_REGION"
echo "[deploy] Service:  $SERVICE_NAME"
echo "[deploy] Image:    $IMAGE"
echo "[deploy] GitHub:   $GITHUB_OWNER/$GITHUB_REPO"

# 1. Enable required APIs (idempotent)
echo "[deploy] Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$GCP_PROJECT" --quiet

# 2. Create Artifact Registry repo if it doesn't exist
if ! gcloud artifacts repositories describe "$AR_REPO" \
  --project="$GCP_PROJECT" --location="$GCP_REGION" --format="value(name)" 2>/dev/null; then
  echo "[deploy] Creating Artifact Registry repo: $AR_REPO"
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT" --quiet
fi

# 3. Build and push container image
echo "[deploy] Building container image..."
gcloud builds submit "$PORTAL_DIR" \
  --tag "$IMAGE" \
  --project="$GCP_PROJECT" \
  --quiet

# 4. Deploy to Cloud Run
echo "[deploy] Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --project "$GCP_PROJECT" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "^||^GITHUB_TOKEN=$GITHUB_TOKEN||GITHUB_OWNER=$GITHUB_OWNER||GITHUB_REPO=$GITHUB_REPO||WEBSITES_REPO=/tmp/websites||CORS_ORIGINS=https://www.sunholo.com,https://sunholo-voight-kampff.github.io" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --timeout 300 \
  --quiet

# 5. Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$GCP_REGION" --project="$GCP_PROJECT" \
  --format="value(status.url)")

echo ""
echo "=========================================="
echo "[deploy] Deployed successfully!"
echo "[deploy] Service URL: $SERVICE_URL"
echo "[deploy] API base:    $SERVICE_URL/api"
echo "=========================================="
echo ""
echo "To use with the portal, set in api.js or env:"
echo "  VITE_API_URL=$SERVICE_URL/api"
echo ""
echo "To test:"
echo "  curl -s $SERVICE_URL/api/sites/default | python3 -m json.tool"
