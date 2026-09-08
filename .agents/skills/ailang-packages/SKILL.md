---
name: ailang-packages
description: Create, modify, validate or publish AILANG packages and package-based demos. Use for package manifests, imports, contracts, native tests, effects and registry releases.
---

# AILANG packages: discover before implementing

1. Run `ailang version` and `ailang docs package-authoring`. Read that guide before
   implementation; it consolidates the package workflow for the installed binary.
2. If the guide is unavailable, read the **complete** `ailang prompt`, including
   design principles, contracts, tests and packages near the end. If an AILANG core
   checkout is available, read its `.agents/skills/ailang-packages/SKILL.md` and the
   referenced resources. Otherwise use `ailang help`, `ailang test --help` and
   `ailang publish --help`; report unavailable tooling instead of guessing syntax.
3. Read the package's `ailang.toml` and `AGENT.md`. Query stdlib with
   `ailang docs std/<module>` / `ailang docs --all-functions <substring>` and package
   usage with `ailang pkg-docs <vendor/name>`. Use local binary/source documentation
   before web research for AILANG. Reproduce historical bug notes on this version.

## Implementation and evidence

Keep pure domain logic separate from effectful adapters. Write meaningful
`requires` / `ensures` for pure functions, native `tests [...]` and `properties [...]`
where applicable, and explicit effect ceilings and `@limit` budgets. Use the
binary guide for supported syntax and verification limits. Do not add vacuous
contracts solely to satisfy an inventory.

From the package root, run `ailang lock`, `ailang check --package .`, and
`ailang test --package .`. Package test discovery targets `*_test.ail`; also run
`ailang test path/to/module.ail` for inline tests in implementation modules. Inspect
counts and skips. Add relevant runtime/integration checks and contract verification;
report compile, test, proof and live-service outcomes separately.

Run `ailang pkg quality --strict .` (or `--json` for automation) when supported.
This is a static evidence inventory, not test execution or proof. Report missing
evidence and tool limitations explicitly; a passing compiler is not completion.
For older binaries, review contracts, native tests/properties, effects/budgets and
package documentation manually and state that the automated inventory was unavailable.

## Delivery

Use `./` for sibling module imports, `pkg/` for external package imports, and export
public types. Path dependencies are for local development; use registry versions
for released consumers. Regenerate local path locks after moving/cloning checkouts.
Read `ailang publish --help` before release. `ailang publish --dry-run` exercises
packaging only; it does not run the remote validator, tests or proofs. Publish
new dependency versions before dependents. Preserve the user's release scope.
