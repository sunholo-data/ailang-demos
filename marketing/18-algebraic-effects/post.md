---
title: Side Effects as Types — Why Your AI Agent Needs This
day: 52
demo: Algebraic Effects (Cross-demo concept)
link: https://www.sunholo.com/ailang-demos/
assets:
  - "Image: Code block screenshot showing effect annotations"
  - "Alt image: `vision-stack.svg` (root)"
---

Every function in AILANG declares its side effects in its type signature:

```
func recommend(product: Product) -> string ! {AI @limit=3}
func parseDoc(path: string) -> Document ! {IO, FS}
func validate(data: string) -> bool ! {}
```

The `!` declares what the function can do:
- `! {AI @limit=3}` — makes at most 3 AI calls, nothing else
- `! {IO, FS}` — can do I/O and filesystem, but no network, no AI
- `! {}` — pure function. Zero side effects. Deterministic. Guaranteed.

The compiler rejects undeclared effects. An AI function can't secretly make network calls. A parser can't write files. A validator can't call an LLM.

Why this matters for AI agents:

Most AI agent frameworks let tools do anything. Call any API. Write any file. Make any network request. You trust the LLM to only call tools "correctly."

With algebraic effects, the tool physically can't exceed its declared capabilities. Not because of a runtime check. Because the type system won't compile it.

Effects compose:
- `! {IO, AI}` = I/O and AI calls, nothing else
- `! {IO @limit=50, AI @limit=10}` = budgeted I/O and AI
- Nested modules inherit parent limits

The WASM sandbox enforces effects at runtime. The compiler verifies them at build time. Both agree.

This is the missing piece in AI safety. Not what the model says it will do. What the code can physically do.

#TypeTheory #ProgrammingLanguages #AISafety #AlgebraicEffects
