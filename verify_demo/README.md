# Static Contract Verification Demo

Showcases AILANG's `ailang verify` command — Z3-powered static proof that contracts hold for **all possible inputs**, not just test cases.

**43 contracts verified, 9 bugs caught, 0 skipped** across 4 modules.

## Quick Start

```bash
# Install Z3 (one-time)
brew install z3          # macOS
# apt install z3         # Linux

# Run the demo (runtime)
ailang run --entry main --caps IO verify_demo/main.ail

# Prove contracts statically (the main event)
ailang verify verify_demo/verify_showcase.ail
ailang verify verify_demo/billing.ail
ailang verify verify_demo/access_policy.ail
ailang verify verify_demo/scheduling.ail
```

## Modules

### 1. Arithmetic Contracts (`verify_showcase.ail`)

Basic contracts on pure integer functions — clamping, tax, safe subtraction, tier discounts.

| Result | Functions |
|--------|-----------|
| 8 VERIFIED | clampPrice, applyTax, safeSubtract, tierDiscount, validateAge, calculateIncomeTax, priceDifference, factorial (bounded recursion) |
| 3 VIOLATION | `brokenDiscount(0, 1) = -1` — discount exceeds price; `splitBill(1, 2)` — ceiling division overshoots; `clampPositive(0)` — zero is not positive |

### 2. Cloud Billing (`billing.ail`)

Full billing pipeline: usage metering → tier discount → regional tax → promo rebate. Demonstrates every verification feature.

**Features:**
- **Enum ADTs**: `CustomerTier × Region` = 16 tax combinations
- **Cross-function chains**: 4-deep (`finalBill → usageCost → unitPrice`, `→ applyTierDiscount → tierDiscountBps`, etc.)
- **Record contracts**: `BillSummary` field invariants (discount ≤ subtotal)
- **String verification**: Promo code format (`CLOUD-` prefix, ≥10 chars) via Z3 string theory
- **List verification**: Line item count (`addLineItem` increases by exactly 1) via Z3 sequence theory

| Result | Functions |
|--------|-----------|
| 12 VERIFIED | taxRate, computeTax, unitPrice, tierDiscountBps, applyTierDiscount, usageCost, isValidPromo, promoRebate, lineItemCount, addLineItem, netFromBill, finalBill |
| 2 VIOLATION | `brokenCreditApply(0, 1) = -1` — credits exceed bill total; `proratedRefund(1, 3, 1) = -2` — refund goes negative past warranty |

### 3. Access Control (`access_policy.ail`)

Role-based access control with 4 roles × 4 resources × 3 actions = 48 permission paths. Z3 proves security invariants that are impossible to verify by hand.

**Proven invariants:**
- **Admin supremacy**: Admins can always access everything (any resource, any action)
- **Guest isolation**: Guests can never write or delete (any resource)
- **Viewer restriction**: Viewers cannot write to sensitive resources
- **Role monotonicity**: Admin ≥ Editor ≥ Viewer (for all operations)

| Result | Functions |
|--------|-----------|
| 10 VERIFIED | roleWeight, actionThreshold, resourceSensitivity, isAllowed, adminAlwaysAllowed, guestCannotWrite, guestCannotDelete, viewerCannotWriteSensitive, adminOutranksEditor, editorOutranksViewer, auditRiskScore |
| 2 VIOLATION | `brokenEscalationCheck(EDITOR, READ)` — read bonus pushes level above role weight; `upgradeGain(GUEST, GUEST, SETTINGS) = -15` — sensitivity eats upgrade benefit |

### 4. Scheduling (`scheduling.ail`)

Conference room booking with capacity rules, priority queuing, and cost calculation. 3 rooms × 4 priorities × 4 time slots.

**Proven invariants:**
- **Priority ordering**: VIP > HIGH > STANDARD > LOW (for any time slot)
- **Capacity bounds**: Remaining capacity is always non-negative
- **Cost positivity**: Total booking cost is always non-negative
- **Fit check**: `fitsInRoom` matches exact capacity comparison

| Result | Functions |
|--------|-----------|
| 13 VERIFIED | roomCapacity, fitsInRoom, remainingCapacity, priorityWeight, slotDemand, bookingScore, vipOutranksHigh, highOutranksStandard, standardOutranksLow, baseRoomCost, capacitySurcharge, priorityPremium, totalBookingCost |
| 2 VIOLATION | `brokenDoubleBook(SMALL, 1, 3)` — off-by-one allows overbooking; `overtimeCost(0, 0) = -50` — flat fee waiver makes cost negative |

## Bounded Recursion Verification

The `--verify-recursive-depth` flag enables Z3 to verify recursive functions by unrolling them to a bounded depth:

```bash
# Default depth 2
ailang verify verify_demo/verify_showcase.ail

# Explicit depth 10 (verifies factorial for n in [0, 10])
ailang verify --verify-recursive-depth 10 verify_demo/verify_showcase.ail
```

The `factorial` function demonstrates this: with `requires { n >= 0, n <= 10 }` and depth 10, Z3 fully unrolls all recursion paths and proves `result >= 1` for every input in range.

## Verification States

| State | Meaning |
|-------|---------|
| **VERIFIED** | Z3 proved the contract holds for ALL valid inputs |
| **VIOLATION** | Z3 found concrete inputs that break the contract |
| **SKIPPED** | Function is outside the decidable fragment (HOF, etc.) |
| **ERROR** | Encoding or solver error |

## The Decidable Fragment

Z3 can verify pure functions that use:
- `int`, `bool`, `float`, `string`, list parameters and returns
- Arithmetic, comparison, logical operators
- `if`/`else`, `let`, `match` on enums/ADTs
- Record field access and construction
- String operations (`++`, length, startsWith, endsWith, find, substring)
- List operations (length, head, nth, cons, literals)
- Cross-function calls (callees inlined via `define-fun`)
- Recursive functions (via bounded unrolling with `--verify-recursive-depth`)

Functions must be: **pure** (`! {}`), **non-higher-order**.

## Runtime vs Static Verification

| | `--verify-contracts` | `ailang verify` |
|---|---|---|
| **When** | Runtime (during execution) | Compile-time (before running) |
| **Checks** | Actual inputs used | All possible inputs |
| **Requires** | Nothing extra | Z3 solver installed |
| **Speed** | Per-call overhead | One-time analysis |
| **Scope** | Any function | Decidable fragment only |

## JSON Output

```bash
ailang verify --json verify_demo/billing.ail
```

Returns structured results for CI integration — counterexamples include concrete values:

```json
{
  "function": "brokenCreditApply",
  "status": "counterexample",
  "model": [
    {"name": "subtotal", "sort": "Int", "value": "0"},
    {"name": "credits", "sort": "Int", "value": "1"}
  ]
}
```

## Files

| File | Contracts | Verified | Violations | Features |
|------|-----------|----------|------------|----------|
| `verify_showcase.ail` | 11 | 8 | 3 | Arithmetic, clamping, tier logic, bounded recursion |
| `billing.ail` | 14 | 12 | 2 | Enums, records, strings, lists, cross-function |
| `access_policy.ail` | 12 | 10 | 2 | Security invariants, relational properties |
| `scheduling.ail` | 15 | 13 | 2 | Capacity bounds, priority ordering |
| `main.ail` | — | — | — | Entry point, runtime showcase |
| **Total** | **52** | **43** | **9** | |
