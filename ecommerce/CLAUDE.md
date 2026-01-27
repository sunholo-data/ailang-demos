# CLAUDE.md - AILANG Ecommerce Demo

## Project Overview

This is an AILANG demo showcasing ecommerce patterns: AI API calls, data pipelines, and BigQuery integration. AILANG is a pure functional language with Hindley-Milner type inference and algebraic effects.

## Quick Commands

```bash
# Google Gemini via AI Studio (requires GOOGLE_API_KEY)
ailang run --entry main --caps IO,AI --ai gemini-2-5-flash ecommerce/main.ail

# Google Gemini via Vertex AI ADC (requires gcloud auth - ⚠️ location bug, see below)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI --ai gemini-2-5-flash ecommerce/main.ail

# Anthropic Claude Haiku (requires ANTHROPIC_API_KEY)
ailang run --entry main --caps IO,AI --ai claude-haiku-4-5 ecommerce/main.ail

# OpenAI GPT-5 Mini (requires OPENAI_API_KEY)
ailang run --entry main --caps IO,AI --ai gpt5-mini ecommerce/main.ail

# Stub - no API key needed, for testing
ailang run --entry main --caps IO,AI --ai-stub ecommerce/main.ail

# Local data pipeline demo
ailang run --entry main --caps IO,FS ecommerce/pipeline_runner.ail

# Trusted Analytics demo - budgets as data trust contracts
ailang run --entry main --caps IO,FS,Net ecommerce/trusted_analytics_demo.ail

# BigQuery GA4 demo (requires gcloud auth application-default login)
ailang run --entry main --caps IO,FS,Net ecommerce/bigquery_demo.ail

# Run inline tests
ailang test ecommerce/services/ga4_queries.ail
```

**AI providers:** `--ai gemini-2-5-flash` (recommended), `--ai claude-haiku-4-5`, `--ai gpt5-mini`, or `--ai-stub` for testing.

**Auth:** Each provider needs its API key env var (`GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Vertex AI ADC fallback exists but currently uses `locations/global` which doesn't host Gemini models (bug reported).

## Project Structure

```
ecommerce/
├── main.ail                    # AI demo entry point
├── pipeline_runner.ail         # Data pipeline demo
├── trusted_analytics_demo.ail  # Budget-as-contract for data trust
├── bigquery_demo.ail           # BigQuery GA4 demo
└── services/
    ├── recommendations.ail     # AI product recommendations
    ├── gcp_auth.ail           # OAuth2 ADC authentication
    ├── bigquery.ail           # BigQuery REST API client
    └── ga4_queries.ail        # Pre-built GA4 SQL queries
```

## AILANG Syntax Essentials

### Effects (Capabilities)
```ailang
func foo() -> string ! {IO, Net, FS} { ... }  -- Declares required effects
pure func bar() -> int = 42                    -- No effects allowed
```

### Capability Budgets
```ailang
-- Limit effect operations with @limit=N
func limited() -> () ! {IO @limit=10, Net @limit=5} { ... }

-- Per-invocation: each call gets fresh budget
-- Throws BudgetExhaustedError when exceeded
```

**Budget limits in this demo:**

*Entry points:*
| File | Budgets | Purpose |
|------|---------|---------|
| `main.ail` | `IO @limit=50, AI @limit=10` | Cap AI costs |
| `bigquery_demo.ail` | `IO @limit=100, FS @limit=30, Net @limit=20` | Limit API calls |
| `trusted_analytics_demo.ail` | `IO @limit=30, FS @limit=30, Net @limit=5` | Data trust contract |

*Services (per-call budgets):*
| Function | Budgets | Operations |
|----------|---------|------------|
| `gcp_auth.getAccessToken()` | `FS @limit=10, Net @limit=1` | Read ADC + OAuth |
| `gcp_auth.getDefaultProject()` | `FS @limit=15` | Read config files |
| `bigquery.query()` | `Net @limit=1` | 1 API call per query |
| `bigquery.queryWithAuth()` | `FS @limit=10, Net @limit=2` | Auth + query |

**Note:** FS budgets are higher than expected because internal stdlib operations (e.g., `fileExists`, `readFile`) may consume multiple FS effect units per call.

### Pattern Matching
```ailang
match list {
  [] => "empty",
  x :: rest => "has items"
}

match result {
  Ok(value) => value,
  Err(e) => "error: " ++ e
}
```

### Records
```ailang
type Product = { name: string, price: float }
let p: Product = { name: "Widget", price: 9.99 };
println(p.name)
```

### Inline Tests
```ailang
-- Tests are part of the function signature
pure func add(x: int, y: int) -> int
  tests [
    ((1, 2), 3),
    ((5, 7), 12)
  ]
{
  x + y
}

-- For nullary functions, use () as input
pure func getTable() -> string
  tests [
    ((), "my_table")
  ]
{
  "my_table"
}
```

**Key rules:**
- Only `pure func` can have inline tests
- Must use block-style `{ }`, not `= expr`
- Run with: `ailang test path/to/file.ail`

**Test coverage:** `ga4_queries.ail` has 14 inline tests (all passing)

## Bugs and Workarounds (updated per M-DX24 audit, 2026-01-27)

### Fixed in v0.7.0

**Option Pattern Matching** - FIXED (M-BUILTIN-SAFETY)
```ailang
-- This now works correctly:
match getString(json, "key") {
  Some(s) => s,
  None => "default"
}
```

**Record in Result Construction** - ALWAYS WORKED (ANF normalization)
```ailang
-- This works - no helper function needed:
Ok({ status: 200, body: "ok" })
```

**If-Then-Else Blocks** - ALWAYS WORKED (`parseBlockOrExpression()`)
```ailang
-- Multi-statement blocks in if branches work:
if condition then {
  let x = compute();
  doSomething(x)
} else {
  fallback()
}
```

**Stdlib Version Warning** - FIXED (M-DX21, v0.6.1)
- Warning now shows once per process
- Suppress entirely: `AILANG_NO_VERSION_WARNINGS=1`

### Still Relevant

**Reserved Words:** `exists`, `forall`, etc. are reserved. Parser gives helpful error with suggestions.
```ailang
-- Use alternative names:
let found = fileExists(path)   -- not "exists"
```

**Non-Transitive Imports:** Each module must import its own dependencies.
See `docs/guides/module-imports.md` for full explanation.
```ailang
-- If module A imports module B, and B uses std/fs,
-- module A must ALSO import std/fs
```

## When Editing This Code

1. **Always test with `ailang run`** after changes
2. **Use `Some`/`None` pattern matching** directly (fixed in v0.7.0)
3. **Check for reserved words** if you get parse errors on identifiers
4. **Declare all effects** in function signatures
5. **Add all needed imports** per module (non-transitive)
6. **Respect budget limits** or adjust @limit values if needed

## Debugging Budget Issues

```bash
# Run without budget enforcement (debugging only)
ailang run --entry main --caps IO,AI --no-budgets ecommerce/main.ail

# Run with debug effect to see operation counts
ailang run --entry main --caps IO,AI --debug ecommerce/main.ail
```

## Reporting Bugs

Use the AILANG message system:
```bash
ailang messages send user "Bug description" \
  --title "Bug: Short Title" \
  --from "demos-ecommerce"
```
