# Sprint: working audio quick demo

Scope: design milestones A0/A1. Ship a self-contained on-page AILANG sound demo
and Loop Lab feature links. Public Loop Lab hosting and AI/provider inputs are
separate milestones. No package or shared-runtime upgrades are required.

## Deliverables and execution order

| Step | Deliverable | Acceptance |
|---|---|---|
| S1 | Pinned demo application and canonical AILANG pipeline | Registry audio 0.4.0; finite/capped preset request; original and processed WAV bytes with delivered measurements |
| S2 | Actual WASM/byte bridge | Pinned v0.54.18 runtime; complete package graph; Uint8Array output; native/WASM fixture parity and measured preparation |
| S3 | Browser quick demo and Loop Lab showcase | Tone/pluck/noise, echo toggle, make, A/B play, stop, download; no key/mic/autoplay; cancel/stale result ownership |
| S4 | Reproducible build and hub integration | Isolated runtime; checksum/lock identities; local and Pages artifact; hub/README/smoke integration |
| S5 | Validation and handoff | Native tests/properties, runtime probes, strict quality sections, real WASM + browser tests, desktop/mobile screenshots, CI and PR |

Implementation uses the existing design PR. Keep the original audio immutable;
reset every processing run. The worker owns compilation and sample work, while
Web Audio handles explicit playback. Reusable DSP remains in the registry package.

## Resource policy

24 kHz mono; source <=24,000 frames, explicit tail <=6,000 frames, output <=30,000
frames / 60,044 WAV bytes. Delay <=6,000 frames; package block cap 4,096 frames.
At most two layers, one active worker job and one UI-selected replacement. Job
IDs, timeout/worker termination and URL/playback cleanup must prevent stale audio
from becoming playable/exportable. No client-provided recipes or code execute.

## Validation

- Native negative, known-output and deterministic/partition checks; preserve exact
  package/runtime versions and report proof skips separately.
- Real pinned WASM graph calls return bytes and agree with CLI byte identities.
- Browser generates all presets, changes echo, compares/downloads WAV, cancels and
  retries, rejects stale output, keeps keyboard/mobile layout, and resolves both
  local and `/ailang-demos/` base paths with no private endpoints or provider calls.
- Run `ailang pkg quality --strict --json .`; report every section and inherited
  limitations. A failed strict badge is not silently relabelled a pass.
- Test the exact artifact consumed by Pages. No source-only or fake-ready success.

## Visual direction

Use Sunholo's existing light #f6f8fa ground, white #ffffff panels, slate #314352,
coral #e73c17 action and muted #64748b text. Montserrat for headings/body, a modest
monospace face only for measurements. The sound panel is the main interaction:
left-aligned headline, large waveform strip, three preset selectors, one echo
switch and explicit playback controls. A quieter Loop Lab section follows with
its real release/setup status. No animated hero or duplicated DAW controls.

## Completion record

Execution status is maintained in `sprint.json`; evidence and limitations go in
`VALIDATION.md`. Sprint completion means implementation and artifact verification,
not an unobserved public deployment or physical listening/latency guarantee.
