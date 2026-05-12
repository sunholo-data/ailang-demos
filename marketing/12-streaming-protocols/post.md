---
title: SSE, WebSocket Bidi, Proactive Audio — One Abstraction
day: 34
demo: Streaming Protocols (Cross-demo)
link: https://www.sunholo.com/ailang-demos/streaming/
image: marketing/_assets/demo-streaming-voice.png
imageAlt: Bidirectional streaming with provably safe AI agents — voice waveforms wired through AILANG effects.
assets:
  - "Image: `demo-streaming-voice.svg` (root)"
---

Server-Sent Events. Bidirectional WebSocket. Proactive Audio. Three fundamentally different streaming protocols.

One AILANG abstraction: `std/stream`.

Claude Chat uses SSE:
```
ssePost(url, headers, body)
onEvent(conn, \ev. match ev { ... })
```

Gemini Live uses WebSocket bidi:
```
let conn = connect(url, headers) in
transmit(conn, setupMsg);
onEvent(conn, \ev. match ev {
  Binary(data) => handleAudio(data),
  Message(msg) => handleText(msg)
})
```

Ambient Assistant uses proactive audio:
Same WebSocket API, but the model decides when to send.

The pattern is identical. The protocol details are abstracted away. The type system ensures you handle all event types (Binary, Message, Close, Error).

Effect budgets cap consumption:
- `Stream @limit=500` — at most 500 events received
- `Stream @limit=100` — tighter budget for voice sessions

And the same code works in two runtimes:
- CLI: `std/stream` uses native Go WebSocket/SSE
- Browser: WASM effect handlers bridge to JavaScript WebSocket/EventSource APIs

5 streaming demos, 3 protocols, 2 runtimes, 1 abstraction.

Explore them all: https://www.sunholo.com/ailang-demos/streaming/

#StreamingAPI #WebSocket #ServerSentEvents #ProtocolDesign
