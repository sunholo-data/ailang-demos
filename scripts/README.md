# Scripts & Hooks

Utility scripts and Claude Code hooks for the demos repo.

## Claude Code Hooks

### Voice Debrief (`session_end_speak.sh`)

Runs `speak` when a Claude Code session ends — gives a spoken summary of what Claude did.

- Extracts Claude's last response from the session transcript
- Pre-fetches git status and includes it inline (no tool calls needed)
- Shows macOS notification with transcript text
- Serializes overlapping sessions with a lockfile
- Skips sub-agents (only debriefs top-level sessions)

### Waiting Alert (`waiting_alert_pre.sh` / `waiting_alert_post.sh`)

Vocal alert when Claude Code has been waiting for user input for more than 60 seconds.

- **PreToolUse**: records pending state, spawns a 60-second background watcher
- **PostToolUse**: clears pending state (auto-approved tools clear instantly)
- Uses macOS `say` for instant TTS (no API call) + notification with "Funk" sound
- Excludes directories matching patterns in `CLAUDE_ALERT_EXCLUDE` env var or `~/.claude/hooks/alert_exclude.conf`

## Install

```bash
# Copy hooks
cp scripts/hooks/session_end_speak.sh ~/.claude/hooks/
cp scripts/hooks/waiting_alert_pre.sh ~/.claude/hooks/
cp scripts/hooks/waiting_alert_post.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/waiting_alert_*.sh ~/.claude/hooks/session_end_speak.sh

# Merge hook config into settings
# See scripts/hooks/example-claude-settings.json for the required settings.json entries
```

## Other Scripts

- `serve.sh` — Local dev server for browser demos
- `check_demos.sh` — Type-check every demo entry point with `ailang check`. Runs in CI. Use `--verbose` to see failure details or `--only <substring>` to filter.

## Showcase regression checks

Use the CLI release in `.ailang-version` (currently v0.20.1), then run
`ailang lock` to install package dependencies before `scripts/check_demos.sh --verbose`.
Missing entry points fail the check rather than silently skipping.

```bash
node --test scripts/smoke/wrapper.test.mjs
npm test --prefix website_builder/portal
npm ci --prefix scripts/smoke
cd scripts/smoke && npx playwright install chromium && cd ../..
# In another terminal, assemble and serve the showcase:
scripts/serve.sh --build --port 8080
BASE=http://localhost:8080 npm run smoke --prefix scripts/smoke
# Audit the public deployment (read-only, no API keys):
BASE=https://www.sunholo.com/ailang-demos npm run smoke --prefix scripts/smoke
```

The browser suite covers 20 routes, eight Office parsing presets, three
extractor presets with AILANG validation, and a live function call in each
verification module. `ONLY=verify` filters demo names. These checks do not
validate live AI responses, microphone input, authenticated Cloud builds,
BigQuery queries, or publishing. Use the pinned release WASM files when
comparing local results with CI; the checked-in development WASM may differ.

See [the September 2026 audit](../DEMO_STATUS.md) for findings and remaining limits.
