# Agent Executor Spec: Deterministic Git Operations

## Problem

AI agents (Claude Code, etc.) are unreliable at git operations when given full autonomy. Common failures in production:

1. **Branch creation** — Agent creates feature branches instead of committing to main, even when explicitly instructed not to. Results in sites not deploying (GitHub Pages serves main only).
2. **Merge conflicts** — Agent spends 10+ turns (~$0.90) fighting rebase/merge issues when the branch already exists from a previous run.
3. **Wrong paths** — Agent writes files to arbitrary locations in the repo, not the specified output directory.
4. **Incorrect URLs** — Agent generates absolute paths (`/about`), fragment links (`#about`), or full URLs instead of relative links (`about.html`).
5. **Namespace collisions** — Same site slug from a previous build causes branch name conflicts.

**Root cause**: Git operations are non-deterministic when delegated to AI. The agent interprets instructions differently each time, and there's no enforcement mechanism.

## Current Architecture

```
Portal → Sidecar → Coordinator → Cloud Run Job (agent)
                                       ↓
                                  Clone repo
                                  Read brief
                                  Generate HTML/CSS
                                  git add + commit + push  ← FRAGILE
                                       ↓
                              GitHub Pages auto-deploys
```

The agent currently handles both **content generation** (AI task) and **git operations** (deterministic task). These should be separated.

## Proposed Executor Model

Split the agent's work into three deterministic phases wrapping the non-deterministic AI generation:

```
┌─────────────────────────────────────────────────┐
│  EXECUTOR (deterministic, no AI)                │
│                                                 │
│  1. PRE-GENERATION                              │
│     - Clone/checkout repo (main branch)         │
│     - Create output directory                   │
│     - Copy media files into place               │
│     - Write manifest (available files, paths)   │
│     - Set environment variables for AI          │
│                                                 │
│  2. AI GENERATION (non-deterministic)           │
│     - AI reads brief + manifest                 │
│     - AI writes HTML/CSS to output dir ONLY     │
│     - AI has NO git access                      │
│     - AI has NO access outside output dir        │
│                                                 │
│  3. POST-GENERATION                             │
│     - Validate: index.html exists               │
│     - Normalize navigation links (relative)     │
│     - Inject form handler scripts               │
│     - Validate media references                 │
│     - git add + commit (atomic, single commit)  │
│     - git push (with retry on conflict)         │
│     - Send completion message                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Phase 1: Pre-Generation (Deterministic)

The executor sets up the workspace before the AI runs:

```bash
# 1. Clone target repo
git clone --depth 1 --branch main $REPO_URL /workspace/repo

# 2. Create output directory
OUTPUT_DIR="/workspace/repo/sites/$USER_ID/$SITE_SLUG"
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/media"

# 3. Copy pre-committed media files
# (already committed by the sidecar before the build was dispatched)

# 4. Write manifest for the AI
cat > /workspace/manifest.json <<EOF
{
  "outputDir": "$OUTPUT_DIR",
  "siteSlug": "$SITE_SLUG",
  "userId": "$USER_ID",
  "mediaFiles": ["media/photo1.jpg", "media/logo.png"],
  "requiredOutput": ["index.html", "style.css"],
  "linkFormat": "relative",
  "linkExample": "about.html"
}
EOF

# 5. Set environment variables
export AILANG_OUTPUT_DIR="$OUTPUT_DIR"
export AILANG_SITE_SLUG="$SITE_SLUG"
export AILANG_MEDIA_FILES="media/photo1.jpg,media/logo.png"
```

### Phase 2: AI Generation (Non-Deterministic)

The AI receives:
- The build brief (description, style, content, instructions)
- The manifest (output dir, available media, required output format)
- Write access ONLY to `$AILANG_OUTPUT_DIR`

The AI produces:
- `index.html` (required)
- Additional pages: `about.html`, `gallery.html`, etc.
- `style.css` (required)

**Constraints enforced by the executor:**
- AI cannot run git commands (not in PATH or capability-gated)
- AI cannot write outside the output directory (sandbox/chroot)
- AI cannot modify other users' sites
- AI cannot access the network (no external API calls)

### Phase 3: Post-Generation (Deterministic)

The executor validates and commits the AI's output:

```bash
# 1. Validate required output
if [ ! -f "$OUTPUT_DIR/index.html" ]; then
  echo "ERROR: index.html not found" && exit 1
fi

# 2. Normalize navigation links
# Apply normalizeNavLinksServer() equivalent:
# - /about → about.html
# - #contact → contact.html
# - ./about.html → about.html
# (This is a deterministic string transform, not AI)

# 3. Inject form handler scripts
# Add self-contained form submission handler before </body>

# 4. Validate media references
# Check that all <img src="media/..."> point to existing files

# 5. Commit
cd /workspace/repo
git add "sites/$USER_ID/$SITE_SLUG/"
git commit -m "Build: $SITE_SLUG [briefId=$BRIEF_ID]"

# 6. Push with conflict retry
git push origin main || {
  git pull --rebase origin main
  git push origin main
}

# 7. Send completion message
ailang messages send portal \
  --title "Build complete: $SITE_SLUG" \
  --from website-builder \
  "{ \"status\": \"complete\", \"files\": [...], \"commitSha\": \"...\" }"
```

## Commit Message Convention

Standardized commit messages enable the portal to map builds to versions:

```
Build: {siteSlug} [briefId={briefId}]
```

Example:
```
Build: flora-and-form-edinburgh-k5m2n [briefId=brief-1710547200000]
```

The portal's history endpoint uses `GET /repos/{owner}/{repo}/commits?path=sites/{user}/{site}/` to list versions. The `briefId` in the commit message links back to the original build brief.

## Rollback Contract

The portal provides version history and restore via GitHub's commit API:

1. **List versions**: `GET /api/site-history/:user/:site` — returns commits touching the site directory
2. **Restore**: `POST /api/site-restore/:user/:site` — reads files at a given commit SHA, commits as new version

Restores create **new commits** (not git reverts), so the history is always append-only and fully auditable.

## What This Enables

1. **Zero git failures** — Agent never touches git; executor handles all VCS operations deterministically
2. **Consistent URLs** — Post-generation normalization ensures all links work on GitHub Pages
3. **Rollback** — Every build is a commit; users can restore any previous version
4. **Audit trail** — Commit messages link to build briefs; full traceability
5. **Multi-agent safety** — Executor enforces directory isolation; agents can't interfere with each other
6. **Retry without cost** — If push fails, executor retries (not the AI at $0.06/turn)

## Migration Path

1. **Current** (sidecar post-processing): Portal triggers `POST /api/post-process/:user/:site` after agent commits. Best-effort normalization of whatever the agent produced.
2. **Next** (executor pre/post hooks): Coordinator configures pre-generation and post-generation scripts that run in the same Cloud Run Job, sandwiching the AI execution.
3. **Target** (full executor model): AI has no git access. Executor handles all VCS. AI writes to a sandboxed output directory only.

## Open Questions

- **Sandbox mechanism**: How to restrict AI's file access to the output directory? Options: container filesystem, capability-gated FS handler, chroot.
- **AI output validation**: Should the executor validate HTML structure (well-formed, has `<head>`, has `<body>`)? Or just check file existence?
- **Partial output**: If AI generates `index.html` but crashes before `style.css`, should the executor commit the partial output or fail the build?
- **Multi-page discovery**: Should the executor tell the AI which pages to create (from the brief), or let the AI decide page structure?
