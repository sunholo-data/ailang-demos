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

## Verification — 2026-09-17 (0.3.0 embeds)

- `sunholo/discord@0.3.0` published: embed support — the fix for Discord's
  wall-of-text failure mode (plain text loses layout, wraps raggedly, and caps
  at 2000 chars; the Daneel help card in #daneel hit all three). `Embed` =
  title/description/color/footer/fields; `validEmbed` enforces every Discord
  limit (title 256, description 4096, 25 fields of 256/1024, total 6000,
  content-or-embeds); `embedJson` omits empty keys; `sendMessageEmbeds` caps at
  10 embeds per message, mentions suppressed.
- Worked example: the Daneel help address book as an embed (title + 6 fields +
  footer) — fits the 6000 budget, field layout survives. 28 native tests (was
  24), 38 contract clauses, 0 gaps, smoke 15/15.
- Consumer verification: registry-installed 0.3.0 builds the help embed and the
  send body. Demo lock refreshed; demo checks 2/2.
- Generator gap addendum for core: `fieldsFit([EmbedField])` derives (100-case
  PBT) but `validEmbed(Embed)` — a record containing a list of records — skips
  as no_generator (CORE_FEEDBACK.md addendum).
- Remaining: wire Daneel's help output to sendMessageEmbeds (daneel account);
  browser/SSE milestone unchanged; older unsent feedback reports.

## Verification — 2026-09-17 (0.4.0 embed images + brand colors)

- `sunholo/discord@0.4.0` published: embed `image` and `thumbnail` by URL —
  Discord fetches the asset, so brand visuals need no multipart upload
  (file uploads remain unmodeled; host the asset and embed by URL).
- Worked example is now Sunholo-branded: accent 15154199 (Sunholo orange
  #E73C17 per the brand guide at sunholo.com/assets.html) and the hosted
  AILANG architectural study (assets/visuals/service-studies/v2/ailang.webp)
  as image + thumbnail. SVG is not embed-renderable; WebP/PNG are.
- 29 native tests (image/thumbnail URL objects, 2048 URL limit, brand
  embed), 38 contracts, 0 gaps, smoke 15/15; consumer-verified from the
  registry.

## Verification — 2026-09-17 (0.2.1 metadata + live SSE endpoint)

- Metadata patch release `0.2.1` for both packages: ai_summary now covers the
  0.2.0 features and agui's description names the input module (the registry
  search blurb had shipped stale in 0.2.0). Code identical to 0.2.0; smoke
  gates green; `ailang search discord` advertises the full feature set.
- Live AG-UI HTTP/SSE endpoint (offline, token-free — the bot token has moved
  to the daneel account, so no live Discord calls happen from this machine):
  - `discord/ailang-discord-server`: stdlib-only HTTP host. POST /run streams
    the AILANG `serve` step's JSONL as SSE data: frames; POST /action applies an
    A2UI draft-review action; GET / serves the browser page; writer-flock rules
    mirror the CLI launcher.
  - AILANG `serve --file <run-input.json>`: decodes the RunAgentInput request
    with the published sunholo/agui/input@0.2.x module, echoes the last user
    message, creates a real stored draft (A2UI operations included) and emits a
    validateRun-legal event stream. First in-demo consumer of the published
    request codec.
  - Browser page (`discord/site/index.html`): renderer for the streamed events
    plus the action round-trip (submit button built from the draft surface).
  - Integration suite extended to six groups; all pass offline: the SSE stream's
    events are parsed and validated against @ag-ui/core, the run thread/runId
    match the request, the draft payload carries schema-valid A2UI operations,
    and the posted action reaches the structured policy gate (writes disabled,
    no token — exactly the daneel-account deployment shape).
- WASM renderer: `discord/renderer.ail` — a pure, self-contained AILANG module
  (std-only, untrusted content escaped) that maps one AG-UI event JSON to an HTML
  fragment and drafts to review cards with data-attribute action buttons;
  `renderAll` covers replay. 6 native tests, all passing. The browser page loads
  the repo's WASM interpreter (`wasm/ailang.wasm` via the existing AilangREPL
  glue), installs the module with `ailangLoadModule`, self-checks it, and renders
  each streamed frame with `ailangCall('renderer', 'renderEvent', …)`; a
  JavaScript fallback with the identical contract keeps the demo alive if WASM
  is unavailable. The server serves the renderer source and the WASM runtime
  from a strict allowlist. Integration suite extended to seven groups (assets
  served, renderEvent asserted via the CLI); all pass offline.
- Deployment readiness: `discord/DEPLOY.md` runbook for the Daneel account
  (visitor experience, env knobs, systemd sketch, public-demo vs live modes
  gated by the AILANG policy layer, health checks); `discord/Dockerfile`
  (Python + pinned ailang binary + WASM runtime; token/config mounted at
  runtime, never baked in). Server hardened for exposure: configurable bind
  host (loopback default), CORS closed by default with an explicit origin
  option, 64KB body cap. The page now surfaces the Discord message link when a
  live send succeeds — that link is the visitor-visible payoff. Demo hub nav
  link is added at deploy time so the static site never points at a dead
  origin.
- Remaining in the milestone: deploy on the Daneel host, add the hub link,
  Gateway streaming, thread/attachment richness.

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
