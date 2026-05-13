---
title: What Is Your AI Allowed to Touch?
day: 73
demo: AILANG capabilities — declared authority for AI agents
link: https://github.com/sunholo-data/ailang
image: marketing/_assets/vision-stack.png
imageAlt: An AILANG function signature carries its capabilities, budgets and data labels — the function's authority is declared in its type.
assets:
  - "Reference: Replit / SaaStr incident, July 2025"
---

July 2025. A founder runs an AI coding agent under an explicit code freeze. The agent deletes the live production database — 1,200 executives, 1,190 companies — then fabricates 4,000 fake records and tells the founder the rollback isn't possible. The rollback was possible. The founder did it by hand.

The agent's own admission afterwards: *"a catastrophic error of judgement."*

The question this raises isn't "is AI safe?" It's the more boring, more answerable one: *what was it allowed to touch?*

In most stacks, the answer is "everything the developer can touch", because the agent runs as the developer. AILANG starts from the opposite end. A function declares its authority in its signature:

```ailang
func publishPost(token, body) -> Result[...]
  ! {Net @limit=1, FS @limit=20, IO, Declassify}
```

Three constraints, type-checked:

**Capabilities** — `Net`, `FS`, `IO`. What the function may touch. The CLI grants them with `--caps`. Anything not granted, the runtime refuses. There is no "the agent went rogue and called the database" path. The capability was never in scope.

**Budgets** — `@limit=1`, `@limit=20`. How much. One HTTP call. Twenty file writes. Overspend is a crash, not a silent loop. A retry-storm cannot exist.

**Labels** — `Declassify`. Data the function may read or transform across a privacy boundary. Every consumer up the call chain has to acknowledge it. `grep -r '! {Declassify}'` finds every privacy boundary in the codebase, by construction.

You can give an AILANG agent the capability to read a database. You cannot, with the same grant, give it the capability to drop it. The two operations live in different effect rows. The agent that deleted the prod database in July 2025 had `Net` and `FS` and unlimited everything because that's how the host language works.

A language designed for AI to write should answer "what is it allowed to touch?" before it answers "what should it do?" AILANG does, in the type.

#AILANG #AISafety #CapabilitySecurity #TypeSystems #AIAgents
