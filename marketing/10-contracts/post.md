---
title: The Best Documentation Is Code That Won't Compile If It's Wrong
day: 28
demo: Cross-demo concept (Contracts as Documentation)
link: https://www.sunholo.com/ailang-demos/
assets:
  - "Image: `demo-contract-verified.svg` (root) or `ailang-speak-contract.png`"
---

Comments lie. Documentation goes stale. Tests can be incomplete.

Contracts can't.

```
func calculate(op, a, b) -> float
  requires { a >= -1000.0, a <= 1000.0 }
  ensures  { result >= -1000000.0, result <= 1000000.0 }
```

This isn't a comment. It's enforced. Change the implementation so `result` exceeds 1,000,000 and the program halts. Z3 can prove it won't happen at compile time.

Across the AILANG demos:

DocParse (28 contracts):
- `ensures { listLength(result) == listLength(input) }` — map preserves length
- Filter bounds, structural invariants, size preservation

Safe Agent (5 contracts):
- `requires { not contains(relPath, "..") }` — path safety
- `requires { isSelectOnly(sql) }` — SQL safety

Website Builder (7 contracts):
- HTML structure validation
- JS safety (no eval, no unsafe patterns)
- Design brief completeness

Ecommerce (15+ contracts):
- Price discount bounds
- Quantity validation and clamping
- BigQuery query correctness

That's 55+ contracts across 10 demos. Each one is:
- Verifiable by Z3 at compile time
- Enforced at runtime with `--verify-contracts`
- Self-documenting (the contract IS the spec)
- Impossible to ignore (unlike a comment)

The best documentation is documentation that breaks the build when it's wrong.

#SoftwareEngineering #ContractProgramming #CodeQuality #FormalVerification
