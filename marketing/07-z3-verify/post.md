---
title: The Compiler Found 4 Bugs the AI Couldn't See
day: 19
demo: Z3 Static Verification
link: https://www.sunholo.com/ailang-demos/verify.html
assets:
  - "Image: `demo-contract-verified.svg` (root)"
  - "Screenshot needed: Z3 verification output showing VERIFIED + VIOLATION results"
---

We wrote 42 contracts in AILANG. Then we ran Z3 theorem prover on all of them.

38 passed. 4 failed.

The failures came with concrete counterexamples:

```
brokenCreditApply(subtotal=0, credits=1)
  => VIOLATION: result is negative
  => Contract requires: result >= 0
```

The AI wrote a billing function. It looked correct. It passed code review. But when subtotal is 0 and credits is 1, the result goes negative.

No test suite caught this. No fuzzer found it. Z3 proved it was wrong in 22 milliseconds — with the exact inputs that break it.

What Z3 verified across 4 modules:

Billing:
- `finalBill` verified through a 4-deep function chain
- `brokenCreditApply` caught: negative result possible

Access Control:
- Admin supremacy proved (admins can always access)
- Guest isolation proved (guests can't escalate)
- 48 permission paths verified

Scheduling:
- Priority ordering, capacity bounds, time conflict prevention

Arithmetic:
- No overflow, bounded ranges, monotonicity

This is the real value of AI-generated code with formal verification. The AI writes fast. The math catches what the AI missed.

See the live results: https://www.sunholo.com/ailang-demos/verify.html

#FormalMethods #Z3 #CompilerDesign #AISafety
