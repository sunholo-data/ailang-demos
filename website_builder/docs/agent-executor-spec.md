# Agent Executor Spec: Deterministic Git Operations

## Status

**Implemented.** The harness (executor) handles all git operations. The agent has no git access — git guardrails are enforced via PreToolUse hooks (`AILANG_GIT_MODE=guardrails`). Post-processing (link normalization, form script injection) remains in the sidecar as a second commit to keep the harness generic.

## Architecture

```
Portal → Sidecar → Coordinator → Cloud Run Job
                                       ↓
                                  ┌─────────────────────────┐
                                  │  HARNESS (deterministic) │
                                  │  1. Clone repo (main)    │
                                  │  2. Create output dir    │
                                  │  3. Run agent (AI)       │
                                  │  4. git add + commit     │
                                  │  5. git push             │
                                  │  6. Send completion msg  │
                                  └─────────────────────────┘
                                       ↓
                              Sidecar post-processes
                              (normalize links, inject forms)
                                       ↓
                              GitHub Pages auto-deploys
```

The agent writes files to the output directory. The harness commits and pushes. The sidecar applies deterministic post-processing as a second commit.

## Coordinator Message Contract

The portal sends a build brief to the coordinator with these fields:

```json
{
  "type": "build",
  "siteSlug": "flora-and-form-k5m2n",
  "briefId": "brief-1710547200000",
  "siteName": "Flora & Form Edinburgh",
  "outputDir": "sites/{userId}/{siteSlug}",
  "description": "...",
  "styleDirection": "warm",
  "content": { "text": [...], "images": [...], "documents": [...] },
  "instructions": "You are building a website. Write files to the output directory.\n..."
}
```

**Key fields for the harness:**
- `siteSlug` — sanitized slug, used in commit message
- `briefId` — build identifier, used in commit message
- `outputDir` — where the agent writes files (relative to repo root)

**Instructions** contain only output format guidance (relative links, media paths, required files). No git instructions — the harness handles all VCS.

## Completion Message Contract

On success:
```json
{
  "task_id": "abc123",
  "agent_id": "website-builder",
  "status": "completed",
  "branch_name": "main",
  "changed_files": ["sites/user1/acme/index.html", "sites/user1/acme/style.css"]
}
```

On failure:
```json
{
  "task_id": "abc123",
  "agent_id": "website-builder",
  "status": "failed",
  "error_msg": "executor failed: timeout after 30m",
  "changed_files": null
}
```

The portal handles both `files` (bare filenames) and `changed_files` (full repo paths) — it strips the `sites/{user}/{site}/` prefix from full paths. Falls back to GitHub Contents API discovery if neither is present.

## Commit Message Convention

```
Build: {siteSlug} [briefId={briefId}]
```

The harness reads `siteSlug` and `briefId` from the message payload. The portal's history endpoint uses `GET /repos/{owner}/{repo}/commits?path=sites/{user}/{site}/` to list versions. The `briefId` links back to the original build brief.

## Pre-Generation (Sidecar)

Before dispatching the brief, the sidecar:
1. Saves uploaded media to staging
2. Commits media files to main via GitHub Git Data API (so they're available when the agent runs)
3. Replaces staging paths with relative `media/{filename}` in the brief
4. Sends brief to coordinator

## Post-Generation (Sidecar)

After receiving the completion message, the portal calls `POST /api/post-process/:user/:site`:
1. Fetches HTML files from GitHub via Contents API
2. Applies `normalizeNavLinksServer()` — converts `/about`, `#contact`, `./about.html` to `about.html`
3. Injects form submission handler script (self-contained, posts to sidecar endpoint)
4. Recommits only if files changed

This is a deterministic string transform, not AI. It runs as a second commit to keep the harness generic.

## Git Guardrails

The harness enforces `AILANG_GIT_MODE=guardrails` via PreToolUse hooks:

| Mode | Reads | Commits | Push | Branch creation |
|------|-------|---------|------|----------------|
| `guardrails` (default) | Yes | Yes | Only to expected branch | Blocked |
| `strict` | Yes | No | No | Blocked |
| `permissive` | Yes | Yes | Yes | Yes |

The agent physically cannot create branches or push to wrong remotes. Blocked commands return self-correcting feedback messages.

## Rollback Contract

The portal provides version history and restore via GitHub's commit API:

1. **List versions**: `GET /api/site-history/:user/:site` — returns commits touching the site directory
2. **Restore**: `POST /api/site-restore/:user/:site` — reads files at a given commit SHA, commits as new version

Restores create **new commits** (not git reverts), so the history is always append-only and fully auditable.

## Resolved Questions

- **Sandbox mechanism**: Git guardrails via PreToolUse hooks. No chroot/container sandbox needed — the hook blocks rogue git operations at the tool call level.
- **Post-processing ownership**: Stays in sidecar (second commit). Keeps harness generic. Single atomic commit is possible via lifecycle post-scripts if needed later.
- **AI output validation**: Sidecar checks `index.html` exists when loading the generated site. The harness commits whatever the agent produced.
- **Multi-page discovery**: Agent decides page structure from the brief. Portal discovers pages via `changed_files` array or GitHub Contents API fallback.
