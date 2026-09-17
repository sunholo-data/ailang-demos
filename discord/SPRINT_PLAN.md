# Sprint: Discord and agent/UI protocols

## M0 — Decisions and protocol fixtures
- [x] Inspect demos, packages, Discord auth and AG-UI/A2UI specifications.
- [x] Record architecture, scope, credentials and success criteria.
- [x] Pin independent protocol schemas/validator and synthetic fixtures.

## M1 — Reusable Discord package + CLI
- [x] Implement typed IDs/messages/errors, REST request/response handling.
- [x] Implement doctor, channels, paginated read, send and reply.
- [x] Configure channel access and token loading without secret output.
- [x] Verify package imports, malformed responses, rate limits and offline CLI.

## M2 — Local activity and draft workflow
- [x] Persist messages/cursors safely; report sync coverage.
- [x] Author/mention/time filtering with source links and surrounding context.
- [x] Draft storage, revision validation and duplicate-send protection.

## M3 — Protocol packages and adapters
- [x] AG-UI event codecs and sequence validation; replayable example.
- [x] Add A2UI 0.9.1 module preserving existing component module.
- [x] Validate a reply surface and incoming action against upstream schemas.
- [x] Share application functions through AILANG native MCP; test tool list/calls.
- [x] Verify independent AG-UI SDK accepts produced events.

## M4 — Integration and handoff
- [x] Integration checks for CLI, MCP and protocol replay.
- [x] README, package AGENT.md guides and demo check registration.
- [x] Native package evidence retrofit: contracts, Net budgets and tests for
  sunholo/discord and sunholo/agui; both pass `ailang pkg quality --strict`.
- [ ] Live read/write/read-back in an explicitly selected test channel.
- [x] Friction evidence and reports prepared for core.

## Follow-up (not prerequisites for CLI milestone)
- Live AG-UI HTTP/SSE request/response endpoint and independent frontend test.
- WASM renderer; Gateway streaming; richer thread/attachment support.

## Current blockers
- Live Discord validation needs the bot credential location and target channel.
- Sibling package writes were completed through the workspace approval mechanism.

## Verification — 2026-09-08

- New Discord and AG-UI packages plus additive A2UI module type-check.
- `scripts/check_demos.sh --only discord --verbose`: 2 pass, 0 fail, 0 skipped.
- `cd discord && npm test`: all offline integration checks pass.
- Independent validators: @ag-ui/core 0.0.59, AJV 8.20.0 + ajv-formats 3.0.1,
  pinned A2UI 0.9.1 upstream schemas/catalog.
- Coverage includes 200-message multi-page sync and subsequent arrivals, ID ordering,
  malformed payloads, permissions/rate-limit classification, mention policy, local
  draft/action validation, real-draft AG-UI output, date filtering, exact nine-tool
  MCP surface, concurrent requests and exclusion of a second writer process.
- Confirmed bug/diagnostic repros retained separately; expected failures do not run
  in normal demo checks. Core feedback prepared in CORE_FEEDBACK.md, not sent.
- No live Discord requests, messages, registry publication or browser deployment.

## Verification — 2026-09-17 (0.2.0 package release)

Feature release published after the 0.1.0 docs work:

- `sunholo/agui@0.2.0`: new `sunholo/agui/input` module — `decodeRunAgentInput`
  parses the request-side RunAgentInput payload (required threadId/runId, strict
  role discrimination incl. tool messages with toolCallId, defaults for optional
  fields). 6 new native tests → 19 total, 15 contract clauses, 0 gaps, smoke
  12/12.
- `sunholo/discord@0.2.0`: `editMessage` (PATCH), `typing` (204 No Content
  handled), thread support — `startThread` from a message, `activeThreads`,
  exported `parseChannel`; responseJson's error path factored into shared
  `classifyError` (contract: result.status == status). 24 native tests (was 22),
  26 contract clauses, 0 gaps, smoke 14/14. Threads are channels: reads and
  sends work with thread IDs unchanged.
- Both published to registry.ailang.sunholo.com (smoke gates green inside
  publish); consumer verification installs 0.2.0 of both from the registry,
  compiles and runs event-encode + input-decode checks.
- Consumer docs (README quickstarts/effects tables, AGENT.md install + caps
  notes) committed in bdcfee6 and shipped with these tarballs.
- Demo lock refreshed; demo checks 2/2 and npm test 4/4 still green.
- Remaining: browser/SSE integration milestone (the SSE server consumes
  `decodeRunAgentInput` and emits the event codecs); four older unsent feedback
  reports.

## Verification — 2026-09-17 (registry publication)

Both protocol packages published to the AILANG registry (immutable versions):

- `sunholo/agui@0.1.0` and `sunholo/discord@0.1.0` → https://registry.ailang.sunholo.com
- Before publishing, each package gained an offline `_smoke.ail` boot gate
  (discord 12/12 checks, agui 10/10 checks) — the publish flow executes it
  automatically ("✓ _smoke.ail passed"). Pure helpers in the smoke files carry
  contracts and the smoke functions carry `@limit` IO budgets, so
  `ailang pkg quality --strict` stays at 0 gaps (24 contract clauses for discord,
  10 for agui).
- Effect ceilings widened minimally to admit the smoke gate (discord
  `[Net, IO]`, agui `[IO]`), documented in each AGENT.md; library surfaces
  unchanged.
- Consumer verification: a scratch package with `"sunholo/discord" = "0.1.0"`
  and `"sunholo/agui" = "0.1.0"` registry deps resolved via `ailang lock`,
  compiled and ran (`id-ok=true path-ok=true`, RUN_STARTED event encoded).
- Demo re-checked after the lock refresh: `scripts/check_demos.sh --only
  discord` 2/2. The demo keeps path dependencies for co-development.
- Remaining: browser/SSE integration; four older unsent feedback reports
  (unary bang, reserved-parameter diagnostics, relative imports, MCP locking,
  Observatory storage).

## Verification — 2026-09-17 (live Discord validation)

First live end-to-end round-trip, performed with a dedicated test bot after the
package evidence retrofit. Bot "Daneel" (application user 1550164439481851914),
sunholo guild 1162757114259853342, designated test channel #daneel
(1549868288002236417). Token supplied via DISCORD_TOKEN_FILE (0600 file outside
the repo); never printed. config.json stays gitignored (IDs only).

- `channels`: bot lists all 16 guild channels; #daneel flagged configured.
- `doctor`: identity checked (bot_id 1550164439481851914, username Daneel);
  writes reported disabled at that point.
- `read --channel 1549868288002236417 --limit 5`: five live messages with full
  content (Message Content Intent confirmed ON), pagination cursor `next_before`
  returned, one non-text message correctly surfaced with empty content plus the
  documented content_note.
- `send --channel 1549868288002236417 --text "AILANG live validation 2026-09-17
  — safe to delete"` (explicitly authorized by the user): Ok, message ID
  1550168468115169352, author Daneel, mentions empty (outgoing mention policy held).
- Read-back `read --channel ... --limit 3`: the sent message returned first with
  byte-identical content including the em dash, matching ID and timestamp.
- `enable_writes` returned to false after the round-trip.
- Lock refresh: `ailang lock` re-pinned path dependencies after the package
  retrofit (content-hash warning observed and cleared).
- No reply/draft live tests were performed this session; offer stands.
- Remaining: browser/SSE integration, registry publication, remaining unsent
  feedback items (unary bang, reserved-parameter diagnostics, relative imports,
  MCP locking, Observatory storage).

## Verification — 2026-09-15 (package evidence retrofit)

Native tests, contracts and effect budgets added to both protocol packages
(`build/package-authoring-followups` tooling; API unchanged except exporting
`parseChannels` and `eventName`, both codec surfaces). See AGENT.md in each package
for the full record:

| Package | Native tests | Contract clauses | Net budgets | strict inventory |
|---|---:|---:|---:|---|
| sunholo/discord | 22 | 22 | 6 × `@limit=1` | 0 gaps (was 19) |
| sunholo/agui | 13 | 8 | — (zero effects) | 0 gaps (was 8) |

- `validate_package.sh` passes end-to-end on both packages (exit 0).
- Contract-derived runtime properties: 19 runnable cases × 100 generated inputs pass
  (18 discord + 1 agui); 10 skips are structural (no generator for imported `Json`,
  and one out-of-contract requires filter on `digits`).
- Z3 verify: discord 1 proved / 12 skipped with reasons; agui 8 skipped. 0
  counterexamples, 0 unknown. Runtime properties carry the behavioral evidence.
- Demo checks still green after the retrofit: `scripts/check_demos.sh --only
  discord` 2/2, `npm test` 4/4 groups.
- Core feedback extended with three new test-harness findings (string-blind stripper,
  broken forall property lowering #624 confirmation, float-binop dictionary error in
  test bodies) in CORE_FEEDBACK.md; the four harness reports were sent to core on
  2026-09-15 via the canonical message store (inbox ailang-core; IDs in
  CORE_FEEDBACK.md).
- Still outstanding: live read/send/read-back (needs bot credential location, test
  channel, authorized message), browser/SSE integration, registry publication.

## Resume

Locate the previous bot configuration on the user's chosen machine (do not print
secrets), configure a test channel, run doctor/read, then obtain specific test-message
content/authorization before the live send/read-back. Browser/SSE work remains a
separate follow-up milestone. No credentials or channel were provided in this session.
