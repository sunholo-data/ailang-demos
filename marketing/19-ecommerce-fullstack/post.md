---
title: 6 Demos, 1 Language: From AI Recommendations to BigQuery Dashboards
day: 55
demo: Ecommerce Full Stack
link: https://www.sunholo.com/ailang-demos/
image: ecommerce/img/ecommerce-dashboard-ui.png
imageAlt: E-commerce full-stack demo: AILANG handling pricing, inventory, and analytics end to end.
assets:
  - "Image: `ecommerce/img/ecommerce-dashboard-ui.png`"
  - "Alt image: `site/thumbnails/ecommerce.png`"
---

One language. One type system. Six demos covering an entire ecommerce stack:

1. AI Product Recommendations
   Pluggable AI providers (Gemini, Claude, GPT, or stub). Same function, different backends. `AI @limit=10` caps your spend.

2. Data Pipeline
   Pure functional list processing: map, fold, filter on product records. JSON file I/O. Aggregation by product ID.

3. Trusted Analytics Pipeline
   `Net @limit=5` = exactly 4 API calls + 1 auth token. The budget IS the contract. Any deviation is a bug.

4. BigQuery GA4 Analytics
   7 analytics queries. OAuth2 ADC auth. Nested JSON parsing. 14 inline tests on SQL generation.

5. Contracts & Verification
   Price discount bounds. Quantity validation. Total calculation. Runtime enforcement or Z3 compile-time proofs.

6. REST API + MCP + A2A + React UI
   37 exported functions as REST endpoints, MCP tools, and A2A skills. Auto-generated OpenAPI 3.1. Swagger UI. ReDoc. React dashboard with 3 interactive tabs.

What ties it together:
- Every function has a type signature with declared effects
- Every side effect is budgeted
- Every contract is enforceable
- Every module works across CLI, API server, MCP, and A2A

This isn't 6 separate projects stitched together. It's one typed codebase serving 6 use cases.

#Ecommerce #FullStack #DataPipelines #AIEngineering
