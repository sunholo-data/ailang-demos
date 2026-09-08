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

## Resume

Locate the previous bot configuration on the user's chosen machine (do not print
secrets), configure a test channel, run doctor/read, then obtain specific test-message
content/authorization before the live send/read-back. Browser/SSE work remains a
separate follow-up milestone. No credentials or channel were provided in this session.
