# Item interactions and preview validation — 2026-09-20

Toolchain: AILANG v0.40.2-6-ge12e0335d-dirty (e12e0335d), existing shared WASM.

## Inventory behaviour

The AILANG Entity record now includes `carrier`; old JSON defaults it to empty.
Player-created `introduced-*` objects support PickUp, Drop and Destroy. Fixed
habitat entities remain immovable. A Noul approaches a ground target before
handling it. Capacity is one; claims resolve deterministically in creature order.
Another Noul cannot steal, destroy or eat a held object. Drops preserve identity
and description, position the item beside the carrier, and allow pickup again.
Carried positions follow the Noul; death releases the item. Destruction removes
it, including artwork when the next AILANG frame reaches the browser.

Perception includes capacity, the held item, public peer inventories and available
map objects. Behaviour options exclude impossible inventory actions. At most two
additional target questions share the existing single bounded Jev call; target
probabilities use the banked roll rather than argmax. Urgent survival still takes
priority. No new effects: the existing Net/Env/Rand limits and package ceiling are
unchanged. There are no extra model calls for movement, pickup, drop or destruction.

Browser presentation adds carried artwork/placeholder, a carrying line and short
activity notices. Carried art follows the same interpolation as its Noul, with
image DOM identity preserved during ordinary movement. Late image responses for
removed items cannot recreate those items.

## Evidence

- Compile: `ailang check --package .` — 15 files passed.
- Native package suite: `ailang test --package .` — 71 passed, zero failed/skipped.
  The new inventory suite has 15 examples and two 100-case generated properties
  covering conservation/capacity and action codecs. An initial negative-integer
  expectation error in the conservation test was corrected before the passing run.
- Runtime contracts: `ailang run --verify-contracts --caps IO --entry main
  inventory_test.ail` passed. `stepWorld` checks preservation of valid inventory.
  The existing main selftest also passed all six checks with contracts enabled,
  including legacy bank replay and deterministic simulation.
- WASM: `node decisions/test-wasm.cjs` passed, including banked inventory action
  replay, pickup, following position, inventory perception, drop, re-pickup and
  destruction, plus existing regressions. No binary rebuild was needed.
- Browser: `test-inventory-browser.cjs` passed through the actual 8443 HTTPS
  preview: real AILANG lifecycle, image identity, interpolated attachment,
  inspector, notices, action labels and mobile overflow. The existing
  `test-browser.cjs` suite also passed. These use synthetic recorded judgments;
  they are not evidence of live model preference quality.
- Live inventory Jev call: **not run**. Automatic approval review rejected the
  proposed paid decision call because the earlier image-test approval did not
  cover it. No paid inventory request was sent.

## Placement and caching

Placement immediately marks the chosen spot, confirms it with a 1.4-second ping,
and shows the description for four seconds after success. Reduced motion uses a
stationary ring. A held-promise browser check verified feedback before completion,
success feedback, timed cleanup, reduced motion and the mobile layout.

The preview sends validators for the shared WASM runtime; unchanged requests
return body-free 304 responses and changes get a new ETag. Browser HTTP caching
alone did not retain the large binary in testing. The worker therefore stores one
canonical `/wasm/ailang.wasm` entry in `ailang-runtime-v1` Cache Storage and explicitly
revalidates it before reuse. Restrictions on storage fall back to downloading.
`node decisions/test-runtime-cache.cjs` passed: first request 200, second request
with saved ETag 304, then four creatures booted from cached bytes. The full Python
relay/cache suite passes 18 tests, including changed-runtime invalidation.

Standalone inline runs additionally reported zero failures but skipped 28 world
and two souls cases whose complex inputs could not be generated. These skips are
separate from the 71-pass, zero-skip native package suite above.

## Proof and package inventory limits

`ailang verify world.ail` verifies `ageNeeds`, but skips four functions including
`stepWorld`: the solver cannot encode the required list folds/polymorphic callees.
The inventory preservation contract is exercised at runtime, not fully proved.
`ailang pkg quality --strict .` still fails the existing demo's three publication
metadata gates (changelog, release kind, repository URL); missing AGENT/smoke and
empty public exports remain listed. This is an inventory report, not execution
or proof coverage. No package publication is part of this change.

The installed authoring guide is unavailable (`std/package-authoring` not found).
Used the installed prompt, core package skill/manifest reference, stdlib docs and
existing package documentation. See SOCIAL_VALIDATION.md for reproduced top-level
relative-import and named-property runner limitations; the tests follow the
existing explicit module imports and native ensures-based property convention.
