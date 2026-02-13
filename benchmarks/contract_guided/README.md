# Contract-Guided Code Generation Benchmark

Proves that Z3 contract verification feedback measurably improves LLM-generated AILANG code, building on the [ARC paper](https://arxiv.org/html/2511.09008v1) (Bayless et al., 2025) which showed iterative Z3 feedback improved LLM validity from 10.8% to 43.9%.

## Quick Start

```bash
# Validate all reference solutions verify correctly
for f in benchmarks/contract_guided/reference/*.ail; do
  echo "=== $(basename $f) ==="
  ailang verify --json "$f" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  {d[\"verified\"]} verified, {d[\"counterexample\"]} violations')
"
done

# Run experiment (requires API keys)
python tools/run_contract_experiment.py \
  --models claude-sonnet-4-5 \
  --conditions baseline,contract_guided,iterative \
  --samples 3

# Analyze results
python tools/analyze_contract_results.py eval_results/contract_experiment/latest/
```

## Methodology

### Research Question

Does providing formal contract specifications (`requires`/`ensures`) and Z3 verification feedback to LLMs improve the correctness of generated AILANG code?

### Experimental Conditions

| Condition | Prompt Contains | Z3 Feedback |
|-----------|----------------|-------------|
| **Baseline** | Task description only | None |
| **Contract-Guided** | Task + formal `requires`/`ensures` specs | None |
| **Iterative** | Task + contracts + Z3 counterexamples | Up to 3 rounds |
| **Full DevTools** | `ailang prompt` + `ailang devtools-prompt` + contracts + Z3 | Up to 3 rounds |

### Metrics (ARC-aligned)

| Metric | Definition |
|--------|-----------|
| **Pass@1** | First-attempt success (compiles + Z3 verified + correct output) |
| **Verify@1** | First-attempt Z3 verification pass rate |
| **Soundness** | P(stdout correct \| Z3 says VERIFIED) |
| **Iterative Gain** | Improvement per Z3 feedback round |
| **Bug Detection** | % of hard tasks where LLM avoids the known bug |

### ARC Paper Connection

The [ARC paper](https://arxiv.org/html/2511.09008v1) (AWS, 2025) combines LLMs with Z3 SMT verification for policy compliance checking. Key findings:

- **99.2% soundness** — when Z3 says valid, it's almost always correct
- **Iterative refinement** — LLM answers improved from 10.8% to 43.9% valid after 3 rounds of Z3 feedback
- **Redundant formalization** — multiple LLM translations cross-checked via Z3 semantic equivalence

AILANG has the same stack: `requires`/`ensures` contracts compiled to SMT-LIB v2 and verified by Z3 via `ailang verify`. This benchmark applies ARC's methodology to code generation rather than policy checking.

## Benchmark Tasks

### Easy (5) — Single function, arithmetic contracts

Functions with straightforward contracts that the LLM should get right on the first attempt.

| ID | Contract | Description |
|----|----------|-------------|
| `contract_clamp_price` | `result >= min, result <= max` | Clamp value to range |
| `contract_safe_subtract` | `result >= 0` | Floor-at-zero subtraction |
| `contract_abs_difference` | `result >= 0` | Absolute difference |
| `contract_apply_tax` | `result >= amount` | Tax in basis points |
| `contract_tier_discount` | `0 <= result <= 30` | Discount tier classification |

### Medium (5) — Cross-function chains

Multiple functions where callees must be implemented correctly for the caller's contract to verify.

| ID | Contract | Description |
|----|----------|-------------|
| `contract_billing_pipeline` | Chain: cost → discount, `result >= 0` | 2-function billing |
| `contract_permission_check` | `isAllowed(ADMIN, _, _) == true` | Role-based access |
| `contract_promo_validation` | `0 <= result <= amount` | String + numeric |
| `contract_capacity_check` | `result == (headcount <= capacity)` | Relational |
| `contract_booking_cost` | 3-deep chain, `result >= 0` | Multi-step cost |

### Hard (5) — Bug detection

The naive/obvious implementation violates the contract. Z3 finds the counterexample. The LLM must recognize the edge case.

| ID | Naive Bug | Z3 Counterexample |
|----|-----------|-------------------|
| `contract_credit_apply` | `subtotal - credits` goes negative | subtotal=0, credits=1 |
| `contract_split_bill` | Ceiling division overshoots | total=1, people=2 |
| `contract_escalation_check` | Read bonus exceeds role weight | EDITOR + READ |
| `contract_prorated_refund` | Post-warranty makes negative | daysUsed > warrantyDays |
| `contract_overtime_cost` | Flat fee waiver → negative | baseRate=0, hours=0 |

## YAML Format

```yaml
id: contract_credit_apply
description: "Apply customer credits — Z3 catches the overflow bug"
difficulty: hard
contract_spec: |
  export pure func applyCredits(subtotal: int, credits: int) -> int
    requires { subtotal >= 0, credits >= 0 }
    ensures { result >= 0 }
task_prompt: |
  Implement applyCredits(subtotal, credits) in AILANG.
  Credits reduce the bill but should never make it negative.
expected_stdout: |
  70
  0
  0
reference_solution: reference/credit_apply.ail
```

## File Structure

```
benchmarks/contract_guided/
  README.md                          # This file
  contract_clamp_price.yml           # Easy benchmarks
  contract_safe_subtract.yml
  contract_abs_difference.yml
  contract_apply_tax.yml
  contract_tier_discount.yml
  contract_billing_pipeline.yml      # Medium benchmarks
  contract_permission_check.yml
  contract_promo_validation.yml
  contract_capacity_check.yml
  contract_booking_cost.yml
  contract_credit_apply.yml          # Hard benchmarks
  contract_split_bill.yml
  contract_escalation_check.yml
  contract_prorated_refund.yml
  contract_overtime_cost.yml
  reference/                         # Gold-standard solutions
    clamp_price.ail
    safe_subtract.ail
    abs_difference.ail
    ...
tools/
  run_contract_experiment.py         # Experiment runner
  analyze_contract_results.py        # Results analyzer
```
