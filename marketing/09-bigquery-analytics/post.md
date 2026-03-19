---
title: 7 GA4 Analytics Queries, Zero Python, Predictable Cost
day: 25
demo: "Ecommerce \u2014 BigQuery Analytics"
link: https://www.sunholo.com/ailang-demos/
assets:
  - "Image: `ecommerce/img/ecommerce-dashboard-ui.png`"
---

Most BigQuery analytics pipelines are Python scripts with unpredictable API costs.

This one is pure AILANG with a hard budget: `Net @limit=20`.

7 GA4 analytics queries:
1. Top events by count
2. Product revenue breakdown
3. Category revenue aggregation
4. Purchase funnel conversion
5. Device type breakdown
6. Geographic distribution
7. Session metrics

Each query is a pure function with 14 inline tests on SQL generation. All passing. The SQL is predictable because the functions are deterministic.

The BigQuery REST API client is pure AILANG:
- OAuth2 ADC token exchange (no SDK, no library)
- Nested `rows[].f[].v` JSON parsing
- Budget enforcement: exactly N API calls per run

But the interesting part is the "Trusted Analytics Pipeline" demo.

`Net @limit=5` means EXACTLY 4 API calls + 1 auth token exchange. This isn't monitoring. It's a contract. Any extra network call is a type error.

This is what data trust looks like when it's enforced by the compiler, not a policy document.

The React dashboard lets you explore all 7 queries interactively, with live BigQuery execution.

#BigQuery #Analytics #DataEngineering #DataTrust
