# AILANG discovery followups

The first Discord implementation passed compilation and host integration checks,
but that did not establish idiomatic AILANG package quality. The agent read only
part of the language prompt and missed the core package skill, native contracts,
test discovery rules and registry publishing workflow.

Implemented followups (2026-09-08):

- Demos and packages now have AILANG-first AGENTS.md and a portable package skill.
- The core package skill is installed locally in `~/.agents/skills/ailang-packages`.
- Core branch `build/package-authoring-followups` adds the embedded offline
  `ailang docs package-authoring` guide and `ailang pkg quality` evidence inventory.
- Core skill validation now runs compilation, native package tests, inline source
  tests and strict evidence inventory separately. Publishing/proofs remain separate.

The new commands need that core branch until released; the installed system binary
has not been replaced. Build with `go build -o /tmp/ailang-authoring ./cmd/ailang`
from the core checkout, then use that binary for the commands below.

```sh
ailang docs package-authoring
ailang pkg quality --json ../ailang-packages/packages/discord
ailang pkg quality --strict ../ailang-packages/packages/agui
```

The inventory reports declaration presence, never test execution, coverage or
proof. On the original demo packages it reports:

| Package | Native tests | Properties | Contract clauses | Evidence gaps |
|---|---:|---:|---:|---:|
| Discord | 0 | 0 | 0 | 19 |
| AG-UI | 0 | 0 | 0 | 8 |

## Retrofit (2026-09-15)

Both demo packages now carry native evidence. Retrofit notes:

- Contracts were written for every effectless function; Net functions got
  `@limit=1` budgets instead (one HTTP request each; verified against the
  implementation's call shape). API additions: `parseChannels` and `eventName` are
  now exported — both are natural codec surfaces needed by their native tests.
- Explicit `properties [...]` (forall) blocks were tried and abandoned: the forall
  lowering path is broken upstream (core #624; even `forall(l: int) => l >= 0 ||
  wrap(l)` dies with PAR_UNEXPECTED_TOKEN in the synthesized test file). The
  `ensures`-clause path is used instead: each clause auto-runs as a 100-case
  property at `ailang test <module>` time. Inventory `properties` stays 0 by design.
- Skips are structural and documented in each package's AGENT.md: imported
  `std/json` `Json` (and ADTs carrying it) have no property generator, so contract
  cases on `parse*`/Event-param functions skip as `no_generator` (vacuous class);
  module-level runs need `--allow-skips`. Same-file record/ADT types generate fine.

New inventory:

| Package | Native tests | Properties | Contract clauses | Evidence gaps |
|---|---:|---:|---:|---:|
| Discord | 22 | 0 | 22 | 0 |
| AG-UI | 13 | 0 | 8 | 0 |

`ailang pkg quality --strict` now passes for both, and the core
`validate_package.sh` protocol passes end-to-end. Runtime evidence: 22 + 13 native
checks pass with zero skips; 19 contract property cases × 100 inputs pass; Z3
results recorded (1 proved, 20 skipped with reasons, 0 counterexamples). Demo
checks re-run green. New core feedback on the harness findings is prepared in
`discord/CORE_FEEDBACK.md`; not sent.

Those packages intentionally still fail the strict inventory. Retrofitting their
native evidence is separate work; no vacuous contracts were added to pass a count.

Validation of the followups: eight quality regression tests and adjacent CLI docs
tests pass; Go vet passes. Offline guide works outside the checkout without a
stdlib path. A native fixture compiles and executes three checks with zero skips,
then passes the strict inventory. Consumer documentation diff checks and validator
shell syntax pass. No live Discord interactions or registry publication occurred.
