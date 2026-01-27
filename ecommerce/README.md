# AILANG Ecommerce Demo

A vertical demo showcasing AILANG's capabilities for ecommerce applications, including AI-powered features, data pipelines, and BigQuery integration.

## What is AILANG?

AILANG is a pure functional programming language with:
- Hindley-Milner type inference
- Algebraic effects for controlled side effects
- Pattern matching on algebraic data types
- First-class AI capabilities
- **Capability budgets** for resource control and cost management

## Running the Demos

### Prerequisites

1. Install AILANG: `go install github.com/sunholo-data/ailang@latest`
2. For AI demo: Set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`
3. For BigQuery demo: Run `gcloud auth application-default login`

### AI Provider Authentication

| Provider | Flag | Auth Method |
|----------|------|-------------|
| Anthropic | `--ai claude-haiku-4-5` | `ANTHROPIC_API_KEY` env var |
| OpenAI | `--ai gpt5-mini` | `OPENAI_API_KEY` env var |
| Google (AI Studio) | `--ai gemini-2-5-flash` | `GOOGLE_API_KEY` env var |
| Google (Vertex AI) | `--ai gemini-2-5-flash` | ADC fallback when `GOOGLE_API_KEY` is unset (⚠️ see note) |
| Stub (testing) | `--ai-stub` | No key needed |

> **⚠️ Vertex AI Note:** ADC fallback currently uses `locations/global` which doesn't host Gemini models. Use `GOOGLE_API_KEY` (AI Studio) until a `--vertex-location` flag is added. Bug reported to AILANG core.

### Demo 1: AI Product Recommendations (Working)

```bash
# Google Gemini via AI Studio (requires GOOGLE_API_KEY)
ailang run --entry main --caps IO,AI --ai gemini-2-5-flash ecommerce/main.ail

# Google Gemini via Vertex AI ADC (requires gcloud auth - ⚠️ see Vertex AI note above)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI --ai gemini-2-5-flash ecommerce/main.ail

# Anthropic Claude Haiku (requires ANTHROPIC_API_KEY)
ailang run --entry main --caps IO,AI --ai claude-haiku-4-5 ecommerce/main.ail

# OpenAI GPT-5 Mini (requires OPENAI_API_KEY)
ailang run --entry main --caps IO,AI --ai gpt5-mini ecommerce/main.ail

# Stub - no API key needed, for testing
ailang run --entry main --caps IO,AI --ai-stub ecommerce/main.ail
```

This demo shows:
- AI-powered product recommendations using `std/ai`
- AI-generated product descriptions
- Basic data processing with records and lists

### Demo 2: Data Pipeline (Working)

```bash
ailang run --entry main --caps IO,FS ecommerce/pipeline_runner.ail
```

This demo shows:
- Local data transformations
- Record processing
- Pattern matching on lists
- Pure functional data pipelines

### Demo 3: Trusted Analytics Pipeline (Working)

```bash
ailang run --entry main --caps IO,FS,Net ecommerce/trusted_analytics_demo.ail
```

This demo shows **budgets as contracts for data trust**:
- **Bounded execution**: `Net @limit=5` guarantees max 5 API calls
- **Predictable costs**: Each query = 1 API call = known cost
- **Fail-fast**: Budget violations stop immediately, not after overspending
- **Auditable**: "This report used exactly 4 queries"

The budget acts as a **contract** between the code and infrastructure, ensuring the analytics pipeline behaves exactly as specified.

### Demo 4: BigQuery GA4 Analytics

```bash
ailang run --entry main --caps IO,FS,Net ecommerce/bigquery_demo.ail
```

This demo shows:
- OAuth2 authentication using Application Default Credentials
- BigQuery REST API integration
- GA4 ecommerce analytics queries
- Pure AILANG HTTP client implementation

## Project Structure

```
ecommerce/
├── CLAUDE.md                    # AI assistant context file
├── README.md                    # This file
├── main.ail                     # AI demo entry point
├── pipeline_runner.ail          # Data pipeline demo
├── trusted_analytics_demo.ail   # Budget-as-contract for data trust
├── bigquery_demo.ail            # BigQuery GA4 demo
└── services/
    ├── recommendations.ail      # AI product recommendations
    ├── gcp_auth.ail            # GCP OAuth2 ADC authentication
    ├── bigquery.ail            # BigQuery REST API client
    └── ga4_queries.ail         # Pre-built GA4 SQL queries
```

## Key Learnings

### What Works Well

1. **AI Integration** - The `std/ai` module provides clean AI API access
2. **Pattern Matching** - List, Option (`Some`/`None`), and Result (`Ok`/`Err`) all work correctly
3. **HTTP Requests** - `std/net` httpRequest works for REST API calls
4. **JSON Handling** - Building JSON with `jo`, `kv`, `js` works well
5. **Effect System** - Declaring capabilities (IO, FS, Net, AI) provides good guardrails
6. **Capability Budgets** - `@limit=N` gives hard guarantees on resource usage
7. **Inline Tests** - `tests [...]` clause in function signatures for zero-cost verification
8. **If-Then-Else Blocks** - Multi-statement blocks work in branches
9. **Records in ADT Constructors** - `Ok({ field: value })` works directly (ANF normalization)

### Design Choices to Know

1. **Reserved Words** - `exists`, `forall`, etc. are reserved; parser gives helpful suggestions
2. **Non-Transitive Imports** - Each module must import its own dependencies explicitly
3. **Inline Tests Limitation** - Tests may fail on modules with complex imports (test harness bug)

### Developer Experience Observations

**Positive:**
- Clean syntax similar to ML/Haskell
- Good error messages during type checking (including reserved keyword detection)
- Effect system catches capability mismatches at compile time
- Standard library is well-organized
- Stdlib version warning shows once, suppressible with `AILANG_NO_VERSION_WARNINGS=1`


## Capability Budgets

This demo uses AILANG's capability budget system to control resource usage.

### What Are Capability Budgets?

Capability budgets use `@limit=N` to restrict how many times a function can perform a particular effect:

```ailang
-- Limit IO to 50 operations, AI to 5 calls
export func main() -> () ! {IO @limit=50, AI @limit=5} { ... }
```

**Key semantics:**
- **Per-invocation**: Each function call gets a fresh budget
- **Fail-fast**: Throws `BudgetExhaustedError` when exceeded
- **Opt-in**: No limits by default

### Budgets in This Demo

**Entry Points:**
| File | Budget | Purpose |
|------|--------|---------|
| `main.ail` | `IO @limit=50, AI @limit=10` | Limit AI API costs |
| `bigquery_demo.ail` | `IO @limit=100, FS @limit=30, Net @limit=20` | Control BigQuery API calls |
| `trusted_analytics_demo.ail` | `IO @limit=30, FS @limit=30, Net @limit=5` | Data trust contract |

**Services (per-call guarantees):**
| Function | Budget | What It Guarantees |
|----------|--------|-------------------|
| `getAccessToken()` | `FS @limit=10, Net @limit=1` | Read ADC + OAuth call |
| `getDefaultProject()` | `FS @limit=15` | Read config files |
| `query()` | `Net @limit=1` | Exactly 1 BigQuery API call |
| `queryWithAuth()` | `FS @limit=10, Net @limit=2` | Auth + 1 query |

**Note:** FS budgets need to be generous because stdlib FS operations (e.g., `fileExists`, `readFile`) may consume multiple FS effect units per call internally.

### Benefits for Ecommerce

1. **Cost Control**: Prevent runaway AI/API costs with hard limits
2. **Predictability**: Know exactly how many operations a function will perform
3. **Testing**: Verify functions don't exceed expected resource usage
4. **Safety**: Bounded failures instead of unbounded resource consumption

### Running Without Budgets (Debugging)

```bash
# Bypass budget enforcement for debugging
ailang run --entry main --caps IO,AI --no-budgets ecommerce/main.ail
```

**Warning**: Only use `--no-budgets` for debugging. Always enforce budgets in production.

## Inline Tests

AILANG supports inline tests directly in function signatures using the `tests` clause.

### Syntax

```ailang
pure func myFunc(arg: Type) -> ReturnType
  tests [
    (input1, expected1),
    (input2, expected2)
  ]
{
  -- function body
}
```

**Key rules:**
- Only works with `pure func` declarations
- Must use block-style `{ }`, not expression-style `= expr`
- Nullary functions use `()` as input: `((), expected)`
- Multi-arg functions use tuples: `((arg1, arg2), expected)`
- Works best with simple modules (few imports)

### Running Tests

```bash
ailang test ecommerce/services/ga4_queries.ail
```

### Example

```ailang
export pure func topEventsQuery(limit: int) -> string
  tests [
    (5, "SELECT event_name... LIMIT 5"),
    (10, "SELECT event_name... LIMIT 10")
  ]
{
  "SELECT event_name, COUNT(*) as event_count " ++
  "FROM " ++ ga4Table() ++ " " ++
  "LIMIT " ++ show(limit)
}
```

### Test Coverage in This Demo

| File | Tests | Status |
|------|-------|--------|
| `ga4_queries.ail` | 14 inline tests | All passing |

**Note:** Inline tests may fail on modules with complex imports due to a test harness limitation.

## BigQuery Implementation Details

The BigQuery connector uses pure AILANG with no Go dependencies:

### Authentication Flow

1. Read ADC file: `~/.config/gcloud/application_default_credentials.json`
2. Extract `client_id`, `client_secret`, `refresh_token`
3. POST to `https://oauth2.googleapis.com/token` to exchange refresh token
4. Use resulting access token for BigQuery API calls

### BigQuery API

- Endpoint: `POST https://bigquery.googleapis.com/bigquery/v2/projects/{projectId}/queries`
- Response format: Nested `rows[].f[].v` structure requiring extraction

### GA4 Queries Included

| Query | Description |
|-------|-------------|
| `topEventsQuery(n)` | Top N events by count |
| `topProductsByRevenueQuery(n)` | Top N products by revenue |
| `revenueByCategoryQuery()` | Revenue breakdown by category |
| `purchaseFunnelQuery()` | View -> Cart -> Purchase funnel |
| `deviceBreakdownQuery()` | Users by device type |
| `geoDistributionQuery(n)` | Top N countries by users |
| `sessionMetricsQuery()` | Session/user/engagement metrics |

## Resolved Issues (M-DX24 Audit, 2026-01-27)

| Issue | Status | Resolution |
|-------|--------|------------|
| Option Pattern Matching | **Fixed (v0.7.0)** | M-BUILTIN-SAFETY: safe type checks in builtins |
| Stdlib Version Warning | **Fixed (v0.6.1)** | M-DX21: show-once + `AILANG_NO_VERSION_WARNINGS=1` |
| If-Then-Else Blocks | **Always worked** | `parseBlockOrExpression()` handles blocks in branches |
| Record in Result Types | **Always worked** | ANF `normalizeToAtomic()` handles automatically |
| Reserved Keywords | **Mostly resolved** | Parser detects + suggests alternatives; docs exist |
| Import Transitivity | **Documented** | `docs/guides/module-imports.md` explains design choice |

## Bug Reports

Bugs are reported to AILANG core via:

```bash
ailang messages send user "Bug description" --title "Bug: Title" --from "demos-ecommerce"
```

## Contributing

When working on this demo:

1. Test all changes with `ailang run`
2. Run inline tests with `ailang test ecommerce/services/ga4_queries.ail`
3. Use `Some`/`None` pattern matching directly (fixed in v0.7.0)
4. Report new bugs via `ailang messages send`

## References

- [AILANG Documentation](https://ailang.sunholo.com/)
- [GitHub Issue #118](https://github.com/sunholo-data/ailang/issues/118) - Original demo requirements
- [GA4 BigQuery Dataset](https://console.cloud.google.com/marketplace/product/obfuscated-ga360-data/obfuscated-ga360-data) - Public demo data
