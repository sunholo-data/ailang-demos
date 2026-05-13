---
title: The Language Ships With Its Own MCP Server
day: 79
demo: AILANG MCP — agent-readable docs
link: https://github.com/sunholo-data/ailang
image: marketing/_assets/ai-engineer.png
imageAlt: AILANG's docs are queryable directly by Claude, Cursor, and any MCP client — the language exposes itself to the agents writing in it.
assets:
  - "Screenshot needed: Claude Desktop querying ailang-docs MCP tools"
---

AILANG was designed to be written by AI. So the documentation is shaped for AI to consume.

The language ships an MCP server. Claude, Cursor, any MCP client can ask it questions directly:

- `stdlib_search "URL encoding"` — find functions across the standard library
- `effects_catalog` — list every effect, what it grants, what restricts it
- `example_for_concept "row polymorphism"` — fetch a runnable example
- `design_doc "M-TAINT-TYPES"` — pull the design rationale for a feature
- `changelog_for_version 0.19.0` — the structured changelog for a release
- `submit_feedback` — file a bug or feature request from inside the agent's session

Every agent writing AILANG has the language's full documentation, design history, and feedback channel one tool call away. No web scraping, no guessing at function names from training-cutoff snapshots, no hallucinating effect rows.

The flywheel:
- An agent hits a stdlib gap. It calls `submit_feedback` with the offending code.
- The maintainers see it next morning, file a design doc, ship the fix.
- The next session, the agent fetches `changelog_for_version` and uses the new API correctly.

This LinkedIn campaign was built that way. Three pain points went from the demos repo to AILANG core via the MCP feedback tool while these posts were being drafted: a URL form-encoder, a static-handler redirect quirk, and a graceful-shutdown signal. Two were fixed by the next release.

The language and its consumers are on the same wire.

#AILANG #MCP #AIEngineering #DeveloperTools #LLMs
