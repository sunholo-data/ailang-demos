# Experience-shaped self-image — 2026-09-21

A Noul's player description (or built-in starting temperament) remains immutable.
The current self-description can change as Jev reflects on completed experiences.
This is contextual learning within the habitat session, not model training.

## Behavior and boundaries

- AILANG records completed need satisfaction, encounters, arrivals, resting,
  avoidance, and inventory handling. Intentions, hesitation and edge collisions
  are not successful experiences. Approaching does not prove safety; fleeing
  does not prove danger. Evidence identifies objects/companions and ticks.
- After three new completed experiences, the existing batched judgment includes
  one `self_belief` Choice: keep, braver/careful, company/solitude, explorer/content.
  Jev judges whether the events support one modest revision. The app's explicit
  0.65 confidence gate retains the old belief when uncertain. Reflection uses
  the returned choice, not the action sampler. A keep/uncertain response consumes
  that evidence window; missing legacy answers do not.
- Each opposing pair is one dimension. At most three beliefs, six recent events
  and five revisions persist per creature. Subsequent evidence can reverse a
  belief. The original description, physical abilities, appearance and numeric
  confidence/threat settings remain intact. Current beliefs enter the next
  perception and personality instructions and override starting preferences only
  where those beliefs differ.
- Text is composed from the typed vocabulary in AILANG; it is not free-form Jev
  prose. Every revision stores before/after and the observed evidence window.
  Evidence is the material assessed, not a generated claim of causal explanation.
- Banked perceptions carry self-image and pending events. Reflection application
  uses that snapshot; experience accumulated during fetch stays pending. Reusing
  an already-applied reflection cannot change identity again. Legacy banks with
  no reflection answer retain their existing behavior.
- Native recording now carries its stamped/reflected creatures into the next
  tick. Previously `tickDeliberations` attempted to update an already-consumed
  creature in `rest`, and `recordTicks` stepped the original world.
- One extra question in the existing call; no added network/random effects.
  Prompt size can increase cost. The existing per-tab reported-usage budget still
  applies. Reset/reload starts a new life; importing a bank remains decision
  inspection, not full saved-habitat restoration.

## Evidence

- Installed native CLI: v0.40.2-6-ge12e0335d-dirty; browser: released v0.40.2.
- Package compile and lock resolution passed. Native package: 75 passed, zero
  failed/skipped. `identity_test.ail` additionally runs 14 native runtime checks
  with contracts enabled, including reversal, bounds, codec, legacy answers,
  low confidence, duplicate application and asynchronous evidence.
- Native selftest: all six passed.
- Actual released WASM: existing suite plus completed social encounters, real
  request construction/response parsing, reflection, exact state replay and
  preservation of post-snapshot experience passed. Provider answers synthetic.
- Public static browser flow: direct provider request, continued movement during
  fetch, parse/sample, verified replay and spending stop passed with synthetic
  responses and zero private API requests.
- `test-identity-browser.cjs`: real WASM/codec/bank/UI, clickable habitat notice,
  original/current descriptions and evidence, desktop and 390/320px passed.
- Inline world tests: 7 passed / 30 skipped; souls: 3 passed / 10 skipped.
  Generators cannot construct the compound inputs needed for these contracts.
- Static verification: world physiology contract proved; new experience function
  skipped for unsupported list/record operations. No proof of reflection or
  semantic appropriateness is claimed. Runtime contracts cover concrete cases.
- Strict package quality still fails existing registry publication metadata gates:
  versioned changelog, release kind, repository URL; AGENT/smoke guidance absent.
- No paid Jev call was made. Whether real gameplay yields compelling identity
  development still needs observation against real model responses.

## Reproduced native test extraction issue

`cd decisions && ailang test identity_test.ail` with a named test calling
`reflect(experienced(), "company", 0.9)` fails on the installed binary with
`_str_len: expected String, got *eval.ListValue`. It also fails after aliasing
list length. The same reflection functions pass under
`ailang run --verify-contracts --caps IO --entry main identity_test.ail` and WASM.
This reproduces the existing bank-test extraction issue; it is not a reason to
skip native validation. Four extraction-safe named cases stay in the package
suite; the 14-case native runtime harness is mandatory in CI alongside WASM.

`ailang docs package-authoring` remains unavailable without local stdlib lookup.
Used the full installed prompt, core package skill/manifest and local stdlib docs.
