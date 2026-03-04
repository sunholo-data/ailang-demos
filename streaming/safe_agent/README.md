# Safe Agent — Contract-Verified Tool Calling

An AI agent where **every tool function** has `requires`/`ensures` contracts. Demonstrates AILANG's unique value: formal safety guarantees for AI agents.

![AILANG Safe Agent — Contract Verification](ailang-speak-contract.png)

## Architecture

Hybrid REST + SSE streaming:

1. **REST POST** to `generateContent` with tools (triggers tool calling)
2. **Contract-verified** tool dispatch
3. **SSE streaming** of final response (with tool results in context)

## Contracts

| Tool | Guarantee |
|------|-----------|
| `calculate` | Inputs clamped to [-1000, 1000], result in [-1000000, 1000000] (Z3-provable) |
| `readFile` | No directory traversal, restricted to allowed path prefix |
| `query` | SELECT-only — no INSERT/UPDATE/DELETE/DROP |
| `wordCount` | Pure function, always returns count |
| `dispatch` | Always returns `Result`, never crashes |

## Usage

```bash
# Run with runtime contract checking
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,Stream,Net,Env --verify-contracts \
  streaming/safe_agent/main.ail "Calculate 500 times 300"

# Static verification (Z3)
ailang verify streaming/safe_agent/services/verified_tools.ail
ailang verify streaming/safe_agent/services/safety_monitor.ail
```

## Budget

```
IO @limit=100      — Console output + safety report
FS @limit=10       — Safe file reads (restricted path)
Stream @limit=200  — SSE events for streaming response
Net @limit=10      — REST API calls + tool execution
Env                — Read environment variables
```
