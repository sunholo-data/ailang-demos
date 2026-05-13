---
title: The Language Benchmarks Itself Against the Models Writing It
day: 64
demo: AILANG Eval Harness
link: https://github.com/sunholo-data/ailang
image: marketing/_assets/aitana-brain.png
imageAlt: AILANG ships a benchmark suite that scores Claude, Gemini, GPT and open-source models on how well they write AILANG.
assets:
  - "Screenshot needed: eval dashboard showing model leaderboard with cost/time/success axes"
---

Most languages get benchmarked against other languages.

AILANG benchmarks LLMs.

The repo ships with an eval harness that takes a curated suite of programming tasks, hands each one to Claude, Gemini, GPT, OpenRouter-routed models, and local Ollama models, and measures three things: does the code compile, does it pass the contracts, and what did it cost.

The output is a sweet-spot chart — cost on one axis, time-to-success on another, success rate on the third. It tells you which model gives you the best AILANG for the budget you've got.

Why does this exist?

Because AILANG was designed for AI to write. If the language is harder for one model than another, the language designers want to know. Type errors that surface clearly to Claude but confuse Gemini are language bugs, not user errors.

What this has produced:
- Typed failure categories — "parser error", "effect-row mismatch", "contract violation" — so a regression in one model's score points at a fixable language feature
- Cost-and-speed budgets at the executor — the harness will stop a run if a model is burning more than its allowance
- Eval datasets shared back to the providers when a clean failure mode emerges

The language gets better. The models get better. The harness watches both.

#AILANG #LLMs #Benchmarking #AIEngineering #ProgrammingLanguages
