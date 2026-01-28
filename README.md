# AILANG Demos

Vertical demos showcasing [AILANG](https://ailang.sunholo.com/) — a pure functional programming language with Hindley-Milner type inference, algebraic effects, and first-class AI capabilities.

## Demos

| Demo | Description | Features |
|------|-------------|----------|
| [Ecommerce](ecommerce/) | AI recommendations, data pipelines, BigQuery analytics, contracts, REST API + React UI | AI effect, capability budgets, OAuth2, REST API, serve-api, inline tests, requires/ensures |

## Install AILANG

**Claude Code:**
```
/plugin marketplace add sunholo-data/ailang_bootstrap
/plugin install ailang
```

**Gemini CLI:**
```
gemini extensions install https://github.com/sunholo-data/ailang_bootstrap.git
```

See [ailang.sunholo.com](https://ailang.sunholo.com/) for full docs.

## What is AILANG?

AILANG is a pure functional language designed for AI-native applications:

- **Hindley-Milner type inference** — types are inferred, not annotated
- **Algebraic effects** — controlled side effects via capabilities (`IO`, `FS`, `Net`, `AI`)
- **Capability budgets** — hard limits on resource usage with `@limit=N`
- **Pattern matching** — on lists, `Option`, `Result`, and custom ADTs
- **First-class AI** — `std/ai` effect for calling any AI provider
- **Inline tests** — `tests [...]` clause in function signatures

## Demo Showcase

The ecommerce demo includes a full-stack React dashboard powered by `ailang serve-api`:

![Ecommerce Dashboard](ecommerce/img/ecommerce-dashboard-ui.png)

**Features:** Contract verification forms, live BigQuery analytics with charts, AI-powered product recommendations, server status monitoring, and zero-code API generation from AILANG modules.

## Repository Structure

```
demos/
├── ecommerce/          # Ecommerce vertical demo
│   ├── main.ail        # AI product recommendations
│   ├── pipeline_runner.ail  # Data pipeline
│   ├── trusted_analytics_demo.ail  # Budget-as-contract
│   ├── bigquery_demo.ail   # BigQuery GA4 analytics
│   ├── contracts_demo.ail  # Design-by-contract verification
│   ├── ui/                 # React dashboard (serve-api frontend)
│   └── services/       # Shared services (auth, BigQuery, AI)
└── models.yml          # AI model configuration
```

## References

- [AILANG Documentation](https://ailang.sunholo.com/)
- [AILANG Source](https://github.com/sunholo-data/ailang)
