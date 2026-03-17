# AILANG Code Stability Analysis

Generated: 2026-03-17

## Hypothesis

AILANG's static type system and contract verification produces code that, once working, requires fewer post-creation modifications (bug fixes, rework) compared to dynamically-typed JavaScript.

## Methodology

- Analyzed git history of `sunholo/demos` repo
- Excluded copied/generated files: `invoice_processor_wasm/ailang/`, `benchmarks/`, `streaming/bug_repros/`, `website_builder/output/`, `node_modules/`, `.venv/`
- Classified commits by message keywords (bugfix, feature, refactor, other)
- Flagged infrastructure files (server.js, firebase.js, etc.) separately

## Summary Table

| Metric | AILANG | HTML | JavaScript | Python | Vue |
|--------|---:|---:|---:|---:|---:|
| Files | 140 | 47 | 47 | 1 | 13 |
| Total commits | 212 | 207 | 171 | 1 | 182 |
| Commits/file (mean) | 1.5 | 4.4 | 3.6 | 1.0 | 14.0 |
| Single-touch files | 67% | 17% | 40% | 100% | 15% |
| Bug-fix commits | 9 | 13 | 23 | 0 | 50 |
| Bug-fix ratio | 4% | 6% | 13% | 0% | 27% |
| Mean active span (days) | 3 | 11 | 5 | 0 | 9 |
| Del/Add ratio | 0.08 | 0.35 | 0.59 | 0.00 | 0.22 |

## Key Findings

1. **Commits per file**: AILANG 1.5 vs JavaScript 3.6 (58% fewer for AILANG)
2. **Single-touch files**: AILANG 67% vs JavaScript 40% (files touched exactly once = written and never modified)
3. **Bug-fix ratio**: AILANG 4% vs JavaScript 13% of commits are bug fixes
4. **Active span**: AILANG files are actively edited for 3 days (mean) vs 5 days for JavaScript

5. **Infrastructure-adjusted JS**: Excluding 4 infrastructure files, JS demo-logic commits/file = 2.3 (vs AILANG 1.5)

## Caveats

- This repo is primarily authored by one developer with AI assistance — results may not generalize to teams
- AILANG is a newer language; some stability may reflect less feature iteration rather than fewer bugs
- JavaScript files include UI/infrastructure code that naturally churns more (e.g., server.js has auth, routing, API changes)
- Commit message classification is keyword-heuristic, not manual review
- Sample size is modest (~200 files, ~240 commits)
- Python has too few files in this repo for meaningful comparison

## Conclusion

**Supports hypothesis.** Across multiple metrics — commits per file, bug-fix ratio, single-touch rate, and active editing span — AILANG files show significantly lower churn than JavaScript. While confounders exist (JS infrastructure files, language maturity), the pattern holds even after adjusting for infrastructure. This is consistent with the claim that AILANG's static analysis catches errors at development time, reducing post-release fixes.

---
*Raw data: scripts/churn_analysis.csv*
