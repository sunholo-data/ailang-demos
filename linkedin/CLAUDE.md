# CLAUDE.md — LinkedIn Marketing Demo

## Purpose

AILANG demo that publishes marketing content to a LinkedIn company page and reads comments for AILANG Cloud ingestion. Comments are read-only — no automated replies.

## Quick Commands

```bash
linkedin --check                     # Type-check all modules
linkedin list                        # List posts with status
linkedin post --dry-run 01-vision    # Preview
linkedin post 01-vision              # Publish
linkedin comments --json             # JSON for AILANG Cloud
linkedin status                      # Auth check
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
