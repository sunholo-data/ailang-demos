---
title: Formal Proofs Don't Stop at the Function Boundary
day: 67
demo: Z3 cross-module verification
link: https://github.com/sunholo-data/ailang
image: marketing/_assets/demo-contract-verified.png
imageAlt: AILANG's Z3 verifier crosses module boundaries — contracts on one function reason about contracts on another.
assets:
  - "Screenshot needed: ailang check --verify-contracts crossing a module boundary"
---

Single-function verification is the easy case. The Z3 theorem prover sees one input, one output, one pair of `requires`/`ensures` clauses, and grinds out a proof.

What about when function A calls function B, which calls C, in three different modules? Most contract systems give up here. The proof obligation crosses a boundary; the verifier loses the thread.

AILANG's verifier doesn't. As of v0.11, it carries type information across module boundaries. As of v0.12, it carries function contracts across them too. The result: a `requires` clause on a top-level function can be discharged by an `ensures` clause on a function five modules deep.

In practice this means:
- The DocParse pipeline has 28 contracts spanning eight modules — Z3 verifies them as one proof, not 28
- The Safe Agent's calculator bounds get inherited by callers without redeclaration
- A change to a contract in one module surfaces as a verification failure in every module that depended on the old shape

This is what makes contracts more than documentation. A comment can lie about a function five files away. A type with a Z3-checkable refinement cannot.

The boundary stops being a place where guarantees expire.

#AILANG #FormalVerification #TypeSystems #Z3 #SoftwareEngineering
