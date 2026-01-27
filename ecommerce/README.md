# AILANG Ecommerce Demo

A vertical demo showcasing [AILANG](https://ailang.sunholo.com/) for ecommerce applications. Four working demos cover AI integration, data pipelines, capability budgets, and BigQuery analytics.

## Quick Start

### Install AILANG

**Claude Code:**
```
/plugin marketplace add sunholo-data/ailang_bootstrap
/plugin install ailang
```

**Gemini CLI:**
```
gemini extensions install https://github.com/sunholo-data/ailang_bootstrap.git
```

See [ailang.sunholo.com](https://ailang.sunholo.com/) for full installation docs.

### Run the Demos

```bash
# Run the simplest demo (no API keys needed)
ailang run --entry main --caps IO,FS ecommerce/pipeline_runner.ail

# Run AI demo with stub (no API keys needed)
ailang run --entry main --caps IO,AI --ai-stub ecommerce/main.ail

# Run inline tests
ailang test ecommerce/services/ga4_queries.ail
```

## Demos

### 1. AI Product Recommendations

Uses AILANG's `std/ai` effect to call AI models for product recommendations and descriptions. Demonstrates the AI effect system, JSON handling, and modular service design.

**Run:**
```bash
# With any AI provider:
ailang run --entry main --caps IO,AI --ai claude-haiku-4-5 ecommerce/main.ail
ailang run --entry main --caps IO,AI --ai gpt5-mini ecommerce/main.ail
ailang run --entry main --caps IO,AI --ai gemini-2-5-flash ecommerce/main.ail

# With stub (no API key needed):
ailang run --entry main --caps IO,AI --ai-stub ecommerce/main.ail
```

**Expected output** (with real AI provider):
```
=== AILANG Ecommerce Demo ===

1. Getting AI product recommendations...
Recommendations: {
  "recommendations": [
    "Active Noise Cancelling Over-Ear Headphones with Premium Sound",
    "Wireless Earbuds with Advanced Noise Isolation and Hi-Fi Audio",
    "Professional Studio Headphones with Bluetooth and Noise Cancellation"
  ]
}

2. Generating product description...
Description: Experience effortless miles in our Ultra-Comfort Running Shoes.
Engineered with premium breathable mesh, advanced gel cushioning, and
specially designed arch support. Lightweight construction means less
effort, more endurance.

3. Sample product data:
  - Laptop Pro: $1299.99
  - Wireless Mouse: $49.99
  - USB-C Hub: $79.99

=== Demo Complete ===
```

**AILANG features shown:** `std/ai` effect, `AI` capability, pattern matching, records, modular imports

---

### 2. Data Pipeline

Pure functional data pipeline that reads JSON sales data, aggregates by product, and writes results. No external APIs needed.

**Run:**
```bash
ailang run --entry main --caps IO,FS ecommerce/pipeline_runner.ail
```

**Expected output:**
```
=== AILANG Data Pipeline Demo ===

Loading sales data from: ecommerce/data/sample_sales.json
Raw data loaded successfully

Parsed 8 sales records
Aggregated into 4 product summaries

=== Aggregated Results ===
  MOUSE-001: qty=35, revenue=$1749.65
  HEADPHONES-001: qty=8, revenue=$1599.92
  LAPTOP-001: qty=10, revenue=$12999.9
  HUB-001: qty=15, revenue=$1199.85

Results written to: ecommerce/data/aggregated_output.json
```

**AILANG features shown:** `FS` effect, JSON decode/encode, recursive list processing, pattern matching on `[]`/`x :: rest`, record types

---

### 3. Trusted Analytics Pipeline

Demonstrates **capability budgets as contracts for data trust**. The budget guarantees exactly how many API calls the pipeline will make -- any deviation is a bug that the budget catches immediately.

**Run:**
```bash
# Requires: gcloud auth application-default login
ailang run --entry main --caps IO,FS,Net ecommerce/trusted_analytics_demo.ail
```

**Expected output:**
```
=== Trusted Analytics Pipeline ===

Budget Contract: Net @limit=5 (1 auth + 3 queries + 1 buffer)
This pipeline GUARANTEES no more than 5 API calls.

Project: <your-gcp-project>
Auth: OK (1/5 API calls used)

--- Query 1/3: Session Metrics ---
  Rows: 1
  Complete: true
--- Query 2/3: Purchase Funnel ---
  Rows: 1
  Complete: true
--- Query 3/3: Revenue by Category ---
  Rows: 21
  Complete: true

Pipeline complete: 4/5 API calls used
Budget remaining: 1 call (safety buffer)

DATA TRUST: You can verify this pipeline ran exactly as specified.
```

The key output is the **budget accounting** — exactly 4/5 API calls used (1 auth + 3 queries), with 1 remaining as safety buffer. The budget contract catches any deviation immediately via `BudgetExhaustedError`.

**AILANG features shown:** Capability budgets (`@limit=N`), `Net` effect, OAuth2 ADC auth, `Result` error handling, budget-as-contract pattern

---

### 4. BigQuery GA4 Analytics

Full BigQuery integration querying the public GA4 ecommerce dataset. Authenticates via Application Default Credentials, executes 7 analytics queries, and displays results.

**Run:**
```bash
# Requires: gcloud auth application-default login
ailang run --entry main --caps IO,FS,Net ecommerce/bigquery_demo.ail
```

**Expected output** (truncated):
```
=== AILANG BigQuery GA4 Ecommerce Demo ===

Detecting GCP project from gcloud config...
Using project: ailang-dev

Authenticating with Google Cloud ADC...
Authentication successful!

=== EVENT ANALYTICS ===

1. Top 10 Events by Count:
  [0] page_view | 1350428
  [1] user_engagement | 1058721
  [2] scroll | 493072
  [3] view_item | 386068
  [4] session_start | 354970
  ...

=== PRODUCT ANALYTICS ===

2. Top 10 Products by Revenue:
  [0] Google Zip Hoodie F/C | 13788.0 | 273
  [1] Google Crewneck Sweatshirt Navy | 10714.0 | 236
  [2] Google Men's Tech Fleece Grey | 9965.0 | 134
  ...

3. Revenue by Category:
  [0] Apparel | 171727.0 | 372
  [1] New | 25813.0 | 44
  [2] Bags | 23860.0 | 23
  ...

4. Purchase Funnel:
  [0] 386068 | 58543 | 38757 | 5692
       views    carts   checkouts purchases

=== USER ANALYTICS ===

5. Device Breakdown:
  [0] desktop | 158917 | 2498330
  [1] mobile | 109195 | 1704069
  [2] tablet | 6250 | 93185

6. Top 10 Countries by Users:
  [0] United States | 118493
  [1] India | 25367
  [2] Canada | 20268
  ...

7. Session Metrics Summary:
  [0] 270154 | 4295584 | 354970 | 5692
       users    events    sessions  purchases

=== Demo Complete ===
```

**AILANG features shown:** HTTP REST API (`std/net`), OAuth2 token exchange, JSON parsing, `Result`/`Option` pattern matching, pure functional BigQuery client

---

### Inline Tests

```bash
ailang test ecommerce/services/ga4_queries.ail
```

**Expected output:**
```
Test Results

  ✓ ga4Table_test_1
  ✓ topEventsQuery_test_1
  ✓ topEventsQuery_test_2
  ✓ eventCountsByDateQuery_test_1
  ✓ eventTrendQuery_test_1
  ✓ topProductsByRevenueQuery_test_1
  ✓ revenueByCategoryQuery_test_1
  ✓ purchaseFunnelQuery_test_1
  ✓ topCategoriesByViewsQuery_test_1
  ✓ deviceBreakdownQuery_test_1
  ✓ geoDistributionQuery_test_1
  ✓ browserBreakdownQuery_test_1
  ✓ sessionMetricsQuery_test_1
  ✓ dailySummaryQuery_test_1

✓ All tests passed!
14 tests: 14 passed, 0 failed, 0 skipped
```

---

## AI Provider Authentication

| Provider | Flag | Auth |
|----------|------|------|
| Google (AI Studio) | `--ai gemini-2-5-flash` | `GOOGLE_API_KEY` env var |
| Google (Vertex AI) | `--ai gemini-2-5-flash` | ADC fallback when key unset |
| Anthropic | `--ai claude-haiku-4-5` | `ANTHROPIC_API_KEY` env var |
| OpenAI | `--ai gpt5-mini` | `OPENAI_API_KEY` env var |
| Stub (testing) | `--ai-stub` | No key needed |

> **Note:** Vertex AI ADC fallback currently defaults to `locations/global` which may not host all Gemini models. Use `GOOGLE_API_KEY` for AI Studio, or ensure your project has Vertex AI enabled in `us-central1`.

## Project Structure

```
ecommerce/
├── main.ail                     # Demo 1: AI recommendations
├── pipeline_runner.ail          # Demo 2: Data pipeline
├── trusted_analytics_demo.ail   # Demo 3: Budget-as-contract
├── bigquery_demo.ail            # Demo 4: BigQuery GA4
├── data/
│   ├── products.ail             # Product type definitions
│   └── sample_sales.json        # Sample sales data
├── api/
│   └── handlers.ail             # API handler patterns
└── services/
    ├── recommendations.ail      # AI product recommendations
    ├── gcp_auth.ail             # GCP OAuth2 ADC authentication
    ├── bigquery.ail             # BigQuery REST API client
    ├── pipeline.ail             # Data pipeline transforms
    └── ga4_queries.ail          # Pre-built GA4 SQL queries (14 inline tests)
```

## Capability Budgets

All entry points and services use AILANG's capability budget system (`@limit=N`) to enforce hard limits on side effects:

```ailang
-- This function can perform at most 50 IO ops and 10 AI calls
export func main() -> () ! {IO @limit=50, AI @limit=10} { ... }
```

**Entry Points:**

| File | Budget | Purpose |
|------|--------|---------|
| `main.ail` | `IO @limit=50, AI @limit=10` | Cap AI API costs |
| `pipeline_runner.ail` | `IO @limit=50, FS @limit=20` | Limit file operations |
| `trusted_analytics_demo.ail` | `IO @limit=30, FS @limit=30, Net @limit=5` | Data trust contract |
| `bigquery_demo.ail` | `IO @limit=100, FS @limit=30, Net @limit=20` | Control BigQuery calls |

**Services (per-call guarantees):**

| Function | Budget | Guarantee |
|----------|--------|-----------|
| `getAccessToken()` | `FS @limit=10, Net @limit=1` | Read ADC + 1 OAuth call |
| `getDefaultProject()` | `FS @limit=15` | Read gcloud config files |
| `query()` | `Net @limit=1` | Exactly 1 BigQuery API call |
| `queryWithAuth()` | `FS @limit=10, Net @limit=2` | Auth + 1 query |

> **Note:** FS budgets are set generously because stdlib FS operations may consume multiple effect units internally per call.

## Inline Tests

AILANG supports inline tests in function signatures:

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

**Rules:** `pure func` only, block-style `{ }`, `((), expected)` for nullary functions.

**Coverage:** `ga4_queries.ail` has 14 inline tests (all passing).

## BigQuery Implementation

The BigQuery connector is implemented in pure AILANG with no Go dependencies:

1. Read ADC file (`~/.config/gcloud/application_default_credentials.json`)
2. Exchange refresh token for access token via OAuth2
3. Query BigQuery REST API with Bearer token
4. Parse nested `rows[].f[].v` response format

**GA4 queries included:** Top events, product revenue, category revenue, purchase funnel, device breakdown, geo distribution, session metrics.

## Debugging

```bash
# Run without budget enforcement
ailang run --entry main --caps IO,AI --no-budgets ecommerce/main.ail

# Run with debug output
ailang run --entry main --caps IO,AI --debug ecommerce/main.ail
```

## References

- [AILANG Documentation](https://ailang.sunholo.com/)
- [GitHub Issue #118](https://github.com/sunholo-data/ailang/issues/118) - Original demo requirements
- [GA4 BigQuery Dataset](https://console.cloud.google.com/marketplace/product/obfuscated-ga360-data/obfuscated-ga360-data) - Public demo data
