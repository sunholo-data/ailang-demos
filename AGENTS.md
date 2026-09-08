# AILANG demo development

Read [CLAUDE.md](CLAUDE.md) for this repo's demo architecture and commands.
The deliverable is working AILANG code: keep reusable domain logic in packages
and the demo application here.

Before writing AILANG, read [.agents/skills/ailang-packages/SKILL.md](.agents/skills/ailang-packages/SKILL.md).
Start with `ailang version` and `ailang docs package-authoring`; use the installed
binary's `ailang prompt`, `ailang docs std/<module>` and `ailang pkg-docs <vendor/name>`
before searching the web for language or package information. The skill includes
the fallback for binaries without the authoring guide.

Treat historical bug notes in CLAUDE.md as version-specific hypotheses. Reproduce
them on the installed binary before adding transitive imports or replacing native
tests with a host-language harness.

Compilation is one check. Package work also needs meaningful contracts, native
tests/properties, effect ceilings and budgets, plus runtime/integration validation
appropriate to the change. Run `ailang pkg quality --strict <package-dir>` when
available and report missing evidence; it inventories source and does not execute
tests or prove contracts. Keep minimal language-friction repros with the CLI
version and command. Report compile, test, proof and live-service results separately.
