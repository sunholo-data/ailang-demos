# Website Builder Demo

Turns unstructured content (photos, docs, text) into structured website plans using AILANG AI, validated by contracts. See [DESIGN.md](DESIGN.md) for the full architecture.

## Quick Commands

```bash
# Type-check all modules
ailang check website_builder/

# Run end-to-end (needs ADC — ensure GOOGLE_API_KEY is unset)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI,Env --ai gemini-2.5-flash \
  website_builder/main.ail "My flower arranging business"

# With contract verification
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI,Env --ai gemini-2.5-flash \
  --verify-contracts website_builder/main.ail "My flower arranging business"

# Custom style direction
STYLE="Bold and vibrant" GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,AI,Env --ai gemini-2.5-flash website_builder/main.ail "My tech startup"

# Elegant style
STYLE="Elegant and refined" GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,AI,Env --ai gemini-2.5-flash website_builder/main.ail "My photography portfolio"
```

## Module Structure

```
website_builder/
├── main.ail                              # CLI entry point (Phases 1-2)
├── types/
│   └── content.ail                       # ADT types: UploadedItem, SectionType
├── services/
│   ├── content_extractor.ail             # Wraps content into JSON for AI
│   ├── site_structurer.ail               # AI structures content into pages + design brief
│   ├── html_generator.ail                # AI HTML/CSS generation per page
│   ├── validator.ail                     # Contract-verified validation (7 validators)
│   └── website_builder_browser.ail       # WASM adapter (thin re-exports for JS)
├── styles/
│   └── directions.json                   # 6 style directions
├── output/                               # Generated HTML/CSS (CLI output)
├── scripts/
│   └── deploy.sh                         # Cloud Run deployment (repeatable)
├── portal/                               # Vue 3 + Vite browser portal
│   ├── Dockerfile                        # Sidecar container (Node 20 Alpine)
│   ├── .dockerignore
│   ├── server.js                         # Express sidecar API
│   ├── src/
│   │   ├── ailang.js                     # WASM module loader + Gemini AI handler
│   │   ├── api.js                        # Sidecar API client (save, build, status)
│   │   ├── firebase.js                   # Firebase Auth (Google sign-in)
│   │   ├── App.vue                       # Root: auth gate + 6-step wizard
│   │   └── components/steps/             # Wizard steps (Describe → Upload → Style → Build → Preview → Publish)
│   └── public/
│       ├── wasm/ -> invoice_processor_wasm/wasm/  # symlink to AILANG WASM
│       └── ailang/website_builder/               # symlinks to .ail source files
├── DESIGN.md                             # Full architecture document
└── CLAUDE.md                             # This file
```

## Architecture

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────┐
│  Vue SPA (GitHub Pages)                 │     │  Express Sidecar (Cloud Run)     │
│                                         │     │                                  │
│  AILANG WASM + Gemini generates         │     │  POST /api/save                  │
│  HTML/CSS in the browser                │────→│    ↓ write to /tmp               │
│                                         │     │    ↓ GitHub Git Data API          │
│  User previews + refines with chat      │     │    ↓ commit to sunholo-websites  │
└─────────────────────────────────────────┘     └──────────────────────────────────┘
                                                             │
                                                             ▼
                                                ┌──────────────────────────────────┐
                                                │  GitHub Pages                     │
                                                │  sunholo-websites repo            │
                                                │  serves generated sites at:       │
                                                │  /{org}.github.io/.../sites/...   │
                                                └──────────────────────────────────┘
```

Two build paths:

1. **WASM path** (working now) — AILANG runs in the browser via WASM, calls Gemini directly. Sites are generated client-side, then saved via the sidecar API to GitHub.
2. **Sidecar/ailang messages path** (Phase B) — Portal sends a brief to Claude Code via `ailang messages`. Claude Code builds the site with full tool access. Status via Firestore real-time.

Both paths converge at `POST /api/save` → GitHub commit → GitHub Pages.

## Local Development

```bash
# 1. Install portal dependencies
cd website_builder/portal && npm install

# 2. Start the Vue dev server (port 5174)
npm run dev

# 3. In another terminal, start the Express sidecar (port 3456)
node server.js

# 4. Open http://localhost:5174
#    Enter a Gemini API key in Settings (⚙️)
```

The local sidecar uses `~/dev/sunholo/sunholo-websites` as the git repo for persistence. Generated sites are committed locally via `git add + commit`.

## Cloud Deployment

The sidecar runs on Cloud Run. Generated sites are committed to GitHub via API and served by GitHub Pages.

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| `gcloud` | GCP CLI (Cloud Run, Cloud Build, Artifact Registry) | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |
| `gh` | GitHub CLI (provides GITHUB_TOKEN) | `brew install gh` |

Authenticate both:
```bash
gcloud auth login
gcloud config set project ailang-dev
gh auth login
```

### Deploy

```bash
# From repo root — one command does everything:
GCP_PROJECT=ailang-dev ./website_builder/scripts/deploy.sh
```

This script is fully idempotent. It:
1. Enables required GCP APIs (Cloud Run, Artifact Registry, Cloud Build)
2. Creates the Artifact Registry Docker repo if missing
3. Builds the container image via Cloud Build
4. Deploys to Cloud Run with env vars (GitHub token, CORS origins, etc.)
5. Prints the service URL

### What the deploy script sets up

| Resource | Details |
|----------|---------|
| **Cloud Run service** | `website-builder-api` in `us-central1` |
| **Container** | Node 20 Alpine, `server.js` only (no SPA, no WASM) |
| **Artifact Registry** | `cloud-run-source-deploy` repo for Docker images |
| **Memory / CPU** | 512Mi / 1 vCPU, 0–3 instances (scales to zero) |
| **Timeout** | 300s (GitHub API commits can be slow) |

### Environment variables

Set automatically by `deploy.sh`. Override with env vars before running:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GCP_PROJECT` | `ailang-dev` | GCP project ID |
| `GCP_REGION` | `us-central1` | Cloud Run region |
| `SERVICE_NAME` | `website-builder-api` | Cloud Run service name |
| `GITHUB_TOKEN` | `gh auth token` | GitHub PAT for repo commits |
| `GITHUB_OWNER` | `sunholo-voight-kampff` | GitHub org/user that owns the sites repo |
| `GITHUB_REPO` | `sunholo-websites` | Repo where generated sites are committed |
| `GITHUB_BRANCH` | `main` | Branch to commit to |
| `CORS_ORIGINS` | `https://www.sunholo.com,...` | Allowed CORS origins (comma-separated) |
| `WEBSITES_REPO` | `/tmp/websites` (Cloud Run) | Local path for temp file writes |

### After deploying

The deploy script prints the service URL. Update the SPA build to point at it:

```bash
# Rebuild the SPA with the Cloud Run API URL
cd website_builder/portal
VITE_API_URL=https://YOUR-SERVICE-URL.run.app/api npm run build
```

The CI workflow (`.github/workflows/deploy-invoice-processor.yml`) already has `VITE_API_URL` set for the production build, so pushing to `main` automatically rebuilds the SPA with the correct API URL.

### Verify

```bash
# Test the Cloud Run sidecar
curl -s https://YOUR-SERVICE-URL.run.app/api/sites/default | python3 -m json.tool

# Test save → GitHub commit
curl -s -X POST https://YOUR-SERVICE-URL.run.app/api/save \
  -H "Content-Type: application/json" \
  -d '{"user":"default","siteName":"test","pages":{"index":"<html><body>Hello</body></html>"},"css":"body{}"}' \
  | python3 -m json.tool

# Check the commit appeared on GitHub
gh api repos/sunholo-voight-kampff/sunholo-websites/commits --jq '.[0].commit.message'

# Check GitHub Pages serves it (may take ~30s after commit)
curl -s https://sunholo-voight-kampff.github.io/sunholo-websites/sites/default/test/index.html
```

### Current live URLs

| What | URL |
|------|-----|
| Portal (SPA) | https://www.sunholo.com/ailang-demos/website_builder/ |
| Sidecar API | https://website-builder-api-tb6m6slywa-uc.a.run.app |
| Generated sites | https://sunholo-voight-kampff.github.io/sunholo-websites/sites/{user}/{site}/ |
| Sites repo | https://github.com/sunholo-voight-kampff/sunholo-websites |

### GitHub Pages setup (one-time)

GitHub Pages was enabled on the `sunholo-websites` repo to serve generated sites:

```bash
# Enable Pages (deploy from main branch, root path)
gh api repos/sunholo-voight-kampff/sunholo-websites/pages -X POST --input - <<'EOF'
{"source":{"branch":"main","path":"/"}}
EOF

# Verify
gh api repos/sunholo-voight-kampff/sunholo-websites/pages --jq '.html_url'
```

## Sidecar API Reference

The Express sidecar (`server.js`) exposes these endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/save` | Persist WASM-generated site to disk + GitHub |
| `POST` | `/api/build` | Send build brief to Claude Code via ailang messages |
| `POST` | `/api/upload` | Upload media files to staging |
| `POST` | `/api/feedback` | Send feedback to Claude Code |
| `GET` | `/api/status` | Poll for response messages |
| `GET` | `/api/sites/:user` | List all sites for a user |
| `GET` | `/api/sites/:user/:site/*` | Serve generated site files |
| `GET` | `/api/files/:user/:site` | List files in a site directory |
| `GET` | `/api/staging/:user/:site/media/:file` | Serve staged media |

### POST /api/save

Saves a WASM-generated site and commits to GitHub (when `GITHUB_TOKEN` is set).

```json
{
  "user": "default",
  "siteName": "my-site",
  "pages": { "index": "<html>...</html>", "about": "<html>...</html>" },
  "css": "body { ... }",
  "images": [{ "filename": "photo.jpg", "base64": "..." }],
  "siteJson": "{...}",
  "description": "My flower shop website"
}
```

Returns: `{ "userId": "default", "siteSlug": "my-site", "files": ["sites/default/my-site/index.html", ...] }`

The GitHub commit flow uses the Git Data API (create blobs → tree → commit → update ref) for atomic multi-file commits. Binary files (images, fonts, etc.) are base64-encoded.

## Phase 1: Content Pipeline (Complete)

CLI-testable pipeline: test content → AI page suggestions → AI site structuring → contract validation.

- **5 AILANG modules**, all type-check
- **7 contract-verified validators** (site structure, pages, design brief, home page, HTML, JS safety)
- **3 AI functions** (structureSite, suggestPages, refineSite)
- Uses `callJsonSimple` (not `callJson`) to avoid large response corruption bug

## Auth

Uses ADC (Application Default Credentials) for Vertex AI. If `GOOGLE_API_KEY` is set in your environment, AILANG uses it as a direct Gemini API key instead of ADC.

```bash
# Force ADC
GOOGLE_API_KEY="" ailang run ...

# Or use API key directly
GOOGLE_API_KEY=your-key ailang run ...
```

Portal needs a Gemini API key — enter it in Settings after opening.

## Known AILANG Issues Hit During Development

1. **Multi-statement lambdas in flatMap**: `flatMap(\x. let a = ...; let b = ...; expr, xs)` fails to parse when using block `{ }` syntax inside the lambda. Workaround: extract complex lambda bodies into named helper functions.
2. **Transitive imports required**: `main.ail` must import all stdlib modules that sub-modules use (std/json, std/ai, etc.)
3. **`not` in ensures clauses**: Use `x == false` instead of `not x` in contract predicates.
4. **Test harness bug**: Don't use inline `tests` on functions that call stdlib HOFs.
