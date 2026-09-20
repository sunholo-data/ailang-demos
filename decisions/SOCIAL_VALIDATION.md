# Social awareness validation — 2026-09-20

Toolchain: AILANG `v0.40.2-6-ge12e0335d-dirty` (commit e12e0335d), Z3 4.16.0.

## Behaviour

All social logic is in the existing AILANG demo world and decision policy. Jev
gets public descriptions/actions and relative positions of other living Nouls,
but not their private vitals or memory. Self is excluded. Personality-specific
preferences and custom character descriptions inform the same batched call's
`companion` and `avoid_companion` distributions. Choices include solitude and
avoiding nobody. The recorded roll samples targets, including non-argmax choices.

Socialize follows the target's current position and stops within three units.
Arrival increases the initiating creature's comfort and records the companion's
name in its bounded recent memory. Avoid moves away until ten units apart. These
are one-sided actions; the other creature independently decides its response.
There is no dialogue, persistent numeric friendship score, or reciprocal affection
assumption. Dead, missing and self targets are rejected by movement lookup.
Social trips permit reconsideration after 60/30 ticks and yield to urgent needs.

No new effects or network requests per deliberation. The existing live boundary
still declares `Net @limit=1, Env @limit=1, Rand @limit=1`; the package retains its
IO/FS/Net/Env/Rand ceiling and the preview's per-session spending limit. Extra
perception text and two typed questions can increase per-call token cost.

## Evidence

Commands run from `decisions/` unless otherwise stated:

- Compile: `ailang check --package .` — all 14 AILANG files passed.
- Native package suite: `ailang test --package .` — 54 passed, zero failed/skipped.
  This includes 12 new social examples and one 100-case social identifier codec
  property. The property uses an `ensures` clause, executed by the native runner.
- Contract runtime: `ailang run --verify-contracts --caps IO --entry main social_test.ail`
  passed; `ailang run --verify-contracts --caps IO,FS,Net,Env,Rand --entry main main.ail selftest`
  passed all six checks, including the legacy synthetic bank.
- WASM: `node decisions/test-wasm.cjs` from repo root checks real module loading,
  social perception, banked companion distributions, a non-argmax target, replay,
  movement and the company activity bubble, plus the existing regression suite.
- Browser: `NOULS_PREVIEW_URL=http://127.0.0.1:8951/decisions/ node decisions/test-browser.cjs`
  from repo root checks names above creatures, real AILANG social action rendering,
  preference charts, selection changes, mobile overflow, touch/pointer controls,
  creation, death, movement interpolation and reduced motion.
  The browser suite uses a clearly marked synthetic saved decision; no real key.
- Live Jev: **not exercised** in this change. All added service questions are
  compiled and assembled natively; actual model preferences/latency/cost still
  require a live session.

## Proof and package-quality limits

`ailang verify world.ail` proves `ageNeeds`. Its previous contract admitted invalid
negative/dead input vitals and was refuted on the baseline too; the corrected
precondition states the valid 0–1 physiological inputs already enforced by the
world constructor/JSON boundary. Social list/record functions cannot be fully
proved by this solver: `otherNouls`, `moveBy`, `profileNumber` and `socialQuestions`
are skipped for unsupported polymorphic Option/Result/list signatures. Runtime
contracts and the native examples cover those paths; no full proof is claimed.

Standalone inline runs are separate from the passing package suite:
`ailang test world.ail` reports 7 passed, 26 skipped; `ailang test souls.ail` reports
3 passed, 1 skipped. Random generators cannot construct all required inputs;
strict execution reports these skips. No examples fail after the physiology
contract correction.

`ailang pkg quality --strict .` remains a failed **publish inventory**, not a proof
or execution result: this existing demo manifest has no public exports, release
kind, repository metadata, versioned CHANGELOG, AGENT guide or clean-workdir smoke.
Its zero exported-signature/contract counts must not be interpreted as coverage.
No registry release is part of this change.

## Reproduced language friction

`ailang docs package-authoring` is unavailable in this binary (`stdlib directory
not found`). Used the complete installed `ailang prompt`, core package skill and
manifest reference, `ailang pkg-docs sunholo/decisions` and local stdlib docs.

At this demo's top-level module namespace, `import ./world (Creature)` in
`module social_test` resolves incorrectly to `pkg/world` (`invalid package import
path: must be vendor/name or vendor/name/module`) with `ailang check social_test.ail`
from this folder. The new test therefore uses the same explicit `import world`
and `import souls` form as the existing modules.

A minimal named string property also fails in the native property-expression
builder on this CLI. Save the following as `/tmp/nouls-property-repro.ail` and run
`ailang test /tmp/nouls-property-repro.ail`:

```ailang
module nouls_property_repro
pure func same(s: string) -> bool = s == s
property "string round trip" { forall(s: string) => same(s) }
```

The generated `_test.ail` fails with `PAR_UNEXPECTED_TOKEN`, expected `)` but got
`IDENT`. The actual codec property instead uses `ensures { result }`, which passes
100 native generated cases. Named example tests work here; the historical
named-test extraction note was not used to bypass them.
