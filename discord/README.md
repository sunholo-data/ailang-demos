# Discord activity and agent interaction in AILANG

Local CLI and native MCP tools backed by `sunholo/discord`, `sunholo/agui` and
`sunholo/a2ui`. Discord HTTP, validation, activity selection, draft state and
protocol encoding are AILANG. The Python launcher only handles private directory
setup, process lifetime and serialization of concurrent MCP requests.

## Setup

Requires AILANG >=0.35.0 (tested on v0.35.2-dirty), Python 3 on macOS/Linux, and the
sibling `ailang-packages` checkout containing the new package versions. No model
key is required: your existing agent supplies summaries and draft text.

Clone both development branches into sibling directories:

```sh
git clone --branch build/discord-protocol-demo https://github.com/sunholo-data/ailang-packages.git
git clone --branch build/discord-protocol-demo https://github.com/sunholo-data/ailang-demos.git
cd ailang-demos/discord
ailang lock
./ailang-discord protocol-demo
```

The protocol example runs offline. For the integration suite, run
`npm ci --ignore-scripts && npm test` in the same directory. For live Discord access:

```sh
cp config.example.json config.json
# Edit guild_id, user_id and channels to real Discord IDs.
export DISCORD_TOKEN_FILE=/absolute/path/to/protected-bot-token.txt
./ailang-discord doctor
./ailang-discord channels
```

Alternatively set `DISCORD_BOT_TOKEN` in your process environment. Token files contain
only the token; keep them outside git and readable only by your account. Never paste
the token into agent prompts/MCP arguments. An existing Clawdbot/OpenClaw bot token
can be reused if valid. No old local configuration was found during development.

Enable Discord Developer Mode to copy IDs. Install the bot in the server, grant
View Channel and Read Message History, and enable Message Content Intent for general
message text. Send Messages (or Send Messages in Threads) is needed for writes.
This uses the bot's access and identity, not your personal account's permissions.

The config is local and ignored by git. `DISCORD_CONFIG` overrides its location.
`DISCORD_STATE_DIR` defaults to `~/.ailang/discord`; it holds channel caches, draft
receipts and the writer lock. Use separate state directories for independent bots.

## Read, sync and activity

```sh
./ailang-discord read --channel CHANNEL_ID --limit 50
./ailang-discord read --channel CHANNEL_ID --before MESSAGE_ID
./ailang-discord sync                       # all configured channels
./ailang-discord sync --channel CHANNEL_ID --pages 5
./ailang-discord activity --since yesterday # configured user, all configured channels
./ailang-discord activity --channel CHANNEL_ID --user USER_ID --since 2026-09-08
```

Output is JSON. `read` returns one page and `next_before`; before/after are exclusive.
`sync` walks history in pages of 100 and saves progress after each page. If `complete`
is false, invoke it again to continue. It freezes the newest ID for the current
cycle, so new arrivals are collected in the next cycle. Caches have no automatic
retention limit yet; initial sync can traverse all available channel history.

Activity selects authored messages and mentions, plus available reply context and
source links. `--since` accepts an ISO date, RFC3339 timestamp, message ID, or
`yesterday` (last 24 hours). It reports cache coverage. It is a context bundle for
your agent, not a model-generated summary or a record of personal presence/activity.
Polling captures new messages; it does not reconcile old edits/deletions. Thread
IDs work when explicitly configured; thread discovery and attachment content are
not included in this first version.

## Writes and review

Set `enable_writes` to true and add specific IDs to `write_channels` in config.
The destination must also be in `channels`. This grants the local CLI/MCP permission
to send to those channels; clients should apply their own human-review policy where
desired. Incoming Discord text and UI actions never change that configuration.

```sh
./ailang-discord draft --channel CHANNEL_ID --message MESSAGE_ID --text 'Proposed reply'
./ailang-discord submit --draft DRAFT_ID --revision 1 --text 'Reviewed reply'
./ailang-discord send --channel CHANNEL_ID --text 'Hello'
./ailang-discord reply --channel CHANNEL_ID --message MESSAGE_ID --text 'Thanks'
```

Draft creation returns its ID/revision and an `a2ui_operations` review surface.
Submitting binds to the stored destination/reply and current revision. Edited text
is validated before sending. Duplicate or stale submissions are rejected. The draft
is marked `sending` before HTTP; a crash or ambiguous failure leaves it blocked for
manual reconciliation. The receipt stores the returned Discord message on success.
There is no automatic retry for writes. Direct `send`/`reply` do not use durable
draft receipts; use the draft workflow when replay protection matters.

Mentions are disabled by default, including automatic reply pings. REST errors
include status/code and rate-limit retry time without echoing credentials or raw
remote bodies. A 429 is surfaced to the agent/caller, not automatically slept/retried.

## MCP

Configure an MCP client with this executable (absolute path):

```json
{
  "mcpServers": {
    "ailang-discord": {
      "command": "/absolute/path/ailang-demos/discord/ailang-discord",
      "args": ["mcp"],
      "env": {
        "DISCORD_CONFIG": "/absolute/path/discord-config.json",
        "DISCORD_TOKEN_FILE": "/absolute/path/discord-bot-token.txt"
      }
    }
  }
}
```

Tools: `discord_doctor`, `discord_channels`, `discord_read`, `discord_sync`,
`discord_activity`, `discord_send`, `discord_draft`, `discord_submit`, `discord_action`.
Read requires channelId, limit, before and after (use empty strings for unused
cursors). Activity takes channelId (empty = all), userId (empty = configured user)
and since. Other signatures are advertised by native MCP. Tool results are JSON text
with `ok`; clients must inspect `ok` and `error`, as application errors are not MCP
transport failures. The MCP server holds the state writer lock for its lifetime;
stop it before running a mutating CLI command against the same directory.

## AG-UI and A2UI

```sh
./ailang-discord protocol-demo                # deterministic fixture, no credentials
./ailang-discord review --channel CHANNEL_ID --text 'Proposed reply' > review.jsonl
./ailang-discord action --file user-action.json
```

`review` creates a real stored draft and returns a completed AG-UI JSONL run with
tool arguments/results, state and an A2UI operations envelope. It does not call a
model. `protocol-demo` is explicitly simulated. The packages support a documented
AG-UI subset and A2UI 0.9.1; existing A2UI custom component exports are preserved.

The action file has `version: "v0.9.1"` and an `action` object containing
`name: "submitDraft"`, `surfaceId: "draft-DRAFT_ID"`, `sourceComponentId: "submit"`,
an RFC3339 `timestamp`, and `context: {draftId, revision, text}`. The backend checks
the stored draft and local write policy. A future renderer must register the matching
basic catalog and transport actions back through this endpoint/tool.

Current verification covers serialized events and upstream schemas. A live AG-UI
HTTP/SSE endpoint, renderer/browser round-trip and WASM build are follow-up work.
Do not point an AG-UI HTTP client at the MCP server and expect it to be an AG-UI server.

## Verification and development

```sh
ailang lock                 # regenerate local absolute package paths after cloning
npm ci --ignore-scripts     # test dependencies only; CLI needs no Node packages
npm test
../scripts/check_demos.sh --only discord --verbose
```

Tests run AILANG, exercise caches/drafts and concurrent MCP requests, validate AG-UI
with pinned `@ag-ui/core`, and validate A2UI against pinned upstream JSON schemas.
They use temporary local state and make no Discord API calls. Live read/write/read-back
remains pending a bot token and designated test channel. Package versions are local
development changes, not published registry releases.

See [design](DESIGN_SPEC.md), [sprint](SPRINT_PLAN.md), [friction](FRICTION.md), and
[prepared core feedback](CORE_FEEDBACK.md). Files under `repros/` intentionally fail
to demonstrate observed issues; exclude them from ordinary demo checks.
