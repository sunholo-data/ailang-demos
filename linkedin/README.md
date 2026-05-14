# LinkedIn Marketing CLI + Comment-Driven Sketches — AILANG Demo

Publish marketing content to a LinkedIn company page, read replies, and turn URL+hashtag comments into public scored sketches with contract-verified leaderboards. Built in [AILANG](https://github.com/sunholo-data/ailang), exercising `std/net` REST + form encoding, `std/ai` for content classification, `std/process` for invoking `docparse`, capability budgets, IFC labels for PII handling, and `requires`/`ensures` contracts for the rubric.

## Install

```bash
ln -s $(pwd)/linkedin/ailang-linkedin ~/.local/bin/ailang-linkedin
```

## Usage

```bash
# Publishing
ailang-linkedin list                        # List posts + published-status
ailang-linkedin post --dry-run 01_5-sketches-loop  # Preview without posting
ailang-linkedin post 01_5-sketches-loop     # Publish to LinkedIn
ailang-linkedin status                      # Auth status + summary
ailang-linkedin setup                       # Show setup instructions
ailang-linkedin auth                        # Run the OAuth2 dance (one-time)

# Comments + sketches (the 3-hourly cron uses these)
ailang-linkedin comments                    # Fetch comments (human-readable)
ailang-linkedin comments --json             # JSON for sketch detection pipeline
ailang-linkedin refresh                     # Trigger the comments cron + wait
ailang-linkedin sketch <url> <topic>        # Manually generate one sketch
                                            # topic: agent-ready | privacy | portable
```

## How the loop works

```
LinkedIn comment        comment fetch       sketch detection         sketch render          public site
"acme.com               (every 3h cron)     parse <url> + topic      sketchSite:            site/linkedin/
 #ailangPrivacy"  ───►  socialActions/  ──► from each comment   ───► fetch + docparse  ───► topics/
                        comments-GET_ALL    (skip if quota hit /     + AI classify +        privacy/
                                            duplicate domain         pure rubric + render   acme-com/
                                            within 30 days)                                 index.html
```

Why **every 3 hours** and not hourly: LinkedIn caps `socialActions/comments-GET_ALL` at **100 fetches per user per day**. 3h = 8 fetches/day, well under the cap with headroom for `refresh` debugging.

Comments work on **any** AILANG post on Sunholo's page, not just the latest — the cron iterates state.json for every published URN.

## Three topics

Each topic is a hashtag readers can drop in a comment:

| Hashtag | Question | Leaderboard |
|---|---|---|
| `#ailangAgentReady` | Can an agent transact with your site? | A2A, OpenAPI, MCP, webhooks, rate limits, sandbox, authentication, idempotency, streaming |
| `#ailangPrivacy` | Where can your data leak that the type system can't see? | E2EE, compliance certs (SOC 2/ISO 27001/GDPR/HIPAA/CCPA), data-minimisation, third-party domains, residency |
| `#ailangPortable` | Can your stack switch vendors with a flag, not a refactor? | Multi-provider, single-vendor penalty, cross-runtime claim, BYO key |

20 signals total across the three topics. Every signal maps to a real AILANG primitive — see [`design/scoring-rubric.md`](design/scoring-rubric.md) for the full table. Scoring is **pure deterministic AILANG**, not AI — `sketchScoreAllSignals(body) -> [Signal]` runs `contains(body, "keyword")` checks bounded by `ensures { result.points >= 0, result.points <= result.maxPoints }`. AI is involved only in the per-sketch content classification (one Gemini `callJson` call surfaces narrative/audience/jobs/entities for the §2 panel).

## Tuning the rubric

The `rubric-audit` skill at [`.claude/skills/rubric-audit/`](../.claude/skills/rubric-audit/) walks the four-phase tuning loop:

1. Audit fire rates — `scripts/audit_fire_rates.sh` buckets every signal as COLLAPSED / DEAD / healthy / narrow
2. Diagnose low scorers — `scripts/grep_missed_signals.sh <url>` shows which signals would fire with broader keywords
3. Edit signals + scorers + tests + design-doc as a unit (the "every signal maps to an AILANG primitive" credibility rule)
4. Re-seed memory-safely — `scripts/reseed_all.sh` (six batches of five, `AILANG_TRACE=off`)

The 30-page seed set lives in [`sketch_seed_main.ail`](sketch_seed_main.ail) — European/Nordic commercial pages across the three topics, hand-curated to deeper-than-homepage URLs.

---

## LinkedIn Developer App Setup

### Important: Two Types of App

LinkedIn has two relevant products with **mutually exclusive requirements**:

| Product | Scope | Posts as | Notes |
|---------|-------|---------|-------|
| **Share on LinkedIn** | `w_member_social` | Personal profile | Easy to get, instant approval |
| **Community Management API** | `w_organization_social` | Company page | Requires review (days), must be the **only product** on the app |

**You cannot have both products on the same app.** The Community Management API requires it be the sole product for "legal and security reasons". If you need both, create two separate apps.

### For Company Page Posting (recommended for marketing)

#### 1. Create a dedicated app

Go to https://www.linkedin.com/developers/apps/new

- **App name**: e.g. "AILANG Marketing"
- **LinkedIn Page**: Select your company page (you must be a page admin)
- **Do NOT add any other products** — Community Management API must be the only one

#### 2. Request Community Management API

On the **Products** tab, click **Request access** on "Community Management API".

You'll need to fill out an access form with:
- Business justification
- How you'll use the API
- Your company details

**Expect a review period** — LinkedIn/Microsoft will:
- Send an email verification from Microsoft Vetting Services
- Attempt to verify your business
- May request additional documentation
- Notify you by email when approved

#### 3. While waiting: set up the app

On the **Auth** tab:
- Note your `client_id` and `client_secret` (click the eye icon to reveal the secret)
- Add this **Authorized redirect URL**:
  ```
  http://localhost:8080/callback
  ```

#### 4. Find your Organization URN

Visit your company page admin dashboard:
```
https://www.linkedin.com/company/YOUR_COMPANY/admin/dashboard/
```

The org ID is the number in the URL. Your URN is:
```
urn:li:organization:YOUR_ORG_ID
```

For example: `https://www.linkedin.com/company/99524184/admin/` → `urn:li:organization:99524184`

#### 5. Complete the OAuth flow (after API access is approved)

**Step A** — Open this URL in your browser (replace `CLIENT_ID`):

```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=CLIENT_ID&redirect_uri=http://localhost:8080/callback&scope=w_organization_social%20r_organization_social&state=ailang
```

**Note on scopes:**
- Do NOT include `openid`, `profile`, or `email` unless you also have "Sign In with LinkedIn using OpenID Connect" product — it will fail with `openid_insufficient_scope_error`
- Only request scopes your app's products actually grant

**Step B** — After approving, LinkedIn redirects to `http://localhost:8080/callback?code=AUTH_CODE&state=ailang`

The page will show "site can't be reached" — that's fine. **Copy the full URL from your browser's address bar.** The code is the `code=` parameter.

**Step C** — Exchange the code for tokens:

```bash
# Using the helper script (runs AILANG for the HTTP call):
linkedin/scripts/exchange-token.sh CLIENT_ID CLIENT_SECRET AUTH_CODE

# Or manually with curl:
curl -s -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -d 'grant_type=authorization_code' \
  -d 'code=AUTH_CODE' \
  -d 'client_id=CLIENT_ID' \
  -d 'client_secret=CLIENT_SECRET' \
  -d 'redirect_uri=http://localhost:8080/callback'
```

**Step D** — Save credentials (the exchange script does this automatically, or manually):

```bash
mkdir -p ~/.ailang/linkedin
cat > ~/.ailang/linkedin/credentials.json <<'JSON'
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "org_urn": "urn:li:organization:YOUR_ORG_ID"
}
JSON
```

**Step E** — Test:

```bash
linkedin status
```

### For Personal Profile Posting (fallback / faster setup)

If you don't want to wait for Community Management API approval:

1. Create an app with **"Share on LinkedIn"** product (instant approval)
2. Also add **"Sign In with LinkedIn using OpenID Connect"** product
3. Use these scopes in the OAuth URL:
   ```
   scope=w_member_social%20openid%20profile%20email
   ```
4. Posts will appear from your personal profile, not the company page

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri does not match` | Redirect URL not registered | Add `http://localhost:8080/callback` on Auth tab, exact match required |
| `openid_insufficient_scope_error` | Requested `openid` without the OpenID Connect product | Remove `openid profile email` from scope, or add the OpenID Connect product |
| `unauthorized_scope_error` for `w_organization_social` | Community Management API not approved yet | Wait for approval, or use `w_member_social` with "Share on LinkedIn" product |
| `Bummer, something went wrong` + state parameter | LinkedIn's OAuth tools bug | Use the direct authorization URL instead of LinkedIn's OAuth tools page |
| Community Management API greyed out | Other products already on the app | Create a new app with no other products — it must be the only product |

### Token Lifetime

- Access token: **~60 days** (5,184,000 seconds)
- Refresh token: longer-lived (if provided)
- The CLI auto-refreshes using `refresh_token` when `access_token` expires

### Alternative: Direct Token

Skip the OAuth flow entirely by setting an env var:
```bash
LINKEDIN_ACCESS_TOKEN=xxx linkedin post 01-vision
```

---

## Marketing Content Format

Posts are stored in `marketing/*/post.md` using YAML frontmatter:

```yaml
---
title: Post Title Here
day: 1
demo: Demo Name
link: https://www.sunholo.com/ailang-demos/
assets:
  - "Image: filename.png"
---

Post body text here...

#Hashtags #Here
```

## Architecture

20+ AILANG modules across three layers — publishing, comment ingestion, and the sketch pipeline.

### Publishing + auth + comments

| Module | Purpose |
|--------|---------|
| `types/linkedin_types.ail` | ADTs: Post, Comment, Credentials, State |
| `services/linkedin_auth.ail` | OAuth token refresh (follows gcp_auth.ail pattern) |
| `services/linkedin_content_loader.ail` | Parse YAML frontmatter from marketing posts |
| `services/linkedin_posts.ail` | POST to LinkedIn REST API with `requires { len(text) > 0 && len(text) <= 3000 }` |
| `services/linkedin_comments.ail` | Read-only comment fetching (per-post `Net @limit=1`, global `@limit=20`) |
| `scripts/oauth_server.ail` | OAuth2 token-exchange handler, uses `std/net.urlEncodeForm` |
| `main.ail` | CLI dispatch with subcommands |

### Sketch pipeline (comment → public sketch)

| Module | Purpose |
|--------|---------|
| `types/sketch_types.ail` | ADTs: Topic, Signal, TopicScore, ExtractedContent, Sketch, FeatureCard |
| `services/sketch_detect.ail` | Parse comment text → `(url, topic)` extraction |
| `services/sketch_extract.ail` | Fetch URL (rejects non-2xx), invoke `docparse`, classify via `std/ai` |
| `services/sketch_rubric.ail` | 17 pure scorers, all contract-bounded `ensures { points <= maxPoints }` |
| `services/sketch_rubric_signals.ail` | Signal manifest — name, max points, AILANG-feature mapping |
| `services/sketch_features.ail` | Three feature cards per topic with code samples + AILANG docs links |
| `services/sketch_template.ail` | Render sketch HTML via `replaceMany` over `templates/sketch.html` |
| `services/sketch.ail` | End-to-end: fetch → score → render → write |
| `services/sketch_dispatch.ail` | Process queued comments, enforce daily + 30-day quotas |
| `services/sketch_queue.ail` | Persistent queue (sketch_queue.json) |
| `services/sketch_history.ail` | 30-day per-(domain, topic) replay protection |
| `services/sketch_leaderboard.ail` | Rank entries, render leaderboard JSON + topic pages |
| `sketch_main.ail` | CLI entry for one-off sketch generation |
| `sketch_dispatch_main.ail` | CLI entry for the 3-hourly dispatcher |
| `sketch_seed_main.ail` | Hand-curated 30-page seed set with `argv` slicing for memory-safe batches |
| `leaderboard_main.ail` | CLI entry to rebuild all three leaderboards from disk |
| `tests/test_rubric.ail` | 50 assertions covering every scorer + the aggregator + polarity rules |

### Templates + data

| Path | Purpose |
|--------|---------|
| `templates/sketch.html` | Per-sketch page (radar, breakdown, feature cards, leaderboard rank) |
| `templates/topic_index.html` | Per-topic leaderboard page (accordion catalog of primitives + ranked list) |
| `data/state.json` | `slug → postUrn` for every published post (cron uses this to know what to fetch) |
| `data/sketch_queue.json` | Pending sketch requests (idempotent on `(avatarSeed, url, topic)`) |
| `data/sketch_history.json` | 30-day window for per-(domain, topic) dedup |
| `data/sketch_budget.json` | Daily dispatch budget tracker |
| `design/scoring-rubric.md` | Public methodology (the one rule + signal table) |
| `design/sketches.md` | Original sketches design doc |

## Auth Patterns

| Method | How |
|--------|-----|
| Credentials file | `~/.ailang/linkedin/credentials.json` (auto-refresh) |
| Env var override | `LINKEDIN_ACCESS_TOKEN=xxx` (skip refresh) |
