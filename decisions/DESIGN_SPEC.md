# The Deliberating Nouls — an artificial-life showcase for sunholo/decisions

Status: v0 IMPLEMENTED 2026-09-19 (offline core + CLI tiers complete and
verified — see SPRINT_PLAN.md/HANDOVER.md; browser host implemented (2026-09-20); full browser and live-tier runtime
validation pending). Approved with recommended defaults: dir `decisions/`,
OpenRouter transport, artifact injection in v1 scope, Worker-hosted WASM,
narrator deferred to v2, SVG-flat art. Owner: user + coding agent.
Target URL once built: `http://localhost:8080/decisions/`.

## Purpose

An impressive local demo for the new `sunholo/decisions` package (0.4.0, the
use-case map surface — currently a sibling `ailang-packages` checkout, registry
still at 0.3.0). Artificial life is the vehicle because the fit is exact:

- **System One models are intuition.** A "fast, cheap, semantic judgment at a
  choice point" is literally what an animal's reactive brain does. The demo's
  thesis — *creature intuition is a typed decision call* — is a fact about the
  architecture, not a metaphor.
- **Every answer is a distribution**, and the package's own consumer rule #2
  ("bank the distribution, never argmax alone") is precisely how stochastic
  behavior should be driven: sample actions from the answer's probabilities.
- **Every analytics helper becomes a visible creature state** rather than a
  dashboard widget: `gate` is personality, `detect` is threat appraisal,
  `margin`/`entropy` is visible dithering, `compositeScore` is mood,
  `noulSpread`/`choiceVotes` is second thoughts, Degraded mode is doubt.
- **The doctrine is dramatized.** No default thresholds (each creature's cut
  points are its own), bank-every-Decision (the ledger is a UI surface), no
  silent fallbacks (a degraded creature visibly refuses to act).

Repo rules honored: every line of judgment, simulation and rendering logic is
AILANG; the browser UI runs AILANG via WASM (invoice_processor_wasm /
discord/site precedent); JS only hosts effects (fetch bridge, DOM injection).

## What only a model can resolve — the design test

The world contains **no machine-readable behavior tags**. Entities are
open-vocabulary: `"a humming red berry"`, `"a rusted tin can"`,
`"a puddle that smells sweet"`, `"a pile of small bones"`. Edibility, danger and
value are *judged from meaning* by the decision model, or learned in-world
(ate the sweet puddle, felt sick → the memory text is fed back into state for
the model to interpret). The test for every question we add: *if a lookup table
could answer it, cut it.* Open vocabulary plus combinatorial context (needs ×
memories × day-phase × weather) makes the table unbounded.

Judgment moments that genuinely need a model:

1. **Novel-artifact appraisal.** A creature encounters an entity it has never
   seen; only a semantic judgment of the description can rank eat / approach /
   avoid / investigate.
2. **Context-dependent safety.** "Is it safe to eat this now, given I am
   already queasy and it is dusk?" — state is the creature's full percept.
3. **Social semantics.** "Is the stranger approaching aggressively or
   curiously?" — judged from described behavior, not a hostility bit.
4. **Memory-based trust.** "Has anything like this been associated with bad
   outcomes in my memory?" — the model reads the memory ring as text.

**Killer interaction:** the watcher types a new artifact into the world at
runtime ("a shiny black egg that hums quietly") and drops it into the biome;
every creature that perceives it deliberates visibly, each personality
concluding differently. The demo answer to "why does this need a model?" is
performed live.

## The world (pure, deterministic core)

All simulation is pure AILANG, contract-checked, testable offline, no effects:

- `World` = tick counter, creatures, entities, day phase, weather, seed.
- Entities: food-like things, hazard-like things, landmarks, strangers — each
  **description-only** (string + position). No `edible`/`danger` fields anywhere
  in world state.
- Creatures: position, velocity, energy/hunger/fear/curiosity, a bounded memory
  ring (recent events as short text lines), a `Personality`, a current
  `Intent`, an optional in-flight deliberation marker.
- `stepWorld(world, actions)` — deterministic given seed + actions: steering
  toward intent targets, energy drain, day/night advance, entity consumption.
  Pure `requires`/`ensures` contracts where meaningful (bounded world size,
  energy monotonicity), native tests in `*_test.ail`, run in CI with no key.
- `perceive(creature, world) -> Json` — the state sent to the model: own vitals,
  nearest visible entities with descriptions/distances, recent memories, day
  phase, weather. **Token budget target: ≤ ~700 input tokens** (list price is
  $0.042/1M input tokens; the ~$0.00003/call headline assumes a small state).
  Nearest ~6 entities, ~5 memories, descriptions ≤ 12 words. Measured, not
  assumed — the cost ticker displays `cost_usd` truth.
- Randomness: `std/rand` (`rand_float`, `rand_int`, `rand_seed`) under the
  `Rand` effect; every run is seeded, so a run is replayable given its bank.

Movement is **not** model-driven. Between deliberations creatures execute their
current intent with simple steering — pure code. The model is consulted only at
**decision points**: new entity entered perception radius, need crossed a
threshold, blocked, or the personality's deliberation timer elapsed. This is
both the correct use of System One (fast judgment at choice points, not
per-frame control) and the budget/rate-limit discipline.

## Creature policy: personality is data, not code

A `Personality` record carries every cut point — the package ships no default
thresholds, so the demo cannot either:

```
Personality = {
  name: string,                 -- "Wary Noul", "Bold Noul", "Paranoid Noul"
  actThreshold: float,         -- gate() t: bold 0.55, wary 0.80, paranoid 0.90
  presentAt: float, absentAt: float,   -- detect() cut points for threat Nouls
  moodWeights: [{ name, weight }],     -- compositeScore() weights
  flavor: string,               -- question phrasing flavor
  deliberationPeriodTicks: int,
  extraQuestions: [Question]    -- paranoid: Noul("Something is watching me.")
}
```

One **batched** `decide` call per deliberation (batching is ~12× cheaper than
separate calls — the parallel-questions cookbook). Illustrative question set
for one deliberation; `state` is `perceive`'s JSON:

| name | question | reads |
|---|---|---|
| `behavior` | `Choice("What should I do next?", [forage / rest / flee / investigate / socialize])` — option descs phrased in the personality's flavor | sample from `probabilities`, `gate` with `actThreshold` |
| `approach` | `Choice("Which nearby thing is most worth approaching?", options = perceived entity ids, `desc` = the entity's description verbatim)` — the semantic-find pattern over candidate ids | `topK`, `ranked`, sample; `margin` for torn-ness |
| `threat_<eid>` | `Noul("The <description> nearby is a danger to me.")` — one per visible entity, capped | `detect(presentAt, absentAt)` |
| `danger` | `Score("How dangerous is my situation right now?", [4 ordered levels])` | `expectedScore`, feeds mood |
| `mood_<dim>` | one `Score` per mood dimension (fear, comfort, curiosity) | `compositeScore(moodWeights)` |
| personality extras | e.g. paranoid's `Noul("Something is watching me.")` | `probabilityOf` |

Acting on answers (the doctrine as behavior):

- **Sample, don't argmax:** roll `rand_float(0, 1)`, walk the `behavior`
  distribution's cumulative probabilities, land on the action. The roll and the
  bar it landed on are both rendered — rule #2 taught in one glance.
- `gate(behaviorAnswer, actThreshold)`: `Act` → do the sampled behavior;
  `Escalate` → hesitate (pause; v2: second thoughts / pack council);
  `Ungateable` → the Noul path: threshold via `detect`/`probabilityOf`.
- Threats: `Present` → flee now; `Absent` → ignore; `Uncertain` → keep distance,
  visibly wary. **Uncertain is never silently collapsed** — that is the
  package's moderation rule, performed as body language.
- `margin` ≈ 0 or `entropy` high → visible dithering: the creature oscillates
  between two targets, jitters, or wanders while re-deliberating sooner.

Sketch of the oracle bridge (illustrative, exact signatures from
`sunholo/decisions/decide` 0.4.0):

```ailang
import pkg/sunholo/decisions/decide (decide, Question, Choice, Noul, Score,
    Decision, Answer, ChoiceA, NoulA, gate, detect, Act, Escalate, Ungateable,
    Present, Absent, Uncertain, ranked, margin, retryable, DecideError)
import std/rand (rand_float)
import std/json (Json)

-- one deliberation: build batched questions from the personality,
-- call the oracle, sample behavior from the distribution, gate it.
func deliberate(model: string, p: Personality, state: Json,
                qs: [{ name: string, q: Question }]) -> Result[Outcome, DecideError] ! {Net, Env, Rand} =
  match decide(model, state, qs) {
    Err(e)  => Err(e),                                  -- caller handles retryable(e) / retryAfterMs
    Ok(d)   => match answer(d, "behavior") {
      Err(e)  => Err(e),
      Ok(a)   => match gate(a, p.actThreshold) {
        Act(_)        => Ok(Acted(d, sampleFrom(a, rand_float(0.0, 1.0)))),
        Escalate(conf) => Ok(Hesitated(d, conf)),
        Ungateable(w)   => Ok(Ungated(d, w))            -- Noul answers: detect() path
      }
    }
  }
```

(`sampleFrom` walks `ranked`'s probabilities with the roll — pure, lives in
`souls.ail`, unit-tested with fixed rolls. Escalate → the creature visibly
dithers: high-entropy jitter, oscillation between top-2 `approach` targets.)

## Decisions API mapping (what the demo exercises, exactly)

From `sunholo/decisions/decide` 0.4.0 (local checkout, signatures verified
2026-09-19): `decide/decideDirect/decideVia/decideWith` —
`(model, state: Json, questions: [{name, q: Question}]) -> Result[Decision, DecideError] ! {Net, Env}`;
`Question = Noul | Choice | Score | NoulR | ChoiceR | ScoreR` (rich variants carry
`Json` — used for structured percepts in v2); `Answer = NoulA | ChoiceA | ScoreA`;
`Decision = {model, id, answers, input_tokens, output_tokens, cost_usd}`;
pure readers `answer, gate, expectedScore, probabilityOf, best, ranked, topK,
margin, entropy, renormalise, detect, compositeScore, featuresOf, noulSpread,
choiceVotes`; ops `retryable, retryAfterMs, defaultModel, listPriceUsd,
decisionOf, isDegraded`; replay `parseAnswers(body, questions)`;
fallback `decideOrFallback` → `Calibrated | Degraded`.

| 0.4.0 surface | Demo use |
|---|---|
| `Choice` + batching | behavior mode, per-deliberation |
| `Choice` over entity ids (`topK`/`ranked`/`margin`) | semantic artifact ranking — the search/retrieval shape |
| `Noul` + `detect` | threat appraisal — the detection shape |
| `Score` + `expectedScore` + `compositeScore` | situation danger + mood engine — composite judgment |
| `gate` three-way | personality thresholds — routing shape |
| `entropy`/`renormalise` | dithering + filtered re-ranking |
| `noulSpread`/`choiceVotes` (v2) | second thoughts, pack councils — self-consistency |
| `parseAnswers` + banked bodies | recorded-soul replay tier |
| `decideOrFallback` Degraded | visible doubt (below) |
| `retryable`/`retryAfterMs` | 429/529 backoff in the host |
| `featuresOf` (inspector) | the creature's perceptual vector panel |
| `cost_usd`/`listPriceUsd` | the live cost ticker |

**Degradation is a feature of the show.** `decideOrFallback` forces degraded
confidence to 0.0, so `gate` always Escalates: on Jev unavailability, creatures
visibly *doubt* — greyed, hesitant, frozen at choice points — instead of
pretending to act on an uncalibrated chat-LLM answer. Every Degraded row in the
bank is highlighted in the ledger as an availability incident. The package's
safety doctrine rendered as behavior.

## Architecture and data flow

```
decisions/
├── DESIGN_SPEC.md        ← this doc
├── SPRINT_PLAN.md        ← after approval
├── ailang.toml           ← demo package manifest (discord precedent: dedicated
│                            manifest so path deps don't touch other demos)
├── ailang.lock
├── world.ail             ← pure world model, stepWorld, perceive (no effects)
├── souls.ail             ← personalities, question builders, sampleFrom, moods
├── oracle.ail            ← deliberate(): decide + sample + gate → Action ! {Net, Env, Rand}
├── bank.ail              ← JSONL banking + replay via parseAnswers ! {FS, IO}
├── render.ail            ← pure render: world + bubbles → SVG fragments (WASM in-page)
├── narrator.ail          ← v2: std/ai Attenborough captions ! {AI}
├── main.ail              ← CLI: record | replay | step-check modes
├── bank/                 ← committed fixtures: recorded souls (real banked Decisions)
├── tests/                ← native tests + properties for the pure core
└── site/index.html       ← browser host (JS glue only: effects, DOM, rAF)
```

Module naming, `./` sibling imports, `pkg/sunholo/decisions/decide` external
imports, and **transitive-import completeness** (entry modules re-import every
transitive stdlib symbol — known AILANG requirement) per the package skill and
CLAUDE.md. `ailang add --path ../ailang-packages/packages/decisions` + `ailang
lock` (discord precedent; 0.4.0 is local-only until published).

**Banking format (the audit doctrine made into a file):** one JSON row per
deliberation in `bank/<run>.jsonl`:
`{ runId, tick, creatureId, state, questions, body, roll, action }` — the full
`state` sent, the exact `questions` asked, the raw response `body` (what
`parseAnswers(body, questions)` replays), the sampled `roll` (exact behavioral
replay) and the resulting `action`. Replay is deterministic: same bank + same
seed → same animation, no key, no network. Banking is not optional in live
mode; the ledger panel renders from it (cost from `cost_usd`, fallback to
`listPriceUsd` when the wire carries none).

**Tick loop:** AILANG steps the world at a fixed 10 Hz (`stepWorld` per tick);
the browser interpolates positions at 60 fps between ticks (JS-side, cosmetic
only). Deliberations are **asynchronous**: a creature at a decision point sets
its in-flight flag, keeps executing its current intent, and the answer
(~400–600 ms later) redirects it. One in-flight call per creature, a global
serialized queue for rate limits, `retryable`/`retryAfterMs` backoff with the
sleep in the host (the package deliberately ships no `Clock`).

**Rendering:** pure `render.ail` produces SVG fragments per tick — the discord
`renderer.ail` pattern scaled from event boxes to a world: canvas-layer world,
SVG thought bubbles with live distribution bars, a roll marker showing where on
the bar the sampled action landed, confidence halos, entropy fuzz, margin
oscillation, `detect` traffic lights, mood rings, trails. Untrusted content
(user-typed artifacts) is HTML-escaped exactly as `renderer.ail` does; a
self-check probe (known input → known fragment) gates trusting the renderer
(discord precedent).

## Tiered runtime (docparse pattern)

| Tier | Requires | Behavior |
|---|---|---|
| ① live | WASM + `openrouter-api-key` in localStorage | real `decide()` calls in-browser; full show |
| ② recorded souls | nothing (committed bank fixtures) | `parseAnswers` replays real recorded deliberations; distributions, dithering, doubt — all real data, offline |
| ③ keyless sim | nothing | pure world + random sampling; CI baseline |

CI runs tiers ②/③ offline (`ailang test`, replay determinism property, render
self-check, `scripts/check_demos.sh --only decisions`). Tier ② fixtures are
recorded once by the developer via the CLI `record` mode with a real key and
committed as small JSONL banks.

## Host contract (browser)

- WASM runtime from the shared top-level `../wasm/` symlink (`ailang-repl.js` +
  `ailang.wasm`), `AilangREPL().init(...)` + `ailangLoadModule` + `ailangCall`
  (discord/site precedent). **Runs in a Web Worker** so a ~500 ms deliberation
  blocks the worker, not the 60 fps page; main thread receives SVG fragments
  via postMessage.
- Effect bridges (deny-by-default; the generic
  `ailangSetEffectHandler(effectName, {op: fn})` in `cmd/wasm/effects.go` is
  effect-agnostic):
  - `Net`: `httpRequest` op → browser `fetch` to OpenRouter
    (`https://openrouter.ai/api/alpha/decisions`).
  - `Env`: `getEnv` op → `OPENROUTER_API_KEY` reads
    `localStorage["openrouter-api-key"]` (repo-wide localStorage convention).
  - `Rand`: native seeded if the wasm build supports it, else a handler — spike.
- `serve.sh`: new `decisions` block (symlink `site/`, copy `render.ail`,
  vendor the decisions package for `pkg/` imports via
  `scripts/vendor-wasm-packages.sh` — extend it to copy from the local
  path-dep checkout when the registry cache misses, since 0.4.0 is unpublished).
- CLI parity modes in `main.ail`: `record` (headless live run → bank JSONL),
  `replay <bank>` (bank → rendered HTML/JSONL trace), `step-check` (pure sim +
  contracts). The CLI is the canonical integration test (repo rule: CLI module
  first, browser second).

## Effects and capabilities

- Pure: `world.ail`, `souls.ail` (all of it), `render.ail`.
- `oracle.ail`: `! {Net, Env, Rand}`; `bank.ail`: `! {FS, IO}`; `main.ail`
  entry rows per mode; `narrator.ail` (v2): `! {AI}` — the fast/slow doctrine
  in one demo: *decisions for judgment, generation stays on `std/ai`*, one slow
  caption call contrasting with fast intuition.
- Proposed package `[effects] max = ["IO", "FS", "Net", "Env", "Rand", "AI", "Clock"]`
  (Clock for CLI retry sleeps). CLI: `ailang run --caps IO,FS,Net,Env,Rand
  --entry main decisions/main.ail` (record mode adds nothing; narrator adds AI).
- **Data boundary (must be approved):** `state` — including user-typed artifact
  text — leaves the machine to TypeSafe via OpenRouter, visible in OpenRouter
  Broadcast only (no `ailang trace` cost accounting for decisions calls in this
  package version). The demo states this on the page.

## Budget, latency, rate limits (measured numbers, not hopes)

- Latency 565 ms (OpenRouter) / 621 ms (TypeSafe direct), 2026-09-19
  measurements from the package AGENT.md — hence async deliberation as a
  designed-in visual beat (a creature visibly thinking ~½ s is a feature).
- Cost: list $0.042/1M input tokens, output free; headline ~$0.00003/call at
  small state. Target state ≤ ~700 tokens; 8 creatures × one deliberation per
  ~4 s ≈ 120 calls/min ≈ **$0.004–0.01/min live** (displayed live from
  `cost_usd`). Recorded-soul replay costs nothing.
- Non-determinism: identical calls move distributions by ±0.04 (argmax usually
  stable) — that IS behavioral noise for alife, and banking makes every wobble
  auditable and replayable.
- Rate limits: endpoint is alpha; `retryable` covers `Http(429|529)` only;
  exponential backoff 1s→2s→4s… capped 30s, serialized per-creature queue.

## Graphics beats (the "fast impressive" list)

1. Thought bubbles: deliberation spinner → distribution bars materialize → a
   dice-roll marker lands on the bar → the creature moves. The whole
   ask→answer→act loop visible in ~600 ms.
2. Confidence halos (green→red), entropy fuzz (high-entropy creatures jitter),
   margin oscillation (visibly torn between two targets).
3. `detect` traffic lights on hazards; mood rings from `compositeScore`.
4. Selected-creature inspector: the exact `state` JSON sent, the questions,
   the full distribution, `featuresOf` vector, banked ledger with cost ticker.
5. User artifact injection: type a description, drop it in the world, watch
   every nearby creature deliberate about the novel thing.
6. Degraded creatures: greyed, frozen, visibly doubting (fallback doctrine).
7. v2: narrator captions (`std/ai`) and pack councils (`choiceVotes` donuts).

## Sprint slicing

- **v0 — offline world (CI-green, already demoable):** `world.ail` + `souls.ail`
  pure core with contracts/tests, keyless random tier ③, `render.ail` + site
  page, `record`/`replay`/`step-check` CLI modes, one committed bank fixture
  recorded from a real run (tier ② replay). No key needed to demo.
- **v1 — live intuition:** WASM Worker host, `Net`/`Env` bridges, live
  deliberations with bubbles, inspector + cost ticker + ledger, artifact
  injection, Degraded-mode show, serve.sh integration.
- **v2 — society:** pack councils (`noulSpread`/`choiceVotes`), second-thoughts
  (Escalate → re-ask), rich percepts (`NoulR`/`ChoiceR` structured state),
  narrator (slow AI contrast), optional A2UI 0.9.1 envelope dogfood for the
  inspector (`createSurface`/`updateDataModel`).

## Sprint-0 spikes (verify before v1 details are fixed)

1. **WASM `Net` dispatch:** confirm `_net_httpRequest` in the wasm build routes
   through `effects.RegisterOp` (handler-bridgeable) rather than direct Go
   sockets; learn the op name/arg shape. Rebuild `wasm/ailang.wasm` from core
   HEAD first (binary currently STALE: built e12e033, HEAD e219c262f828; the
   repo's `check-wasm-freshness.sh` gate exists for exactly this).
2. **Worker hosting:** `AilangREPL` + `wasm_exec.js` inside a Web Worker;
   postMessage JSON in/out. Fallback if it fights us: main-thread with a
   visible ~500 ms deliberation pause (acceptable), or CLI-server + SSE
   (discord `ailang-discord-server` pattern) — heavier, decide by spike.
3. **`std/rand` in wasm:** native seeded vs handler-bridged.
4. **`Env` op shape** for the localStorage bridge.
5. **Token/cost measurement:** a real rich percept's `input_tokens` and
   `cost_usd` (keep ≤ ~700 tokens; adjust percept cap if not).

## Acceptance criteria

- Offline (CI, no key): `ailang test` green for pure core; 1000-tick seeded run
  byte-identical across two executions; replay of a committed bank reproduces
  the recorded actions exactly (state+roll determinism); `render.ail`
  self-check probe passes; escaped-artifact fuzz cases pass;
  `scripts/check_demos.sh --only decisions` passes; `ailang pkg quality
  --strict .` run with compile/tests/contracts gates green (release-metadata
  gates advisory for a demo app — reported, not silently skipped).
- Live tier: a creature visibly deliberates (~500 ms) then acts; rendered bars
  match the banked body; cost ticker equals the ledger's `cost_usd` sum;
  killing the key mid-run degrades creatures visibly with Degraded rows in the
  ledger; no threshold exists anywhere outside a `Personality` value.
- Doctrine: every deliberation banked whole (`state`, `questions`, `body`,
  `roll`, `action`); no silent fallbacks; no default thresholds; every
  `Escalate`/`Uncertain` is visible in world behavior.

## Evidence pins

- `sunholo/decisions` 0.4.0 local checkout at
  `ailang-packages/packages/decisions` (registry latest 0.3.0); all signatures
  quoted from `decide.ail` and `AGENT.md`, verified 2026-09-19.
- Use-case map: docs.typesafe.ai/concepts/use-case-map (ten shapes); rich
  primitives: docs.typesafe.ai/primitives/advanced.md.
- Cost/latency: openrouter.ai/typesafe/jev-1.13 pricing, measured latencies
  2026-09-19 (package AGENT.md). OpenRouter Decisions endpoint is alpha.
- Precedents in this repo: `discord/site/index.html` (WASM renderer + effect
  bridging), `invoice_processor_wasm` (tiered degradation), `renderer.ail`
  (escaping + self-check), `scripts/serve.sh` + `vendor-wasm-packages.sh`,
  localStorage key convention `<provider>-api-key` → `openrouter-api-key`.
- A2UI 0.9.1 (https://a2ui.org/specification/v0.9.1-a2ui/) and AG-UI
  (https://docs.ag-ui.com/concepts/events) — v2 optional dogfood only.

## Decision points for the user (approve/adjust before sprint planning)

1. **Directory name:** `decisions/` (recommended — package-aligned, room for
   later decisions demos inside) vs `alife/` or `nouls/`.
2. **Live transport:** OpenRouter `decide` default with
   `openrouter-api-key` (recommended) vs TypeSafe direct `decideDirect`
   (`TYPESAFE_API_KEY`) — or both behind `decideVia`?
3. **Artifact text injection in v1** — user text leaves the machine in
   `state` (data boundary above). OK for v1, or defer to v2?
4. **Worker-based WASM** (recommended, keeps 60 fps) vs main-thread with a
   visible deliberation pause vs CLI-server + SSE fallback.
5. **Narrator in v2:** adds `! {AI}` calls and keys — in scope, or cut?
6. **Art direction:** SVG-flat (recommended: pure `render.ail`, every pixel
   AILANG-computed) vs canvas painterly (JS draws; AILANG still computes all
   numbers). Affects `render.ail` design only.

Once approved, the next step per the routing gate is `SPRINT_PLAN.md`
(sprint-planner), then implementation on your explicit "execute sprint".