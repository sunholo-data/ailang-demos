# Audio Tools sprint validation

Measured 2026-10-26 with AILANG v0.54.18 (`cd33d050b2276633c82624453309ebf7fcea9e2f`),
registry audio 0.4.0 and the checksum-pinned released WASM archive. Node v26.12.1;
Playwright's locked Chromium 148.0.7778.96 on Darwin arm64.

## Overall acceptance: blocked on released WASM loader

The native pipeline, frontend, build and integration are implemented. **The actual
released WASM and actual-browser acceptance fail.** This sprint is not complete,
the PR is not ready to merge, and the public page has not been deployed.

Two independent minimal cases reproduce in the actual released runtime:

1. Module `demo/bar` imports `./foo (f)` after `demo/foo` is loaded. The loader
   reports `undefined global variable: f from ./foo`.
2. Module `demo/model` exports `Layout = MyMono | MyStereo deriving (Eq)`.
   A consumer's comparison of two imported Layout values fails with
   `No instance for Eq[Layout] in scope`, even using an explicit import path.

[evidence/runtime-repro.json](evidence/runtime-repro.json) contains actual module
sources and observed failures. Run `test/runtime-repro.cjs` against the artifact;
it exits nonzero while the defects remain. These are not hypothetical old notes.
The complete package test fails while loading clip on `fitsWork from ./safety`;
a diagnostic import-path normalization gets further but fails on ChannelLayout Eq.
No normalization is shipped, no package code is edited and no JavaScript DSP
fallback is used.

Sent upstream through the shared AILANG feedback store as
`inbox_1793002335344_d807adcf`. Fix/release belongs to the core agent. After a fixed
matching CLI/WASM release exists, update the isolated pin/checksum, reproduce both
minimal cases, and rerun the real artifact/browser acceptance before deployment.

## Executed checks

| Layer | Observed result |
|---|---|
| Native strict-bytecode tests | 8/8 pass, 0 skipped; 7 named bodies on VM with 0 fallback, 1 property ×100 evaluator cases |
| Native runtime contracts | Six full fixture exports pass with `--verify-contracts` |
| Independent reference | Six preset/echo combinations: exact WAV hash/metadata, decoded peak/RMS and independent scalar gain/feedback/PCM reference; maximum observed error 1 s16 unit versus allowed 2 because reference starts from quantized original |
| Worker controller | 7 Node tests pass: bounded replacement, stale/duplicate IDs, cancellation during async validation, startup/job timeouts and retry ownership |
| Static artifact | Registry-only lock, exact content identity, original package sources, pinned archive SHA-256, emitted module/WASM hashes and bundled licenses |
| UI/browser using native-fixture worker | Pass: all six selections, A/B control calls, stop/cancel/retry, byte-identical WAV download, local-only requests, desktop/mobile layout; checked at `/audio-tools/` and deployment-prefixed path |
| Actual released WASM | FAIL: package module loading, before render/byte bridge acceptance |
| Actual browser with unmodified worker | FAIL: same runtime module-loading error; `__demoReady` is not set and a retryable error is shown |
| Deployment | Not attempted; CI requires real runtime acceptance before emitting the public artifact |

The UI browser test explicitly intercepts the worker with **native-generated
fixture output**, solely to test UI/lifecycle/export while core is blocked. It
is not a WASM pass, inference result, physical playback or audible-quality test.
No microphone or provider request occurs. Screenshots are named `*-ui-fixture.png`
and kept as generated artifacts with this scope. Actual page execution never
loads this fixture transport.

## Strict package quality, section by section

The actual strict report is [evidence/quality.json](evidence/quality.json).

| Section | Result |
|---|---|
| Compile | 3 files pass |
| Contracts | 1/4 verified, 3 unsupported-encoding skips, 0 refuted/errors, 0 uncontracted exports |
| Interface | 6 signatures; v2 `298b32189e160b660385dd852fbc8ae7b281076168ebf18cb16d2e0e116deb63` |
| Effects | Declared max [IO], rank IO; host functions pure, IO only in smoke with @limit=1 |
| Release | Feature, nonempty 0.1.0 changelog; application only, no registry publication |
| Docs | AGENT.md and ai_summary present; one exported module covered |
| Style | 4/4 exports pure |
| Tests/smoke | 8/8 tests executed; smoke present, executed and passed |
| Gates/badges | No gates, strict passes; PUB016 is informational for 3 unproved contracts |

The proved contract covers the closed preset domain. Processing/export/JSON
contracts contain unsupported calls; guards and executed fixtures supply runtime
evidence. Mathematical proofs do not establish IEEE arithmetic, realtime deadlines,
perceived loudness, physical latency or model meaning. Browser optional runtime
contracts have not been measured because the module graph cannot load.

## Reproduction

See README.md for full commands. The real gates are `test/wasm.cjs` and
`test/browser.cjs` without AUDIO_UI_FIXTURES. Keep their failures visible in CI;
never skip them or count the fixture UI mode as actual package execution.
