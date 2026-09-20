## Current update — AILANG branding and player-created Nouls (2026-09-20)

Preview build `ailang-11`. Official AILANG SVG, locally hosted Montserrat and
Sunholo tokens come from https://www.sunholo.com/assets.html (kit revision
aa420f4c1ebd). White/pale ground, slate and orange now cover the UI, interactable
objects and regenerated Blender sprites. Sources/licenses live in
`site/assets/brand/`. Desktop, phone, pointer and touch are checked in Chrome.

“Create a Noul” asks Jev six typed questions. Five Score distributions map via
expected values to act confidence (0.4–0.9), threat evidence (0.4–0.85), cadence
(6–20 ticks), speed and stamina (0.6–1.4×); highest-ranked Choice selects one of
four existing appearances. The player reviews traits before insertion (8 Nouls
maximum). Original description informs behavior questions. Supported physical
abilities are walking speed and endurance; flying/magic/combat are not simulated.
Creation uses the same session cost limit and exposes/downloads complete mapping
evidence. Perception banks the profile, so replay reconstructs the custom gates;
import restores missing custom creatures. Legacy bank rows still replay.

Relay now allows four independent simultaneous requests, one per session.
Per-session locks protect cost accounting; temporary slot contention retries
without pausing normal play. Laptop and phone have independent worlds and each
has the user-approved $0.10 session budget, not shared world state.

Validation: all 13 modules compile; 41 native package tests pass, including six
creation cases; real Go/WASM covers creation, bounds, escaping, perception,
custom replay and restoration; eight relay tests cover concurrency and billing.
Browser creation tests use an explicitly synthetic API response and actual WASM
insertion. No real paid character-mapping call has been performed by the agent.
The existing `_str_len` named-test extraction bug reproduced when invoking
`perceive` through the new test; the named policy case uses a bank-shaped snapshot,
while real WASM tests exercise the full perception path. Native character runtime and the 6/6 main selftest also pass with runtime
contracts enabled. No new static proof is claimed for float/profile mapping. Strict quality remains release-metadata work.

Earlier entries below are historical.

## Latest continuation: survival + pointer popups (2026-09-20)

Preview build `survival-9`. Current `world.ail` adds health/deathCause and derived
tiredness, whole-map perception, finite hesitation and committed need trips.
`souls.ail` uses urgency-dependent gates and survival-relevant behavior options;
`bank.ail` reconstructs gates from banked policyVersion/urgency, preserving old
banks. `host.ail` prioritizes waiting/urgent living creatures. Popups now follow
the desktop cursor; touch opens a persistent popup. See BROWSER_VALIDATION.md
for the 35 native cases, runtime, WASM and real Chrome/touch evidence.

> Update 2026-09-20: the browser host is implemented. See
> [BROWSER_VALIDATION.md](BROWSER_VALIDATION.md) for current files, evidence and
> remaining real-key/browser checks. The original handover below is historical.

# HANDOVER — The Deliberating Nouls, sprint v0 state (2026-09-19)

For the next session. Everything in `decisions/` is green and verified on
ailang v0.40.2-6-ge12e0335d. Quota stopped this session before the browser
host (T8) was built; this doc contains everything needed to build it without
re-deriving the research.

## 1. Verified state (do not re-verify blindly — commands included)

| Evidence | Command (from `decisions/`) | Result |
|---|---|---|
| Package check | `ailang check --package .` | 6/6 modules clean |
| Inline tests | `ailang test world.ail souls.ail render.ail` | 5/5, 3/3, 3/3 |
| Named tests | `ailang test bank_test.ail` | 9/9 |
| Selftest (full pipeline) | `ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail selftest` | 6/6 PASS |
| Determinism | `... main.ail simulate --ticks 200 --seed 7` twice → compare `digest` | identical |
| Bank replay E2E | `... main.ail fixture --out bank/synthetic.jsonl` then `... main.ail replay --bank bank/synthetic.jsonl` | `1 verified, 0 diverged` |
| Render E2E | `... main.ail simulate --ticks 200 --dump /tmp/w.json && ... main.ail render --file /tmp/w.json` | 4 KB SVG |
| Live tier (needs `OPENROUTER_API_KEY`) | `... main.ail record --ticks 24 --out bank/recorded.jsonl` | **operator-pending** (no key in this session) |

Modules: `world.ail` (pure sim, percepts, Json codecs, digest), `souls.ail`
(personalities = data, batched question builder, distribution sampling,
`actOnDecision` policy: threat override → gate → sample), `render.ail`
(std-only SVG/bars/inspector + `selfCheck`), `bank.ail` (row/decision codecs,
JSONL bank, `replayRow`/`replayVerifies`, synthetic fixture via `parseAnswers`),
`oracle.ail` (`planDeliberation` pure, `deliberate ! {Net, Env, Rand}`),
`main.ail` (CLI: selftest | simulate | fixture | record | replay | render).

Design docs: `DESIGN_SPEC.md` (approved), `SPRINT_PLAN.md` (tasks T1–T10).

## 2. Known bug (reported; workaround in place)

**Named-test extraction misbinds `std/list.length` → `_str_len`** when the
test file imports a sibling module whose own imports span BOTH `std/list` and
`std/string` (world/souls/bank all do). `sortBy` chains fail with
`_str_len: expected String, got *eval.ListValue`; direct sibling calls in
test bodies can panic (nil pointer). Minimal standalone repro pair in
`.ailang-scratch/` (`repro2.ail` passes, `repro4.ail` + `repro_sib2.ail` fail;
identical bodies — the sibling import is the trigger). Reported to core from
the canonical store: **message `inbox_1789849816269_681807c4`** (envelope
attached). Workarounds in tree: `bank_test.ail` covers only extraction-safe
paths; full-pipeline assertions live in `selftest` (`ailang run` is
unaffected). `ailang test --package .` will stay red on pipeline tests until
core fixes the extraction — re-test with repro4 after any binary update.
Also observed while here: `discord/renderer.ail` has the same pre-existing
failing test (`escapeHtml_test_3` expects `a&quot;b`, should be
`a&amp;&quot;b` — `&` is escaped first). Not our file; left untouched.

## 3. T8 browser host — the only unfinished code

Goal: `http://localhost:8080/decisions/` — Worker-hosted WASM AILANG runs the
world + tiers; JS only bridges effects and injects SVG. `scripts/serve.sh`
already assembles `_site/decisions/` (modules, bank fixtures, vendored
`decide.ail` from the sibling checkout, warns if `decisions/site/` is absent).

### 3.1 One missing piece first: `host.ail` (thin, pure)

`window.ailangCall(module, fn, ...args)` is string-friendly, but the core
functions take typed values. Write `decisions/host.ail` — a pure string-in/
string-out adapter over existing, round-trip-verified codecs:

```
module host
import world (..., worldOfJson, worldToJson, stepWorld, demoWorld, shouldDeliberate, creatureById, perceive)
import souls (soulOf, answer..., ranked)  -- for bars
import oracle (deliberate, applyToCreature, demoModel)
import bank (replayVerifies, rowToLine, BankRow...)
import render (renderWorld, renderBars, renderInspector, selfCheck)

tick(worldJson, movesJson) -> string                       -- worldOfJson → stepWorld → worldToJson
init() -> string                                            -- worldToJson(demoWorld())
perceptOf(worldJson, creatureId) -> string                  -- planDeliberation state encode
whoDeliberates(worldJson, cadences) -> string               -- creature ids at decision points
barsOf(rowJson) -> string                                   -- ranked(answer)→[{key,p}] encode + row.roll → renderBars
inspect(rowJson) -> string                                  -- state + note → renderInspector
replayRow(line) -> string                                   -- bank.lineToRow → replayRow → action+verify, encode
addEntity(worldJson, desc, kind, x, y) -> string           -- NEW world helper needed (see 3.4)
deliberateLive(worldJson, creatureId, model) -> string     -- see 3.3; ! {Net, Env, Rand}
```

Check with `ailang check host.ail`; add the file to the serve.sh copy list
(one line). Keep signatures returning `Result[..., string]` as JSON with an
`ok` field — no silent failures.

### 3.2 Host contract (verified in source — do not re-derive)

- **Loader**: `discord/site/index.html` is the working precedent:
  `new AilangREPL().init('../wasm/ailang.wasm')` (top-level `../wasm/`
  symlink serves `ailang.wasm` + `ailang-repl.js` + `wasm_exec.js`),
  `window.ailangLoadModule(name, source)` where `name` = the module's
  declaration name for siblings (`world`, `souls`, ...) and the IMPORT path
  for the package (`'pkg/sunholo/decisions/decide'` → fetched from
  `ailang/pkg/sunholo/decisions/decide.ail`) — exactly `docparse-loader.js`'s
  table pattern. Then `window.ailangCall(module, fn, argString)`.
- **Worker**: main thread must stay 60 fps; a ~500 ms decide blocks a wasm
  goroutine. `cmd/wasm/main.go` registers globals via `js.Global()` — in a
  Worker they land on the worker scope (`self.ailangLoadModule`); call them
  directly instead of `window.*`. `importScripts('../wasm/wasm_exec.js')`
  then load `ailang-repl.js`-style init in the worker. **Spike**: confirm
  AilangREPL init works in a Worker before building the full loop (it is
  plain JS + Go wasm; nothing window-dependent was found, but confirm).
- **Capabilities**: `ailangGrantCapability('Net'|'Env'|'Rand')` exists
  (cmd/wasm main.go:665). Grant exactly what a mode needs: simulate → Rand;
  replay → (none); live → Rand, Env, Net.
- **Effect handlers**: `ailangSetEffectHandler(effectName, {op: fn})`;
  callbacks may return Promises (`awaitPromise` blocks only the calling
  goroutine — cmd/wasm/effects.go:41–58). `Env` op is `"getEnv"`
  (internal/effects/env.go:12) — bridge: `OPENROUTER_API_KEY` comes from
  main-thread `localStorage["openrouter-api-key"]` (repo convention),
  posted into the worker (workers cannot read localStorage).
- **Rand**: `std/rand` ops are builtins (`_rand_float`, `_rand_seed`).
  Unknown whether they run natively in the wasm build or need a handler.
  If a call fails in-page: register `ailangSetEffectHandler('Rand', {...})`
  with a seeded JS PRNG (carry the seed for replayability), then note the
  friction to core.
- **Net (T9 finding, decision already made)**: `_net_httpRequest` does a
  DIRECT Go HTTP call (internal/effects/net.go NetHTTPRequest →
  buildSecureRequest) — it does NOT dispatch through the effects registry,
  so a JS `Net` handler override does nothing for it. In GOOS=js builds Go's
  net/http bridges to browser fetch; with 'Net' granted, `decide()` may work
  natively, subject to CORS on `https://openrouter.ai/api/alpha/decisions`.
  **Do not re-implement the HTTP call in JS** (duplicate seam). If CORS
  blocks it: the demo's live tier is the CLI `record` mode + browser replay
  of the banked rows — already functional. Record the spike result either way.
- **WASM freshness**: the installed binary is STALE vs core HEAD
  (e12e033 → e219c262f828). `scripts/check-wasm-freshness.sh` gates serving;
  rebuild (`REBUILD_WASM=true scripts/serve.sh`) before browser debugging —
  a stale `wasm/ailang.wasm` silently hangs `loadModule` on newer syntax.

### 3.3 Page behavior (v0 scope)

- Modes: **simulate** (seeded keyless souls), **replay** (fetch
  `bank/synthetic.jsonl` — shipped — or `bank/recorded.jsonl` if the operator
  recorded one; replay rows, render bars + roll marker + inspector),
  **live** (key-gated; per-creature in-flight flag; one in-flight call per
  creature, sequentialized queue; `retryable`/`retryAfterMs` handled host-side).
- 10 Hz tick: `requestAnimationFrame` on main thread paces interpolation; the
  worker answers `tick` with `renderWorld` SVG (inner.html swap) — 10 Hz SVG
  injection is fine for v0; smooth interpolation is v1.
- Artifact injection: text input + click-to-place → `addEntity` — creatures
  `shouldDeliberate` on the genuinely-new id (world's `seen` list handles it).
- Click a creature → inspector: `perceptOf` state JSON (escaped), last row's
  `barsOf` distribution with the roll marker, note line, cost ticker summed
  from banked `cost_usd`.
- Live banking in-page has no FS: accumulate rows in a JS array, offer
  download of the JSONL (same format `replay --bank` verifies).

### 3.4 Small world.ail additions the host needs

`addEntity(w, e) -> World` and `nextEntityId(w) -> string` (world currently
only builds entities at `demoWorld`). Pure, 5 lines each, plus round-trip
test via `digest`. Keep entities description-only (no behavior tags — that
is the demo's whole point).

## 4. Operator checklist (in order)

1. `cd decisions && ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail selftest` → 6/6.
2. `REBUILD_WASM=true scripts/serve.sh` → `http://localhost:8080/decisions/`
   (site host absent yet: expect the serve.sh warning — expected until T8).
3. With `OPENROUTER_API_KEY`: `... record --ticks 24 --out bank/recorded.jsonl`,
   then `... replay --bank bank/recorded.jsonl` → 0 diverged. This records a
   REAL bank (replaces the synthetic fixture as the replay-tier showcase) and
   measures live `cost_usd`/latency for the README's numbers.
4. Check core's reply on the extraction bug:
   `AILANG_STORAGE_MESSAGING=gcp ailang messages list --unread`.

## 5. Repo notes for the PR

- `decisions/` ships: `DESIGN_SPEC.md`, `SPRINT_PLAN.md`, `HANDOVER.md`,
  `ailang.toml`, `ailang.lock`, 6 `.ail` modules + `bank_test.ail`,
  `bank/synthetic.jsonl` (clearly labeled `[synthetic]`), README (added next).
- `.ailang-scratch/` holds probes + the bug repro files — uncommitted by
  design; the repro content is preserved in the core message envelope and
  `bank_test.ail`'s header comment.
- `scripts/serve.sh` gained the decisions block (bash -n clean); full
  assembly re-run aborted mid-way this session — `_site/` is a rebuild
  artifact, just re-run serve.sh.
- `discord/renderer.ail` failing test: pre-existing, not ours (see §2) —
  worth a separate note to the discord demo owner.