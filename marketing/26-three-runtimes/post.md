---
title: Browser, Server, Laptop — Same Code
day: 76
demo: AILANG WASM + Cloud Run + native CLI
link: https://www.sunholo.com/ailang-demos/
image: marketing/_assets/vision-hero.png
imageAlt: AILANG compiles to WASM for the browser, runs server-side on Cloud Run, and executes natively on macOS/Linux — same source, three runtimes.
assets:
  - "Screenshot needed: same AILANG module loaded in browser + curl response from Cloud Run + CLI terminal"
---

AILANG runs in three places. The same module, unchanged.

In the browser, compiled to WASM. The DocParse demo at sunholo.com/ailang-demos/docparse runs every line of AILANG locally — DOCX parsing, PDF extraction, layout AI orchestration. No backend. The user's documents never leave their machine.

On the server, in a Cloud Run container. The Website Builder portal runs AILANG server-side because the AI calls need a service account, and the artefacts get committed to GitHub from there. Same code that runs in the browser, hosted.

On the CLI, as a native binary. The LinkedIn demo, the Ambient Assistant, the Safe Agent — all `ailang run main.ail`. macOS, Linux, the same binary your CI uses.

Why this matters:
- A function with a contract proven in CLI tests retains the same proof when it runs in WASM
- A capability budget enforced server-side is enforced browser-side without rewiring
- The effect system surfaces "this needs `FS`, your browser can't grant it" before the user clicks anything
- Switching deployment targets is a packaging decision, not a rewrite

The deeper point: most languages give you "compiles to X" as a separate concern from "runs correctly on X". AILANG's runtime invariants travel with the module. The Z3 proof, the budget enforcement, the capability checks — they're the same in every host because they're part of the bytecode, not the host.

Three runtimes. One language. One set of guarantees.

#AILANG #WASM #CloudRun #ProgrammingLanguages #Portability
