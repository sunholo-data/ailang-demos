---
title: Stream Claude's Responses in Pure AILANG
day: 37
demo: Claude Chat (SSE Streaming)
link: https://www.sunholo.com/ailang-demos/streaming/claude_chat/
assets:
  - "Screenshot needed: Browser demo showing streamed Claude response"
---

The Claude Chat demo is intentionally minimal. That's the point.

POST to the Anthropic Messages API. Receive text deltas via Server-Sent Events. Print them as they arrive. No SDK. No wrapper library. Raw HTTP + SSE in a safe language.

The entire streaming connection:
```
let conn = ssePost(url, headers, body) in
onEvent(conn, \ev. match ev {
  Message(msg) => printDelta(msg),
  _ => ()
})
```

Budget enforcement: `Stream @limit=500` caps event consumption. The type system guarantees you won't accidentally consume unbounded events.

The simplicity is the demo. When your language handles streaming as a first-class effect, you don't need a 500-line SDK wrapper. You don't need retry logic libraries. You don't need event buffer management.

You need: a URL, headers, a body, and a pattern match.

Working in CLI and browser. Same AILANG code, two runtimes.

```
ANTHROPIC_API_KEY=sk-ant-... ailang run --entry main \
  --caps IO,Stream,Env streaming/claude_chat/main.ail "What is AILANG?"
```

Try the browser version: https://www.sunholo.com/ailang-demos/streaming/claude_chat/

#Claude #AnthropicAPI #Streaming #MinimalCode
