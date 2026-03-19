---
title: What If Your AI Agent Had a Spending Limit?
day: 13
demo: Cross-demo concept (Capability Budgets)
link: https://www.sunholo.com/ailang-demos/
assets:
  - "Image: Code block screenshot showing capability annotations"
  - "Screenshot needed: Terminal showing budget exhaustion error when limit exceeded"
---

What if your AI agent had a hard spending limit enforced by the compiler?

Not a soft limit. Not a "please don't exceed this." A compiler error if the code even tries.

AILANG capability budgets:

```
entry main(prompt: string) -> string
  ! {IO @limit=50, AI @limit=10, Net @limit=5}
```

This function can perform at most 50 I/O operations, 10 AI calls, and 5 network requests. The type system enforces this. Exceed the budget and the program halts — deterministically.

In the ecommerce analytics demo, `Net @limit=5` means EXACTLY 4 API calls + 1 auth token exchange. Not "about 5." Exactly 5. Any deviation is a bug, not a surprise bill.

Where this matters:

- AI costs: `AI @limit=10` caps your Gemini/Claude spend per invocation
- Data trust: `Net @limit=5` proves your pipeline makes exactly N external calls
- Security: `FS @limit=0` means a function physically cannot touch the filesystem
- Composability: nested modules inherit parent limits

This is the missing piece in AI agent economics. Not monitoring. Not alerting. Prevention.

Your AI agent's cost is a type signature, not a hope.

#AICosts #DataTrust #Observability #AIAgents
