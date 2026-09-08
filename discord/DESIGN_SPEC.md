# Discord: AILANG packages and protocol-first local agent application

Status: implementation started, 2026-09-08. Owner: user + coding agent.

## Purpose

Give local AI agents context about the user's Discord participation and tools to
read and write Discord. Exercise AILANG itself, its package ecosystem, and open
agent/UI protocols; capture concrete friction for core maintainers.

## Agreed architecture

- `ailang-packages/packages/discord`: new `sunholo/discord` REST client. Typed
  messages, errors, string snowflakes, request construction, parsing, pagination.
- `ailang-packages/packages/agui`: new `sunholo/agui` pure event codecs and sequence
  checks. First supported subset: run lifecycle, text, tool calls/results, state
  snapshots and CUSTOM envelopes. JSONL replay first; live HTTP/SSE is a separately
  tested transport milestone, not implied by emitting event JSON.
- Existing `sunholo/a2ui`: additive versioned module implementing A2UI 0.9.1
  envelopes and a reply-review surface; preserve the existing custom component API.
- `ailang-demos/discord`: CLI entrypoint, local configuration/state, activity
  selection, draft workflow, protocol adapter and MCP exports. A dedicated package
  manifest lets local development depend on the sibling packages without changing
  dependencies of unrelated demos.
- External agents consume MCP/JSON and supply summaries/drafts. No model choice or
  API key required for the first slice. A built-in model integration is optional.

## Access and credentials

Use a bot token, initially `DISCORD_BOT_TOKEN`, optionally a local token file.
Never accept the token through tool arguments or print it. An existing Clawdbot bot
may be reused after identifying its installation and permissions. No credentials
were found in standard local Clawdbot/OpenClaw directories during planning.

The bot must be installed in target servers and have View Channel and Read Message
History, plus Send Messages for writes (thread writes have separate permissions).
Message Content Intent is needed for general content access. Personal membership
does not confer bot access. No self-bot, arbitrary account impersonation or broad
OAuth2 account-history promise. Initial scope: guild text channels and explicit
thread IDs; automatic thread discovery and Gateway events are follow-up work.

## Application contract

Commands: doctor, channels, read, sync, activity, draft, send, reply, mcp, protocol-demo.
JSON results include source IDs/links, errors and coverage. Reading supports explicit
pagination; sync records cursors only after durable storage. Bounded sync reports
incomplete coverage rather than skipping unseen pages. Activity filters configured
channels by author, mentions and time, retaining nearby conversation as context.

One application layer is shared by CLI and MCP. AG-UI events describe its workflow;
A2UI describes its review surface. Protocol/UI input is validated on the backend.
Incoming Discord text is data, not authorization to use tools.

Reads and writes use configured channel allowlists. Writes require explicit local
enablement. Direct CLI send is deliberate; MCP can operate under that same configured
write policy. Draft submissions bind to stored draft ID and revision, validate text
and destination, and reject stale/duplicate actions. Allowed mentions default to
none. Writes with unknown outcomes are not automatically retried. Discord rate-limit
metadata is returned as structured errors; bounded read retries may follow.

Local state and credentials are excluded from git. Use private directories/files;
write state atomically and serialize writers. CLI launcher may handle process and
directory setup; HTTP, parsing, policy and protocol logic must remain AILANG.

## Example acceptance flow

Read a permitted channel -> emit activity with message links -> external agent
prepares draft -> CLI or A2UI action submits a specific revision -> Discord returns
message ID -> read back that ID. Run offline with synthetic fixtures first; live
posting requires a selected test channel and explicit authorization for the content.

## Protocol versions and evidence

- Discord REST v10: https://docs.discord.com/developers/resources/message
- AG-UI subset follows https://docs.ag-ui.com/concepts/events ; pin the independent
  SDK validator version and source revision in test fixtures.
- A2UI 0.9.1: https://a2ui.org/specification/v0.9.1-a2ui/ ; pin upstream schemas.
- A2UI via AG-UI uses the upstream fixed-layout `a2ui_operations` tool-result
  binding. See https://github.com/ag-ui-protocol/ag-ui/tree/main/skills/ag-ui-a2ui-integration.

Validate serialized output with upstream schemas/SDK. Tests must include malformed
input, unusual IDs, 403/429, missing fields, duplicate/stale draft submissions,
pagination exceeding one page, and exact MCP tool exposure. Protocol event production
alone does not establish browser rendering or streaming interoperability.

## WASM and deferred scope

Keep codecs, UI builders, filtering and reducers pure for later WASM reuse. The
initial executable is local CLI/MCP. A browser UI can call a local credential-holding
service. Gateway heartbeat/resume, full protocol coverage, attachments upload,
automatic thread discovery, OAuth2 user flows and public hosting are deferred.

## Working method

Update SPRINT_PLAN.md after each milestone. Record each reproducible language,
runtime, package or documentation issue in FRICTION.md with version, exact command,
minimal repro, actual/expected behavior and workaround. Do not silently shift core
functionality to Python/JS. Prepare core reports; distinguish environmental failures
from AILANG defects. No release/publish or Discord message is implied by planning.

## Implemented scope and current limits (2026-09-08)

CLI/MCP and protocol packages are implemented and covered by offline integration
checks. AG-UI is JSONL replay (including real draft creation), not live HTTP/SSE.
The pinned SDK validator is @ag-ui/core 0.0.59; A2UI schema revision is recorded in
tests/schemas/SOURCE.json. Nine native MCP tools share service.ail with the CLI.

Sync defaults to all configured channels, with bounded resumable history traversal.
Activity accepts an optional configured user and ISO date/RFC3339/message-ID/last-24h
filter. It collects available reply context. Draft submit supports reviewed text at
the stored revision; there is no separate edit/revision increment operation yet.
Caches are local JSON and have no retention limit. New-message polling does not
reconcile old edits/deletions. Filesystem locking is the explicit host workaround:
Python flock across processes and a request queue within the native MCP transport.

Live access, posting, package publication, browser rendering and SSE remain unverified
or deferred as indicated in SPRINT_PLAN.md. Core reports are prepared, not sent.
