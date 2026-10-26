# Audio Tools demo application

Public module: `sunholo/audio_tools_demo/host`; exports `AudioOutput`,
`FixtureRequest`, `presetValid`, `render`, `probe` and `fixture`.

Read DESIGN_SPEC.md and SPRINT_PLAN.md. Keep reusable DSP in sunholo/audio. This
application is source/site only; never publish it to the AILANG registry.

host.render(preset, echo) returns checked original/processed WAV bytes and JSON
metadata. Presets are closed data. UI JavaScript handles lifecycle and playback,
not synthesis, effects, levels or WAV encoding. Source rate is 24 kHz mono,
source <=24,000 frames, tail <=6,000, total <=30,000. Delay/gain states span blocks.

Use the exact registry lock and dedicated v0.54.18 CLI/WASM runtime. Tests and
quality are separate from browser/device evidence. Loop Lab links must accurately
show source/local setup until a real public application URL exists.
