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

Those packages intentionally still fail the strict inventory. Retrofitting their
native evidence is separate work; no vacuous contracts were added to pass a count.

Validation of the followups: eight quality regression tests and adjacent CLI docs
tests pass; Go vet passes. Offline guide works outside the checkout without a
stdlib path. A native fixture compiles and executes three checks with zero skips,
then passes the strict inventory. Consumer documentation diff checks and validator
shell syntax pass. No live Discord interactions or registry publication occurred.
