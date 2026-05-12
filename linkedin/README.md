# LinkedIn Marketing CLI — AILANG Demo

Publish marketing content to a LinkedIn company page and read comments for AILANG Cloud ingestion. Built in [AILANG](https://github.com/sunholo-data/ailang), exercising `std/net` REST API patterns and capability budgets.

## Install

```bash
ln -s $(pwd)/linkedin/ailang-linkedin ~/.local/bin/ailang-linkedin
```

## Usage

```bash
ailang-linkedin list                        # List all 20 posts with status
ailang-linkedin post --dry-run 01-vision    # Preview without posting
ailang-linkedin post 01-vision              # Publish to LinkedIn
ailang-linkedin comments                    # Fetch comments (human-readable)
ailang-linkedin comments --json             # JSON output for AILANG Cloud
ailang-linkedin status                      # Auth status + summary
ailang-linkedin setup                       # Show setup instructions
ailang-linkedin auth                        # Run the OAuth2 dance (one-time)
```

## Comment Flow

```
linkedin comments --json  →  AILANG Cloud  →  website content
```

Comments are read-only from LinkedIn. No automated replies — comment data is forwarded to AILANG Cloud for website content generation (testimonials, FAQs, engagement reports).

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

6 AILANG modules:

| Module | Purpose |
|--------|---------|
| `types/linkedin_types.ail` | ADTs: Post, Comment, Credentials, State |
| `services/linkedin_auth.ail` | OAuth token refresh (follows gcp_auth.ail pattern) |
| `services/linkedin_content_loader.ail` | Parse YAML frontmatter from marketing posts |
| `services/linkedin_posts.ail` | POST to LinkedIn REST API with contracts |
| `services/linkedin_comments.ail` | Read-only comment fetching + JSON output |
| `main.ail` | CLI dispatch with subcommands |

## Auth Patterns

| Method | How |
|--------|-----|
| Credentials file | `~/.ailang/linkedin/credentials.json` (auto-refresh) |
| Env var override | `LINKEDIN_ACCESS_TOKEN=xxx` (skip refresh) |
