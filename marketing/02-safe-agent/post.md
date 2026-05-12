---
title: How Safe Is Your AI Agent?
day: 4
demo: Safe Agent (Contract-Verified Tool Calling)
link: https://www.sunholo.com/ailang-demos/streaming/safe_agent/
image: ailang-speak-contract.png
imageAlt: AILANG Safe Agent contract diagram — calculator tools constrained by requires/ensures contracts and Net @limit budgets.
assets:
  - "Image: `ailang-speak-contract.png` (root of repo)"
  - "Screenshot needed: Terminal showing `--verify-contracts` output with VERIFIED status"
---

Every AI agent calls tools. Most tools have zero safety guarantees.

What happens when your agent decides to run `DROP TABLE users`?

AILANG's Safe Agent demo has Z3-verified contracts on every tool call. Not "best practices." Mathematical proofs.

Here's what that looks like:

```
func calculate(op, a, b) -> float
  requires { a >= -1000.0, a <= 1000.0 }
  ensures  { result >= -1000000.0 }
```

The Z3 theorem prover verifies these bounds at compile time. Not at runtime. Not in a test suite. At compile time, with a mathematical proof.

What's enforced:
- Calculator inputs clamped to [-1000, 1000], outputs bounded to [-1000000, 1000000]
- File reads restricted to allowlisted paths, no directory traversal (`..` is blocked)
- SQL queries enforced SELECT-only (INSERT, UPDATE, DELETE, DROP all rejected)
- Every tool contract verified by Z3 before the code ever runs

Ask it "Calculate 500 times 300" and the contract verification fires before execution. The agent physically cannot exceed its bounds.

This is what AI safety looks like at the language level. Not guardrails bolted on top. Safety baked into the type system.

Try it live: https://www.sunholo.com/ailang-demos/streaming/safe_agent/

#AISafety #FormalVerification #AIAgents #LLMTools
