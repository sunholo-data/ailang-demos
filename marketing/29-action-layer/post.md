---
title: You Can't Read the Weights. You Can Read the Actions.
day: 85
demo: AILANG + OpenTelemetry — action-layer audit
link: https://github.com/sunholo-data/ailang
image: marketing/_assets/ailand-cloud-trace.png
imageAlt: An OpenTelemetry trace spanning AILANG executor, AI provider and tool calls — the action layer is what you can subpoena.
assets:
  - "Image: ailand-cloud-trace.png (AILANG docs)"
---

Anthropic publishes interpretability research on Claude. The summary, in their own word: when Claude is asked to explain how it solved an arithmetic problem, it describes a method it didn't actually use. They call this "bullshitting" — not malicious, just learned. Reasoning models do it too. Bigger models do it more.

Which means the model's explanation is marketing copy, not audit evidence.

So what *is* auditable?

There are three layers in any AI system:
- **Weights** — opaque. Can't be reviewed. Can't be subpoenaed.
- **Reasoning** — shown, but unreliable. The model performs reasoning because that shape gets rewarded.
- **Actions** — fully knowable. Every tool call, every file read, every network request, every contract check.

AILANG is built around the third layer.

Every effectful operation is OpenTelemetry-traced by default. Set `OTEL_EXPORTER_OTLP_ENDPOINT` and the spans flow to Grafana, Honeycomb, Cloud Trace, whichever backend you already have. The trace shows:
- Which AILANG function called the AI provider
- Which tools the model asked to run
- Which files were read, which writes were attempted, which budgets were exceeded
- Token count, cost, latency — per call, per turn, per session

The trace doesn't care what the model said it was doing. It records what actually ran. A claim like "I checked the database before deleting" is a thing you can confirm or refute against the span tree.

You cannot subpoena a developer's thought process. You can subpoena a chat log. AILANG makes the action layer the one you keep.

#AILANG #AIEngineering #Observability #AISafety #OpenTelemetry
