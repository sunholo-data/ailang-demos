# Handover — Cognitive Commons (AILANG port)

**Original author:** Claude Opus 4.7 session running in `sunholo/ailang` repo on 2026-05-20.
**Step 1 restructure (2026-05-20, this repo):** Claude Opus 4.7 in `sunholo/demos`.
**Step 2 browser bridge rewrite (2026-05-20):** Same session — wired the real `AilangEngine` + `CognitiveOS.attach()` API instead of the speculative function names.
**Source prototype:** `sunholo/ailang/docs/static/demos/cognitive-os-runtime/index.html` (~4900 lines, JS-only). The full feature set is in production at `https://ailang.sunholo.com/demos/cognitive-os-runtime/` — use it as the visual + behavioural reference while porting.

## TL;DR

The pure logic and the AI-using modules type-check and now follow the `demos/` repo conventions (`types/`, `services/`, module paths matching file paths). A CLI smoke test runs the consensus + edit-lock end-to-end with mocked judge scores — this is the canonical integration test per the repo ethos. The browser shell still has speculative bridge wiring that needs to be replaced with the known-working `AilangEngine` pattern from `invoice_processor_wasm/js/ailang-wrapper.js`; see "Open items" below.

## What's in place

```
cognitive_commons/
├── README.md            architecture map + port roadmap
├── HANDOVER.md          ← this file
├── main.ail        ✓    CLI smoke test: 4-turn mock debate, prints state evolution
├── types/
│   └── personas.ail   ✓    Persona ADT, targets, labels, axis defs, default prompts
├── services/
│   ├── consensus.ail  ✓    Sentiment EWMA, currentLeader, applyManifestoEdit (edit-lock)
│   ├── persuasion.ail ✓    JudgeScore + judgeUtterance !: AI
│   └── citizen.ail    ✓    compose / speak !: {AI, DOM, Msg}
├── index.html      ✓    Slim ES-module shell — uses AilangEngine + CognitiveOS.attach
├── cog/                 Vendored Cognitive OS browser-host JS (host.js + 4 siblings)
└── .ailang/             AILANG state cache (auto-generated)
```

WASM runtime + `ailang-wrapper.js` are loaded from the canonical sources at the repo's top-level `wasm/` and `invoice_processor_wasm/js/` (symlinked into `_site/` by `scripts/serve.sh`). No more vendored duplicates.

All five `.ail` entries pass `ailang check` cleanly and are wired into `scripts/check_demos.sh` (4 of them — `types/personas.ail` is reached transitively via the others). Effect ceiling in `demos/ailang.toml` already allows `DOM`, `Msg`, `Cog`.

## CLI smoke test

```bash
ailang run --entry main --caps IO cognitive_commons/main.ail
```

Expected output:

```
turn=0 (initial) sentiment=(0.0, 0.0) leader=Visionary editor=<none>
turn=1 speaker=Visionary  sentiment=(0.2125, 0.1)        leader=Visionary    editor=Visionary
turn=2 speaker=Skeptic    sentiment=(-0.053, 0.025)      leader=Skeptic      editor=Skeptic
turn=3 speaker=Synthesizer sentiment=(-0.040, 0.244)     leader=Synthesizer  editor=Synthesizer
turn=4 speaker=Archivist  sentiment=(-0.130, -0.030)     leader=Skeptic      editor=Synthesizer  ← edit rejected (not leader)
Smoke test PASS
```

Turn 4 shows the edit-lock semantics: the Archivist spoke and got an EWMA pull, but the dot is still closer to Skeptic's corner — so the Archivist's manifesto edit is rejected and Synthesizer remains the last accepted editor. This is the headline design rule.

## Game design (carried over from the JS prototype)

The mechanic + UX has been iterated on heavily. Don't redesign without reading the original prototype first.

1. **Four personas** with fixed sentiment targets:
   - Visionary `(+0.85, +0.4)` — forward + a little synthesizing
   - Skeptic `(-0.85, -0.2)` — critical + a little archival
   - Synthesizer `(0, +0.9)` — neutral horizontal + strongly synthesizing
   - Archivist `(-0.4, -0.85)` — a little critical + strongly archival
2. **Each tab is one citizen** (one persona). User can override the auto-assigned persona; persistence in `sessionStorage`.
3. **Topic of debate** — shared per origin via `localStorage`. Cross-tab broadcasts via the roster channel.
4. **Each utterance**: AI authors `{text, glyph, manifesto}` in a single JSON reply. A second small LLM call judges the text on the (x, y) sentiment plane.
5. **Sentiment dot** is an EWMA (alpha=0.25) of judge scores (or persona targets when judge fails).
6. **Edit-lock**: only the persona currently closest to the sentiment dot may replace the rolling manifesto. Non-leaders' edits are silently discarded. This is the headline rule — emphasises "earn the pen by speaking persuasively."
7. **Constellation**: each glyph lands at the (x, y) the sentiment dot reached after that utterance. Phyllotaxis was tried first; sentiment-space placement was the design improvement that stuck.
8. **Judge model**: free OpenRouter `deepseek/deepseek-v4-flash:free` whenever an OpenRouter key is saved, regardless of author provider. This decouples judge cost from author cost.

## Browser bridge — how it's now wired

After step 2 the WASM/JS bridge is no longer speculative. Concretely:

```
index.html
  ├─ <script src="../wasm/wasm_exec.js"></script>         // Go runtime
  ├─ <script src="../wasm/ailang-repl.js"></script>       // AilangREPL global
  ├─ <script src="cog/canonical_dom.js"></script>         // CanonicalDOM class
  ├─ <script src="cog/host.js"></script>                  // CognitiveOS singleton
  └─ <script type="module">
       import AilangEngine from '../invoice_processor_wasm/js/ailang-wrapper.js';
       const engine = new AilangEngine();
       await engine.init();                               // boots WASM + imports core stdlib
       for (lib of ['std/dom','std/cognition','std/io']) engine.repl.importModule(lib);
       CognitiveOS.attach({ rootSelector: '[data-cog-runtime-root]' });
         //   ↑ auto-registers ailangSetDOMApplyPatchHandler / SetDOMApplyBatchHandler /
         //     SetMsgSendHandler / SetMsgRecvHandler / SetDOMSubscribeHandler /
         //     SetMsgSubscribeHandler on window. We do NOT call ailangSetEffectHandler
         //     ourselves — host.js owns those bridges.
       for (m of MODULES) engine.loadDynamicModule(m.name, await fetchSrc(m.path));
       engine.setAIHandler(callJsonRoute);                // also grants 'AI' capability
       for (cap of ['DOM','Msg','Cog']) engine.repl.grantCapability(cap);
       // user clicks Speak:
       const result = await engine.callFunctionAsync(
         'cognitive_commons/services/citizen', 'speak',
         state0, persona, personaPrompt, topic, recentDialogue, clock, region);
       // result.success / result.result / result.error
     </script>
```

Key correction vs. the original handover: the WASM runtime exposes **one global per DOM/Msg operation** (`ailangSetDOMApplyPatchHandler`, `ailangSetMsgSendHandler`, etc.) — *not* a single `ailangSetEffectHandler('DOM', {...})`. The `cog/host.js` shim already knows about all six handler globals and registers itself when `CognitiveOS.attach()` is called. The page just provides the DOM root element.

For local dev / serve.sh: `scripts/serve.sh` now symlinks `_site/cognitive_commons/` → repo source and `_site/invoice_processor_wasm/js/` → the shared wrapper, so the index.html's relative paths resolve in both `file://` and served contexts.

## Open items (priority order)

### P0 — needs validation in a real browser

1. **One successful round-trip.** Open `http://localhost:8765/cognitive_commons/index.html` (after `scripts/serve.sh --port 8765`), paste an API key, click **Speak now**. Confirm:
   - Status reaches `✓ AILANG runtime ready · 4 modules loaded` after boot.
   - `console.log` shows `[commons] CognitiveOS attached: <senderId>` and `[commons] speak result: { success: true, result: ... }`.
   - The `result.result` should be the AILANG-side `Ok(CommonsState)` — confirm exact shape and update the rendering code accordingly.
2. **Result-unwrap.** `citizen.speak` returns `Result[CommonsState, string]`. `engine.callFunctionAsync` parses results with `_parseResult` which strips `:: Type` annotations but does **not** unwrap tagged unions. Check whether `result.result` arrives as `Ok({...})` string, a JS object with a `tag`, or already-unwrapped record fields. Update [index.html](index.html) speak handler accordingly when you render the chronicle/consensus.
3. **`callJson` schema arg.** AILANG's `callJson(prompt, schema)` may pass both args to the JS handler. Our `setAIHandler` accepts `(prompt) =>` — confirm the schema isn't lost. If it is, the provider's response_format already enforces JSON shape, so it's a soft-fail.
4. **Closure caveat (AILANG GitHub #137).** JS cannot invoke AILANG closures received as effect-handler arguments. Our `Msg`/`Cog` ops (`sendMsgResult`, event-log writes) are data-only Result-returning calls, so should be fine — but if you add `recvMsg` or `Msg.subscribe`, verify those go through the M4 dual-signature bridge in [cog/host.js:485-490](cog/host.js#L485-L490) rather than expecting JS to call back into AILANG.

### P1 — minimal viable demo

4. **Render `speak()` result in the chronicle.** The result is a `CommonsState` — extract `consensus_text` → update the consensus box, plus the speaker's text → prepend a `.stanza` div in `#chronicle`.
5. **Maintain a `recent_dialogue` buffer in JS.** The AILANG side takes this as a parameter (formatted transcript string). Last 8 utterances, formatted as `1. Persona said: "..."` per line.
6. **Persona auto-assignment.** Hash the tab's sender ID into one of the four personas at boot. Today the shell defaults to whatever's in the dropdown.
7. **Cadence timer.** Re-fire `speak()` every ~75s while activated.

### P2 — UI parity with the JS prototype

8. **Constellation SVG** — read `state.sentiment` after each `speak()`, draw glyphs at `sentToCx/Cy(sentiment)`, persona-coloured edges, fading trail, persona anchors, pan/zoom. Most of the rendering code can be copy-pasted from the JS prototype's `renderGlyph` / `renderSentiment` functions — only the trigger point changes (now AILANG-driven).
9. **Scoreboard** — show `state.sentiment`, drift, leading persona + gap (these are all in the returned `CommonsState`).
10. **Leading-persona pullquote** — read from `recent_dialogue` for the most recent line by the leader.
11. **Cross-tab BroadcastChannel sync.** The JS prototype uses BroadcastChannel for stanza relay + Reset/Replay control messages. In the AILANG version, `sendMsgResult("commons", payload)` from `citizen.speak` is supposed to route through `std/cognition` → JS host's `_sendDirect` → BroadcastChannel. Verify this end-to-end.
12. **IndexedDB event log + Replay button.** Vendored in `cog/event_log_indexeddb.js` and `cog/replay.js`. Plumb the AILANG `Cog` effect to write each `speak()` call into the log.
13. **Onboarding panel, persona prompt editor, Test & Activate gate.** Port from the JS prototype.

### P3 — polish

14. **Tooltip on glyphs, pan/zoom, fading trail, model badges in chronicle.** All exist in the JS prototype; mechanical port.
15. **Cost tracking + display** (per-tab + commons aggregate via BroadcastChannel).
16. **Free-OpenRouter judge auto-routing.** JS shell helper that picks the free model for `judgeUtterance` regardless of author provider — same logic as the JS prototype's `getJudgeConfig`.

## Design decisions baked in (don't relitigate without cause)

- **Manifesto edit-lock to the leading persona.** Prevents the doc being clobbered every turn. Edit `consensus.ail::applyManifestoEdit` if you want a different policy (e.g. weighted partial accepts).
- **EWMA alpha = 0.25.** Tuned so 10 turns by one persona pushes the dot ~94% of the way to their corner — fast enough to feel responsive, slow enough that one utterance doesn't slam the lock to a new leader.
- **Glyph position = post-utterance sentiment, not phyllotaxis.** Earlier tried-and-rejected: phyllotaxis spiral indexed by utterance count. The current rule makes the constellation a *map of impact*, not a *timeline of utterances*. Edges connect consecutive glyphs (colour-coded by speaker) and trace the conversation's path through sentiment space.
- **Free OpenRouter for judge.** When an OpenRouter key is saved on the origin, judge calls use `deepseek/deepseek-v4-flash:free`. Author keeps its own provider/model. Decouples cost ceiling from author quality.
- **Topic change resets consensus, NOT sentiment.** Sentiment carries across topics (it's a property of the recent rhetorical lean of the room). The manifesto resets because it was about a specific question.
- **JSON-in-JSON for the AI reply.** `callJson(prompt, schema)` returns a JSON string which is then `decode`d on the AILANG side. The schema is enforced server-side where supported (OpenAI/OpenRouter `response_format`, Gemini `responseSchema`); Anthropic falls back to prompt-only instructions.

## What stays JS, and why

- **UI rendering** — SVG constellation, pan/zoom, tooltips, chronicle panels. Browser DOM ergonomics; AILANG's canonical-DOM substrate is great for replayable mutations, less so for interaction state.
- **BYO-key provider routing** — keys in `localStorage` under `ailang-step-byo-key-<provider>` (shared with the BYO-key demo). The JS host receives `callJson` from AILANG and routes to Anthropic/OpenAI/OpenRouter/Gemini via direct `fetch`.
- **The 6-second roster heartbeat + cross-tab control messages** (Reset, Replay-trigger, Topic change). The original prototype uses a side BroadcastChannel for ephemeral status; not worth marshalling through `std/cognition` for that.

## Future extractions (talked about, not done)

- `std/cognitive_commons` AILANG package — if the consensus + leader-lock + sentiment EWMA logic stabilises, lift it into a reusable package. The four `.ail` files here are arguably the seed of that package.
- Shared layout chrome at `www.sunholo.com/ailang-demos/` — once the demo hub standardises a header/footer, this demo should use it.
- BYO-key bridge as a shared JS lib — both this demo and `wasm-step-byo-key` reimplement the same `callJsonRoute` fetch router.

## Reference checkpoints

- The full JS prototype: `ailang/docs/static/demos/cognitive-os-runtime/index.html` — every feature listed above already exists there. Open it in a browser and copy the visual + interaction patterns over as you port.
- The `wasm-step-byo-key` demo: `ailang/docs/static/demos/wasm-step-byo-key/index.html` + `chat.ail` — the canonical pattern for "AILANG-in-WASM + JS shell + BYO key + AI calls direct from browser." This is the architectural sibling to copy from.
- `cmd/ailang/prompts/v0.16.0.md` in the ailang repo — canonical AILANG syntax reference. `ailang prompt` outputs this. Use it as the source of truth for syntax, not training data.

## What I'd test first

1. **CLI smoke** (already passes): `ailang run --entry main --caps IO cognitive_commons/main.ail`. Validates `consensus.ail` + `personas.ail` end-to-end without any AI calls. Use it as the regression gate before any change.
2. **CI**: `scripts/check_demos.sh --only cognitive_commons` — confirms all four modules type-check (passes today).
3. **Browser boot smoke**:
   ```bash
   scripts/serve.sh --port 8765 &
   curl -sI http://localhost:8765/cognitive_commons/index.html  # 200
   curl -sI http://localhost:8765/wasm/ailang.wasm              # 200
   curl -sI http://localhost:8765/invoice_processor_wasm/js/ailang-wrapper.js  # 200
   ```
   All asset URLs already verified as 200 in step 2.
4. **One AI round-trip in the browser** (P0 #1 above) — paste a key, click Speak, watch the console.

After that: port the constellation SVG, scoreboard, BroadcastChannel cross-tab from the JS prototype (P1–P3 above, in order).

The hard architecture decisions are made, the pure logic is in AILANG and CI-verified, and the canonical CLI test + the bridge wiring are both in place. What's left is the rendering port from the JS prototype.
