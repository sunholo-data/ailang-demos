# CLAUDE.md — LinkedIn Marketing Demo

## Purpose

AILANG demo that publishes marketing content to a LinkedIn company page and reads comments for AILANG Cloud ingestion. Comments are read-only — no automated replies.

## Quick Commands

```bash
ailang-linkedin --check                     # Type-check all modules
ailang-linkedin list                        # List posts with status
ailang-linkedin post --dry-run 01-vision    # Preview
ailang-linkedin post 01-vision              # Publish
ailang-linkedin comments --json             # JSON for AILANG Cloud
ailang-linkedin status                      # Auth check
ailang-linkedin auth                        # OAuth2 dance (one-time)
```

## Setup

See [README.md](README.md) for full LinkedIn Developer App setup guide and troubleshooting.

Credentials: `~/.ailang/linkedin/credentials.json`
Env override: `LINKEDIN_ACCESS_TOKEN=xxx`

## Capability Budgets

| Entry | Budgets |
|-------|---------|
| `main` | `IO @limit=200, FS @limit=150, Net @limit=30, Env` |

## Contracts

| Function | Contract |
|----------|----------|
| `linkedinCreatePost` | `requires { length(text) > 0 && length(text) <= 3000 }` |

## Content Format

Posts in `marketing/*/post.md` use YAML frontmatter (`title`, `day`, `demo`, `link`, `assets`) with body text after the closing `---`.

## House style for post bodies

Learned the hard way while shipping 00-meta and 01-vision — LinkedIn's "Little Text Format" only accepts a narrow subset of inline syntax. Stick to these:

- **No backticks.** They render as literal `` ` `` characters. Quote technical terms instead: `"AI @limit=10"`, `"Net @limit=1"`.
- **No `**bold**`.** No emphasis syntax of any kind survives. Carry emphasis through line breaks and word choice.
- **No markdown bullets (`-`).** Use em-dashes at the start of a line: `— like this`. Consistent with the AILANG voice.
- **Parens / brackets / `@` / `|` get auto-escaped** by `linkedinEscapeLittleText` — safe to use freely in prose.
- **Hashtags pass through** — `#AILANG` at the end of the body becomes a real hashtag.
- **Numbers stay open.** Avoid hardcoding the size of the campaign ("the next 20 posts") or the demo count ("these 10 demos") unless the number is permanent.

### Standard CTA — include in every post

Closer paragraph that drives readers to the LinkedIn page on the demos site, where their reply will surface:

```
Reply below; your comment surfaces, anonymously, at https://www.sunholo.com/ailang-demos/linkedin within the hour. Your sceptical eyebrow steers the next post.
```

Tweak the second sentence per post (the "what your reply steers" framing), but keep the URL + "within the hour" + "anonymously". This is what makes engaging worthwhile for the reader.
