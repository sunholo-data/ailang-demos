---
title: The Regulator and the Compiler Want the Same Thing
day: 91
demo: AILANG meets the EU AI Act
link: https://artificialintelligenceact.eu/article/13/
image: marketing/_assets/vision-stack.png
imageAlt: EU AI Act Article 13 requirements line up with AILANG's effect rows, contracts and trace logs — the regulator and the compiler converging from opposite directions.
assets:
  - "Image: side-by-side of Article 13 text vs an AILANG function signature with effects + contract"
---

The EU AI Act, enforceable for high-risk systems from August 2026, asks for a specific list. Article 13: transparency, logging, human oversight, documented limitations, risk management, post-market monitoring.

These are not stylistic preferences. They are the structural requirements for any AI system you can defend in a hearing.

AILANG was designed independently. It was not aimed at the AI Act. It was aimed at a programming language whose runtime guarantees what the code says. And yet:

| Article 13 asks for... | AILANG provides... |
|---|---|
| Documented limitations of the system | `requires`/`ensures` contracts on every function |
| Logging of operation | OpenTelemetry spans across every effectful call |
| Human oversight points | `--caps` granted at the CLI — the human is in the loop at the capability boundary |
| Risk management | Capability budgets (`Net @limit=1`) — a function cannot exceed what's declared |
| Transparency about decision boundaries | Effect rows — `! {Net, FS, AI}` on every signature |
| Information about data categories used | IFC labels — `string<pii>` propagates until explicitly declassified |
| Post-market monitoring | Same OpenTelemetry trace, in production, against the same span schema |

When an independent regulator and an independent programming language converge on the same list, the list is not a fashion. It's the shape any defensible AI system has to take.

The US will get there through sector-specific rules. The UK through the AI Safety Institute. The pattern is the same everywhere — declared authority, observable actions, refusal paths, documented limitations.

AILANG didn't anticipate Article 13. It just turned out that compilers and regulators are both trying to keep the same thing from happening.

#AILANG #EUAIAct #AICompliance #AIGovernance #TypeSystems
