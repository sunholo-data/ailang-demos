# Website Builder

Builds websites from unstructured content (photos, docs, text descriptions) using [AILANG](https://github.com/nicholasgasior/ailang) + Gemini AI. Describe your business or project, upload some photos, pick a style — and get a live multi-page website.

**Live demo:** https://www.sunholo.com/ailang-demos/website_builder/

## How It Works

1. **Describe** your website (e.g. "My flower arranging business in Edinburgh")
2. **Upload** photos, documents, or paste text
3. **Pick a style** — warm, clean, bold, elegant, fun, or auto
4. **Build** — AILANG + Gemini generate HTML/CSS in your browser
5. **Preview & refine** — chat to tweak colours, layout, content
6. **Publish** — saved to GitHub, served via GitHub Pages

All AI processing runs client-side via AILANG WASM + the Gemini API. No server needed for generation — only for saving.

## Running Locally

### Portal (browser UI)

```bash
cd website_builder/portal
npm install

# Start the Vue dev server (http://localhost:5174)
npm run dev
```

Open http://localhost:5174 and enter your [Gemini API key](https://aistudio.google.com/apikey) in Settings.

### Sidecar (optional — enables saving)

The Express sidecar persists generated sites to a git repo. Without it, sites still generate and preview fine — they just aren't saved.

```bash
# In a second terminal:
cd website_builder/portal
node server.js
# → http://localhost:3456
```

Sites are saved to `~/dev/sunholo/sunholo-websites/sites/`. Override with `WEBSITES_REPO` env var.

### CLI (no browser needed)

```bash
# Structure only
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI,Env \
  --ai gemini-2.5-flash website_builder/main.ail "My flower arranging business"

# Structure + HTML generation
GENERATE=true GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,AI,Env \
  --ai gemini-2.5-flash website_builder/main.ail "My flower arranging business"

# Custom style
STYLE="Bold and vibrant" GENERATE=true GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,AI,Env --ai gemini-2.5-flash website_builder/main.ail "My tech startup"
```

Output goes to `website_builder/output/`.

## Deploying to Cloud

The sidecar deploys to Cloud Run. Generated sites are committed to GitHub via API and served by GitHub Pages.

### Prerequisites

- **gcloud CLI** — authenticated with a GCP project ([install](https://cloud.google.com/sdk/docs/install))
- **gh CLI** — authenticated with GitHub (`brew install gh && gh auth login`)

```bash
gcloud auth login
gcloud config set project ailang-dev
gh auth login
```

### Deploy

```bash
# From repo root — one command:
GCP_PROJECT=ailang-dev ./website_builder/scripts/deploy.sh
```

The script is idempotent — safe to re-run anytime. It:

1. Enables GCP APIs (Cloud Run, Artifact Registry, Cloud Build)
2. Creates the Docker image repo if missing
3. Builds the container via Cloud Build
4. Deploys to Cloud Run with all env vars configured
5. Prints the service URL

### Configuration

Override any default with an environment variable:

| Variable | Default | What it does |
|----------|---------|--------------|
| `GCP_PROJECT` | `ailang-dev` | GCP project to deploy into |
| `GCP_REGION` | `us-central1` | Cloud Run region |
| `SERVICE_NAME` | `website-builder-api` | Cloud Run service name |
| `GITHUB_TOKEN` | auto from `gh auth token` | GitHub PAT for committing sites |
| `GITHUB_OWNER` | `sunholo-voight-kampff` | GitHub org/user owning the sites repo |
| `GITHUB_REPO` | `sunholo-websites` | Repo where generated sites are committed |

Example with overrides:

```bash
GCP_PROJECT=my-project GITHUB_OWNER=my-org ./website_builder/scripts/deploy.sh
```

### Connecting the portal to Cloud Run

After deploying, rebuild the portal SPA with the Cloud Run URL:

```bash
cd website_builder/portal
VITE_API_URL=https://YOUR-SERVICE-URL.run.app/api npm run build
```

The CI workflow already does this automatically — just push to `main`.

### Verifying the deployment

```bash
# 1. Check the sidecar is running
curl -s https://YOUR-SERVICE-URL.run.app/api/sites/default | python3 -m json.tool

# 2. Test saving a site
curl -s -X POST https://YOUR-SERVICE-URL.run.app/api/save \
  -H "Content-Type: application/json" \
  -d '{"user":"default","siteName":"test","pages":{"index":"<html><body>Hello</body></html>"},"css":"body{}"}' \
  | python3 -m json.tool

# 3. Check the commit appeared
gh api repos/OWNER/REPO/commits --jq '.[0].commit.message'

# 4. Check GitHub Pages (may take ~30s)
curl -s https://OWNER.github.io/REPO/sites/default/test/index.html
```

### GitHub Pages (one-time setup)

Enable Pages on the sites repo so committed files are served as websites:

```bash
gh api repos/OWNER/REPO/pages -X POST --input - <<'EOF'
{"source":{"branch":"main","path":"/"}}
EOF
```

## Architecture

```
Portal (GitHub Pages)                     Sidecar (Cloud Run)
───────────────────                       ─────────────────
AILANG WASM + Gemini                      POST /api/save
generates HTML in browser  ──────────→      writes to /tmp
                                            commits to GitHub via API
User previews + refines                        │
                                               ▼
                                         GitHub Pages
                                         serves sites at:
                                         {org}.github.io/{repo}/sites/{user}/{site}/
```

### Sidecar API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/save` | POST | Save generated site → GitHub commit |
| `/api/sites/:user` | GET | List saved sites |
| `/api/sites/:user/:site/*` | GET | Serve site files |
| `/api/upload` | POST | Upload media to staging |
| `/api/files/:user/:site` | GET | List files in a site |

## Pipeline

1. **Content extraction** — wraps description + uploads into typed items
2. **Site structuring** — AI generates pages, navigation, design brief
3. **Validation** — checks structure (home page, design brief, HTML safety)
4. **HTML generation** — AI generates HTML per page + shared CSS
5. **Preview** — iframe preview with chat-based refinement
6. **Save** — POST to sidecar → GitHub API commit → GitHub Pages

## Style Directions

Set `STYLE` env var or pick in the portal UI: warm, clean, bold, elegant, fun, auto. Defined in `styles/directions.json`.
