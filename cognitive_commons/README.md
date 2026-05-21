# Cognitive Commons

A live, multi-tab AI debating society built with AILANG WASM.

**[Try it live →](https://www.sunholo.com/ailang-demos/cognitive_commons/)**

Each browser tab is one citizen (Visionary / Skeptic / Synthesizer / Archivist). Citizens debate any topic, competing to drag a shared **sentiment dot** toward their corner of a 2D plane. The persona currently closest to the dot holds an **edit lock** on a rolling 100–200 word working statement — the commons' answer to the topic. Only the leader can replace the draft; non-leaders must out-argue them first.

**This demo is AILANG-driven.** Citizen composition, persuasion scoring, sentiment EWMA, and edit-lock logic are `.ail` modules running as WASM in the browser. JS handles constellation rendering, BroadcastChannel cross-tab relay, and AI provider bridging.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ index.html  — UI shell (JS)                                     │
│  ├─ provider/key picker, model selector, persona switcher       │
│  ├─ constellation SVG render + sentiment dot + trail            │
│  ├─ chronicle feed, scoreboard, topic input, manifesto panel    │
│  └─ BroadcastChannel cross-tab relay (ailang_state in payload)  │
├─────────────────────────────────────────────────────────────────┤
│ commons_browser.ail  — WASM JSON adapter                        │
│  └─ speakJson(state, persona, prompt, topic, dialogue, clock,   │
│                region) → JSON {speaker, utterance, glyph,       │
│                               judge_ok, score, state, ...}      │
│  inlines compose + judgeUtterance + EWMA + edit-lock so JS      │
│  gets utterance text back (needed for chronicle render)         │
│                                                                 │
│ citizen.ail          ! {AI, DOM, Msg}                           │
│  └─ compose() — author LLM call → AuthorReply {text, glyph,    │
│                 manifesto}                                       │
│                                                                 │
│ persuasion.ail       ! {AI}                                     │
│  └─ judgeUtterance() — judge LLM call → JudgeScore {x, y}      │
│                                                                 │
│ consensus.ail        pure                                       │
│  └─ applyUtterance, currentLeader, applyManifestoEdit           │
│     CommonsState: sentiment {x,y}, text, editor, clock, count   │
│                                                                 │
│ types/personas.ail   pure data                                  │
│  └─ Persona ADT (Visionary/Skeptic/Synthesizer/Archivist)       │
│     targets, default_prompt, axis_definitions                   │
└─────────────────────────────────────────────────────────────────┘
```

## File Layout

| File | Purpose |
|---|---|
| `index.html` | UI shell — constellation, chronicle, onboarding, model picker |
| `types/personas.ail` | Persona ADT, sentiment targets, default system prompts |
| `services/consensus.ail` | Pure: EWMA, currentLeader, edit-lock |
| `services/persuasion.ail` | Judge LLM call returning `JudgeScore {x, y}` |
| `services/citizen.ail` | Compose loop with `! {AI}` effect |
| `services/commons_browser.ail` | WASM JSON adapter — `speakJson` entry point |
| `main.ail` | CLI smoke test (4-turn mock debate, no AI) |
| `cog/` | Cognitive OS browser JS (canonical DOM, event log, host, scheduler) |

## Running Locally

```bash
# From the demos/ root
scripts/serve.sh --port 8765
# Open http://localhost:8765/cognitive_commons/
```

## CLI Smoke Test

```bash
ailang run --entry main --caps IO cognitive_commons/main.ail
```

## How Cross-Tab State Sync Works

1. Tab A speaks: `ailangCallAsync('commons_browser/services/commons_browser', 'speakJson', ...)`
2. AILANG returns `{ok, speaker, utterance, glyph, score, state}` JSON
3. JS calls `broadcastStanza(persona, utterance, glyph, ailangState)` — includes `ailang_state` in the BroadcastChannel payload
4. All other tabs receive the event, call `adoptAilangState(payload.ailang_state)` to update sentiment + constellation
5. Next speak in each tab uses the updated `app.ailang.stateJson` as the `state_json` argument to `speakJson`

## Provider Support

Uses the shared `<provider>-api-key` localStorage key convention (no demo-scoped prefixes):

| Provider | localStorage key |
|----------|-----------------|
| Anthropic | `anthropic-api-key` |
| OpenAI | `openai-api-key` |
| OpenRouter | `openrouter-api-key` |
| Google Gemini | `gemini-api-key` |

## AILANG Patterns Applied

- **Pattern 1**: Flatten triple-nested match in `compose()` → sequential `let`s + helper
- **Pattern 2**: Collapse three matches on `Result[JudgeScore, _]` → one `unpack_judge_score` into flat record
- **Pattern 3**: Trim consensus imports to only used symbols
- **callJson returns string**: `callJson(prompt, schema) -> string` — always `let raw = callJson(...); match decode(raw) { ... }`
- **Option constructors**: `getString/getNumber/getObject` return `Option[T]` — use `Some/None`, not `Ok/Err`
