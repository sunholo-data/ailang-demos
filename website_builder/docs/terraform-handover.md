# Terraform Handover: Website Builder Infrastructure

This document captures all GCP infrastructure currently deployed via `scripts/deploy.sh` that needs to be migrated to Terraform.

## GCP Project

| Setting | Value |
|---------|-------|
| Project ID | `ailang-dev` |
| Region | `europe-west1` |

## 1. APIs to Enable

```hcl
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "sheets.googleapis.com",
    "drive.googleapis.com",
  ])
  project = "ailang-dev"
  service = each.value
}
```

## 2. Artifact Registry

| Setting | Value |
|---------|-------|
| Repository name | `cloud-run-source-deploy` |
| Format | Docker |
| Location | `europe-west1` |

```hcl
resource "google_artifact_registry_repository" "docker" {
  project       = "ailang-dev"
  location      = "europe-west1"
  repository_id = "cloud-run-source-deploy"
  format        = "DOCKER"
}
```

## 3. Cloud Run Service

| Setting | Value |
|---------|-------|
| Service name | `website-builder-api` |
| Image | `europe-west1-docker.pkg.dev/ailang-dev/cloud-run-source-deploy/website-builder-api` |
| Memory | 512Mi |
| CPU | 1 |
| Min instances | 0 (scales to zero) |
| Max instances | 3 |
| Timeout | 300s |
| Auth | Unauthenticated (public API) |
| Container port | 8080 |
| Startup command | `sh -c "SIDECAR_PORT=$PORT node server.js"` |
| Base image | `node:20-alpine` |

### Environment Variables

| Variable | Value | Sensitive | Purpose |
|----------|-------|-----------|---------|
| `GITHUB_TOKEN` | GitHub PAT (from `gh auth token`) | **Yes** | Commit generated sites to GitHub repo |
| `GITHUB_OWNER` | `sunholo-voight-kampff` | No | GitHub org for sites repo |
| `GITHUB_REPO` | `sunholo-websites` | No | GitHub repo for generated sites |
| `GITHUB_BRANCH` | `main` (default in code) | No | Target branch |
| `WEBSITES_REPO` | `/tmp/websites` | No | Local path for file storage on Cloud Run |
| `CORS_ORIGINS` | `https://www.sunholo.com,https://sunholo-voight-kampff.github.io,http://localhost:5174` | No | Allowed CORS origins |
| `CLOUD_RUN_URL` | Self-referencing service URL (set post-deploy) | No | Injected into saved HTML for form submission endpoint |
| `FORM_WEBHOOK_URL` | Slack/Discord/Zapier webhook URL (optional) | **Yes** | Form submission notifications |

### Notes on CLOUD_RUN_URL
The deploy script does a two-phase deploy: first deploy the service, then update `CLOUD_RUN_URL` with the service's own URL. This is needed because `server.js` injects form submission scripts into saved HTML that must reference the absolute Cloud Run URL (for GitHub Pages cross-origin POSTs). In Terraform, use `google_cloud_run_v2_service.website_builder.uri` to self-reference.

### Sensitive Variables
`GITHUB_TOKEN` and `FORM_WEBHOOK_URL` should be stored in **Google Secret Manager** and referenced via Cloud Run secret volume mounts or env var references, not hardcoded in Terraform state.

## 4. IAM

### Cloud Run Service Account
The default compute service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) is used. It needs:

| Role / Permission | Purpose |
|-------------------|---------|
| Default Cloud Run invoker | Serve HTTP requests |
| `roles/sheets.editor` (on specific sheets) OR project-level Sheets access | Create + append to Google Sheets |
| `roles/drive.file` (via OAuth scope) | Create new spreadsheets in user's Drive |

**Note:** Currently using ADC with `drive.file` and `spreadsheets` scopes. The Sheets API auto-creates spreadsheets owned by the service account. The first time a form is submitted for a site, a new Google Sheet is created. The sheet IDs are stored in `forms.json` in the websites repo.

If you want sheets visible to a human user, either:
- Share the service account's Drive folder with the user, or
- Grant the service account `roles/drive.file` and have it share each created sheet with a configured email

### Public Access
Cloud Run is set to `--allow-unauthenticated`. In Terraform:

```hcl
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = "ailang-dev"
  location = "europe-west1"
  name     = "website-builder-api"
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

## 5. Cloud Build

Cloud Build is used only for building the Docker image (`gcloud builds submit`). In Terraform, this can be replaced with:
- **Option A**: `google_cloudbuild_trigger` with a GitHub trigger (auto-build on push)
- **Option B**: Keep manual builds via `gcloud builds submit` (no Terraform needed for this)
- **Option C**: Use Cloud Run source deploy (`--source` flag) which handles build automatically

## 6. Container / Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "SIDECAR_PORT=$PORT node server.js"]
```

The container only runs `server.js` (Express sidecar). The Vue SPA is served separately from GitHub Pages at `https://www.sunholo.com/ailang-demos/website_builder/`.

## 7. External Dependencies (NOT in GCP)

These are not Terraform-managed but are required for the system to work:

| Dependency | Purpose | Config |
|------------|---------|--------|
| **GitHub repo** `sunholo-voight-kampff/sunholo-websites` | Hosts generated site files, deployed via GitHub Pages | `GITHUB_OWNER` + `GITHUB_REPO` env vars |
| **GitHub Pages** | Serves generated sites at `https://sunholo-voight-kampff.github.io/sunholo-websites/sites/...` | Configured in repo settings |
| **GitHub PAT** | Token with `repo` scope for committing files via Git Data API | `GITHUB_TOKEN` env var (Secret Manager) |
| **Webhook endpoint** (optional) | Slack/Discord/Zapier incoming webhook for form notifications | `FORM_WEBHOOK_URL` env var |

## 8. Data Flow Summary

```
Browser (SPA on GitHub Pages)
  │
  ├─ POST /api/save         → Cloud Run → writes files → commits to GitHub → GitHub Pages
  ├─ POST /api/form-submit  → Cloud Run → Google Sheets API → append row
  ├─ POST /api/build        → Cloud Run → ailang messages → Claude Code
  ├─ POST /api/feedback     → Cloud Run → ailang messages → Claude Code
  ├─ GET  /api/sites/*      → Cloud Run → serve from /tmp/websites
  └─ GET  /api/status       → Cloud Run → poll ailang messages
```

## 9. What forms.json Looks Like

Stored at `WEBSITES_REPO/forms.json`, committed to GitHub:

```json
{
  "my-flower-shop": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "portfolio-site": "1Abc...another-sheet-id..."
}
```

Maps site slug to Google Sheets spreadsheet ID.

## 10. Migration Checklist

- [ ] Create `google_project_service` resources for all 5 APIs
- [ ] Create `google_artifact_registry_repository` for Docker images
- [ ] Create `google_secret_manager_secret` + versions for `GITHUB_TOKEN` and `FORM_WEBHOOK_URL`
- [ ] Create `google_cloud_run_v2_service` with all env vars (reference secrets)
- [ ] Create IAM binding for public access (`allUsers` → `roles/run.invoker`)
- [ ] Handle the self-referencing `CLOUD_RUN_URL` (use service URI output)
- [ ] Optionally: create `google_cloudbuild_trigger` for CI/CD
- [ ] Optionally: create a dedicated service account (instead of default compute) with minimal permissions
- [ ] Import existing resources if keeping the current deployment (`terraform import`)
