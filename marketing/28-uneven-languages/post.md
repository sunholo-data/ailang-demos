---
title: AI Codes Unevenly Across Languages — and That's a Language Problem
day: 82
demo: LoCoBench heatmap — model performance by language
link: https://ailang.sunholo.com/docs/vision
image: marketing/_assets/programming-language-performance-heatmap.png
imageAlt: LoCoBench heatmap showing how large language models score very differently writing the same task in different programming languages.
assets:
  - "Image: programming-language-performance-heatmap.png (AILANG docs)"
---

The same model. The same task. Two different programming languages. Two very different success rates.

LoCoBench, the long-context coding benchmark, shows it bluntly. Models that ace one language drop ten or fifteen percentage points in the next. This is not the model's competence — it's the language's shape.

So what's the shape that AI codes well in?

Working backwards from the benchmarks:
- **Strong type signatures.** The model uses the type as a constraint while generating. Vague types let it drift.
- **One way to do things.** Pattern-matching beats loops because there's nothing to choose between. Five Pythonic forms is a five-way coin flip.
- **Explicit effects.** When `! {Net, FS}` is on the signature, the model knows what's allowed. When it's implicit, it guesses.
- **Local reasoning.** A function whose behaviour depends on five files of context is a function the model gets wrong more often than one whose behaviour is the function.
- **Contracts in the signature.** `requires`/`ensures` aren't documentation — they're constraints the model can use to narrow its options before it generates a single token.

This is the design brief for AILANG. Not "make a beautiful language for humans" — make a language whose grammar fits the way an LLM samples tokens. Constraints that look like noise to a human reviewer are scaffolding to a model.

The heatmap is a benchmark. The shape of the heatmap is a roadmap.

#AILANG #AIEngineering #ProgrammingLanguages #LLMs #LanguageDesign
