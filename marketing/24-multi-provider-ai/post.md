---
title: One std/ai, Five LLM Vendors
day: 70
demo: std/ai — unified AI provider layer
link: https://github.com/sunholo-data/ailang
image: marketing/_assets/aitana-brain.png
imageAlt: One AILANG API speaks to Claude, Gemini, GPT, OpenRouter and Ollama — each one's native primitives, not a lowest-common-denominator wrapper.
assets:
  - "Screenshot needed: same AILANG code running against four providers with the cost meter shown"
---

Most "multi-provider" LLM SDKs flatten everything down to chat completions. You lose tool-calling, you lose structured output, you lose prompt caching, you lose the bits that actually matter.

AILANG's `std/ai` doesn't flatten. It maps each feature to whatever native primitive the provider supports.

```ailang
call(prompt, model = "claude-haiku-4-5")    -- Anthropic
call(prompt, model = "gemini-2.5-flash")    -- Google
call(prompt, model = "gpt-5.1-nano")        -- OpenAI
call(prompt, model = "openrouter/...")      -- OpenRouter
call(prompt, model = "ollama:llama3")       -- local
```

The same code switches providers. What changes underneath:

- **Tool calling**: Anthropic's `tool_use`, Gemini's `function_call`, OpenAI's `tool_calls`, normalised into one AILANG event stream
- **Structured output**: Gemini's `responseSchema`, OpenAI's `response_format.json_schema`, Anthropic's forced-tool pattern, Ollama's `format` field — one `callJson(prompt, schema)` API
- **Prompt caching**: Anthropic's `cache_control`, Google's `CachedContent`, OpenAI's implicit threshold — one `cacheHint()` marker
- **Streaming**: SSE for OpenAI/Anthropic, WebSocket for Gemini Live, NDJSON for Ollama — one `callStream` API
- **Reasoning**: thinking-model traces surfaced as a typed stream variant
- **Tool loops**: multi-turn dispatch managed by the runtime, not the caller

This means the AILANG demos run the same code through whichever provider gives the best cost/latency for each task. The eval harness exercises every one of them every release. The provider that breaks first surfaces in the leaderboard.

It also means switching providers is a one-character diff, not a refactor.

#AILANG #LLMs #AIEngineering #DeveloperTools
