# AILANG Demos

Vertical demos showcasing [AILANG](https://ailang.sunholo.com/) — a pure functional programming language with Hindley-Milner type inference, algebraic effects, and first-class AI capabilities.

## Demos

| Demo | Description | Features |
|------|-------------|----------|
| [Document Extractor](invoice_processor_wasm/) | AI-powered document extraction validated by AILANG contracts via WebAssembly — live on GitHub Pages | AI effect, contracts, std/json, multimodal (PDF/images), capability security, WASM |
| [Ecommerce](ecommerce/) | AI recommendations, data pipelines, BigQuery analytics, contracts, REST API + React UI | AI effect, capability budgets, OAuth2, REST API, serve-api, inline tests, requires/ensures |

## Demo Showcase

### Document Extractor

Upload any document — text, image, or PDF — define a schema (or let AI detect one), and get validated, type-safe extraction results. **100% local, 100% AI-coded.** Nothing leaves your browser except the API call to the AI provider — and the provider is swappable via AILANG's `! {AI}` effect system.

**[Try it live →](https://sunholo-data.github.io/ailang-demos/)**

![AILANG Document Extractor](invoice_processor_wasm/assets/extraction-demo-ui.png)

**Features:** 7 demo presets (invoice, receipt, contract, bank statement, shipping label, resume, PDF invoice), AI schema detection, multimodal file upload (images + PDFs), real-time pipeline visualization, 3-tier graceful degradation, generated AILANG code view. AILANG validates every AI extraction result with contracts and type-safe JSON parsing — deterministic validation of stochastic AI output.

### Ecommerce

Six working demos covering AI integration, data pipelines, capability budgets, BigQuery analytics, design-by-contract verification, and a REST API with React UI.

![Ecommerce Dashboard UI](ecommerce/img/ecommerce-dashboard-ui.png)

**Features:** Contract verification forms, live BigQuery analytics with charts, AI-powered product recommendations, server status monitoring, and zero-code API generation from AILANG modules.

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
- **Contracts** — `requires`/`ensures` preconditions and postconditions
- **WebAssembly** — run AILANG in the browser with full stdlib support

## Repository Structure

```
demos/
├── invoice_processor_wasm/   # Document Extractor (WASM, GitHub Pages)
│   ├── index.html            # Main page — 3-column pipeline layout
│   ├── js/                   # Pipeline orchestrator, Gemini client, schema compiler
│   ├── css/                  # Sunholo design system
│   ├── assets/               # Screenshot, demo PDF
│   └── wasm/                 # AILANG WASM binary (downloaded by CI)
├── ecommerce/                # Ecommerce vertical demo
│   ├── main.ail              # AI product recommendations
│   ├── pipeline_runner.ail   # Data pipeline
│   ├── trusted_analytics_demo.ail  # Budget-as-contract
│   ├── bigquery_demo.ail     # BigQuery GA4 analytics
│   ├── contracts_demo.ail    # Design-by-contract verification
│   ├── ui/                   # React dashboard (serve-api frontend)
│   └── services/             # Shared services (auth, BigQuery, AI)
└── models.yml                # AI model configuration
```

## References

- [Document Extractor — Live Demo](https://sunholo-data.github.io/ailang-demos/)
- [Demo Source Code](https://github.com/sunholo-data/ailang-demos)
- [AILANG Documentation](https://ailang.sunholo.com/)
- [AILANG Source](https://github.com/sunholo-data/ailang)
