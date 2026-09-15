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
  test bodies) in CORE_FEEDBACK.md; not sent.
- Still outstanding: live read/send/read-back (needs bot credential location, test
  channel, authorized message), browser/SSE integration, registry publication.

## Resume

Locate the previous bot configuration on the user's chosen machine (do not print
secrets), configure a test channel, run doctor/read, then obtain specific test-message
content/authorization before the live send/read-back. Browser/SSE work remains a
separate follow-up milestone. No credentials or channel were provided in this session.
