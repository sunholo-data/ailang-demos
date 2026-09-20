# Sprint plan — The Deliberating Nouls v0 (offline world + tiers, spec-approved)

Design: `decisions/DESIGN_SPEC.md` (approved with recommended defaults: dir
`decisions/`, OpenRouter transport, artifact injection v1, Worker-hosted WASM,
narrator deferred to v2, SVG-flat art). This sprint delivers v0 plus the live
tier's code paths: everything except what physically requires a live key or a
browser.

Validation in this session: the `ailang` CLI runs (v0.40.2-6-ge12e0335d).
Reproduced on it: the historical inline-test bug ("cannot apply non-function
value: nil") is FIXED — native `tests [...]` on functions calling imported
stdlib pass (`ailang test` on a scratch probe, 1/1 green). Program execution
of live network calls needs an operator-run; those steps are marked
**operator-pending** with exact commands.

## Tasks

- **T1 Package manifest.** `decisions/ailang.toml`: name `sunholo/decisions_demo`,
  path dep on `../../ailang-packages/packages/decisions`, effects max
  `[IO, FS, Net, Env, Rand]` (AI/Clock deferred to v2 narrator). `ailang lock`.
  Done = lock generated, `ailang check` resolves `pkg/sunholo/decisions/decide`.

- **T2 `world.ail` (pure).** Entities are description-only (no behavior tags;
  `kind` is a cosmetic shape class, never sent to the model). Creatures with
  needs/memory/personality-key/intent. `stepWorld` (deterministic), `perceive`
  (state Json: vitals, nearest visible entities with descriptions, memory,
  day phase), decision-point predicates (`shouldDeliberate`), `digest` (stable
  world digest for determinism tests). Done = check + inline tests + seeded
  determinism property in selftest.

- **T3 `souls.ail` (pure).** Personality table (act thresholds, detect cut
  points, flavor, extra question, cadence), per-deliberation batched question
  builder (`buildQuestions`), `sampleFrom` (cumulative walk of a distribution
  with a roll — the bank-the-distribution rule as behavior), question ⇄ Json
  codec for banking (`questionToJson`/`questionOfJson`). Done = check + tests.

- **T4 `render.ail` (pure, browser-safe).** SVG fragment builders:
  `escapeHtml`, `renderWorld` (world Json → SVG: ground, day/night, entities
  with hover titles, creatures with intent arrows + deliberation spinner),
  `renderBars` (an answer's distribution as bars + a roll marker),
  `renderInspector` (percept + questions + distribution panel). Std-only imports
  (self-contained module, discord renderer.ail precedent) + self-check probe.
  Done = check + tests (escaping, bar widths sum, probe).

- **T5 `bank.ail`.** BankRow ⇄ JSONL line codec, `appendRow`/`readRows`
  (`! {FS}`), `replayRow` = `parseAnswers(body, questions)` on banked rows.
  Rows carry `{tick, creatureId, state, questions, body, roll, action}` — the
  whole-Decision banking doctrine as a file. Done = check + round-trip tests
  with a synthetic body fixture (clearly labeled synthetic, wire-shaped after
  the package's own pinned fixtures).

- **T6 `oracle.ail`.** `planDeliberation` (pure: percept + questions),
  `deliberate` (`! {Net, Env, Rand}`: decide → act on answers — sample
  behavior from the distribution, `gate` with the personality threshold,
  `detect` threats, `topK` approach ranking) and `actOnDecision` (pure, also
  the replay path). Degraded path via `decideOrFallback` maps Degraded →
  visible Hesitate (never silent). Done = check + pure-path tests; live call =
  operator-pending.

- **T7 `main.ail` CLI.** Modes: `selftest` (offline assertions incl. seeded
  determinism, bank round-trip, replay of the synthetic fixture, render probe),
  `simulate --ticks --seed` (keyless tier ③: random-soul behavior, prints
  digest — two runs must match), `record --ticks --model --bank` (live tier ①:
  bank JSONL; **operator-pending** — needs `OPENROUTER_API_KEY` + caps),
  `replay --bank` (tier ②: parseAnswers + actOnDecision on banked rolls,
  verifies banked actions reproduce), `render --file` (world Json → SVG).
  Done = check + `selftest` + `simulate` green here; `record` operator-pending.

- **T8 Browser host.** `site/index.html` + `site/worker.js` + `site/app.js`:
  Worker-hosted WASM runtime (docparse-loader pattern: preload vendored
  `pkg/sunholo/decisions/decide`, then world → souls → bank → render → oracle
  in dependency order), capability grants (`Rand`, `Net`, `Env`), Env handler
  fed from main-thread localStorage (`openrouter-api-key` — repo convention;
  workers cannot read localStorage, so the key is posted in), 10 Hz tick loop
  with SVG injection, mode switch (simulate / replay / live), artifact
  injector (typed description → new entity), click-to-inspect panel.
  **Operator-pending:** browser runtime validation via `scripts/serve.sh`
  (also the wasm freshness gate); live tier gated on the T9 spike.

- **T9 Live-Net spike (code inspection done, runtime check operator-pending).**
  Findings so far: effect-handler callbacks may return Promises
  (`awaitPromise` blocks only the wasm goroutine — `cmd/wasm/effects.go`);
  `Env`/`Stream`/`AI` ops are registry-dispatched and JS-overridable. BUT
  `_net_httpRequest`'s Go impl does a direct HTTP call (not registry dispatch),
  so a JS `Net` handler override does NOT intercept it on current core; the
  plausible live path is Go-wasm's native net/http → browser fetch with
  `ailangGrantCapability('Net')`, subject to CORS on
  `openrouter.ai/api/alpha/decisions`. If CORS blocks it, fallback = CLI
  `record` (T7) + browser replay tier (already the primary demo path).
  Recorded here so v1 planning starts from evidence, not hope.

- **T10 Serving + docs.** `scripts/serve.sh`: decisions block (copy
  `render.ail`/modules, vendor `decide.ail` from the sibling checkout into
  `_site/decisions/ailang/pkg/...`, symlink site assets). `decisions/README.md`
  (run instructions, tier table, cost notes, data-boundary notice).
  CLAUDE.md structure entry. Done = serve.sh runs clean (bash -n + assemble
  locally), README accurate.

## Explicitly out of scope (v1/v2)

Pack councils, second-thoughts, rich percepts (NoulR/ChoiceR), narrator
(`! {AI}`), A2UI envelope dogfood, 60 fps interpolation, mobile layout.

## Report format

Compile (`ailang check`), tests (`ailang test`), runtime (`selftest`,
`simulate`) and operator-pending items are reported separately, per repo rule.