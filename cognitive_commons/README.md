# Cognitive Commons

A live, multi-tab AI debating society built on AILANG's Cognitive OS substrate (`!: {DOM, Msg, Cog, AI}`).

Each browser tab is a citizen with a persona (Visionary / Skeptic / Synthesizer / Archivist). They debate any topic, competing to drag a shared "sentiment dot" toward their corner of a 2D plane. The persona currently closest to the dot holds an **edit lock** on a rolling 100–200 word working statement — the commons' answer to the topic. Only the leader can replace the draft; non-leaders must first earn the lead by speaking persuasively.

**This demo is AILANG-driven.** The citizen behaviour, persuasion judging, and consensus edit-lock are `.ail` modules running as WASM in the browser. JS handles UI affordances (constellation rendering, pan/zoom, tooltips, BYO-key UX) and bridges `std/ai` calls to the user's chosen provider via the existing BYO-key pattern from `wasm-step-byo-key`.

## Status

**Draft, not yet deployed.** Being ported from the JavaScript-heavy prototype at [`ailang/docs/static/demos/cognitive-os-runtime/`](https://github.com/sunholo-data/ailang/tree/dev/docs/static/demos/cognitive-os-runtime) (which lives in the main AILANG repo as a substrate smoke test).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ index.html  — UI shell (JS)                                     │
│  ├─ provider/key picker, model selector, persona switcher       │
│  ├─ constellation SVG render + pan/zoom + tooltip                │
│  ├─ chronicle feed, scoreboard, topic input                      │
│  └─ loads ailang.wasm and calls into citizen.ail                 │
├─────────────────────────────────────────────────────────────────┤
│ citizen.ail        ! {AI, DOM, Msg, Cog}                        │
│  └─ compose loop: read topic + history → draft stanza + edit    │
│                   to working statement → judge own utterance →   │
│                   broadcast via std/cognition                    │
│                                                                  │
│ consensus.ail      pure                                          │
│  └─ sentiment EWMA, currentLeader, applyConsensusEdit (lock)    │
│                                                                  │
│ personas.ail       pure data                                     │
│  └─ PERSONA_TARGETS, DEFAULT_PROMPTS, AXIS_DEFINITIONS          │
│                                                                  │
│ persuasion.ail     ! {AI}                                       │
│  └─ judgeUtterance — separate small LLM call for scoring        │
├─────────────────────────────────────────────────────────────────┤
│ AILANG substrate (shipped in the ailang binary; loaded as WASM) │
│  ├─ std/dom        — scoped DOM patches with canonical hashing  │
│  ├─ std/cognition  — cross-tab Msg fabric over BroadcastChannel │
│  ├─ std/ai         — AI calls; provider routed by JS host shim  │
│  └─ event log      — IndexedDB-persisted; replayable            │
└─────────────────────────────────────────────────────────────────┘
```

## File layout (in progress)

| File | Status | Purpose |
|---|---|---|
| `personas.ail` | sketch | Persona definitions + default system prompts |
| `consensus.ail` | sketch | Pure logic: sentiment EWMA, currentLeader, edit-lock |
| `citizen.ail` | sketch | Compose loop with `!: {AI, DOM, Msg, Cog}` |
| `persuasion.ail` | sketch | `judgeUtterance` — small AI call returning `{x, y}` |
| `index.html` | TBD | Slim UI shell that loads the WASM REPL |
| `shell.js` | TBD | UI wiring + AI-step JS bridges |
| `wasm/` | TBD | Vendored `ailang.wasm` + `wasm_exec.js` + `ailang-repl.js` |
| `cog/` | TBD | Vendored Cognitive OS browser-host JS (`host.js` etc.) |
| `ailang.toml` | TBD | Per-demo manifest |

## What stays JS, and why

- **UI rendering** — constellation SVG, pan/zoom, tooltips, chronicle panels. Browser DOM ergonomics; the canonical-DOM substrate is great for replayable mutations but not the place to express interaction states.
- **BYO-key provider routing** — keys live in `localStorage` (shared with the `wasm-step-byo-key` demo). The JS host receives `std/ai` calls from AILANG and routes them to Anthropic / OpenAI / OpenRouter / Gemini via direct `fetch`. This mirrors the existing AI-step bridge pattern.
- **Cross-tab BroadcastChannel** — the JS layer of the Cognitive OS substrate already exposes `_sendDirect`/`_recvDirect`. AILANG's `std/cognition.sendMsg`/`recvMsg` route through these via the WASM bridge.

## What's AILANG, and why

- **Citizen behaviour** — the compose / judge / edit cycle is multi-effect (`!: {AI, DOM, Msg, Cog}`) and benefits from contracts on inputs (persona ∈ {V, S, Y, A}, gap ∈ [0, √2], etc.).
- **Pure consensus logic** — sentiment EWMA, leader determination, and edit-lock are purely functional and ideally tested via AILANG's contract verifier.
- **Replayability** — the event log captures every `applyPatch` call. Replaying the log byte-for-byte across machines is the whole point of the Cognitive OS substrate and lives in AILANG's `internal/cognition/` package.

## Shared assets to reuse from the demos/ repo

- `wasm/ailang-repl.js`, `wasm/wasm_exec.js`, `wasm/ailang.wasm` — vendored from `sunholo/ailang` main repo build output
- Brand styles + fonts from sibling demos (Fraunces, Inter, JetBrains Mono)
- Eventually: shared layout chrome (header, footer) once the demo hub at `www.sunholo.com/ailang-demos/` standardises one

## Future extractions

- `std/cognitive_commons` — if the consensus + leader-lock logic stabilises, lift into a reusable AILANG package
- `std/ai/byo_key_bridge` — the JS-side BYO-key fetch router is already shared with `wasm-step-byo-key`; ripe for a dedicated module
- Persona/system-prompt builders — if other "society of N agents" demos appear, the prompt-composition helpers could become a shared lib

## Roadmap (rough)

1. **Skeleton** ← we are here
2. Port `consensus.ail` (pure, easiest to verify)
3. Port `persuasion.ail` (single AI call, returns `{x, y}` via JSON schema)
4. Port `citizen.ail` (the compose loop with all four effects)
5. Slim down `index.html` to a UI shell + JS bridges
6. Vendor `wasm/` + `cog/`
7. Wire a build that ships to `www.sunholo.com/ailang-demos/cognitive-commons/`
