## Current session/inner-life UI — 2026-09-21

Session downloads now include world snapshots, bank, titles, artwork and story;
JSONL downloads remain evidence-only. Restore is a pure AILANG adapter with no tick
advance. The browser verifies recorded actions and validates file bounds before
loading, and requires explicit spending approval after import or exhaustion.
Remembered keys no longer auto-start spending on reload. The worker type-check
budget is now 20 seconds per module after an 8-second CI failure in world.

See `test-session.cjs`, `test-session-browser.cjs` and `test-wasm.cjs`. Browser tests
use synthetic provider responses and assert one request at a crossed budget,
lossless restore, no credentials in downloads, no request on import/reload, explicit
renewal, preserved bank, item popups and 390/320px layouts. Older sections below
are chronological records and may describe superseded UI/relay behavior.

## Full-window habitat (2026-09-20)

The habitat fills the viewport with a compact control dock. Creature inspection
and decision history use accessible modal panels (side panel on desktop, bottom
sheet on phones). Clicking or keyboard-selecting a Noul opens its inspector;
background judgments never open it. A native full-screen toggle is offered only
when the browser supports it. The square world remains undistorted, with the
whole habitat visible and placement coordinates preserved.

`test-fullscreen-browser.cjs` uses the static public artifact and real WASM with
provider requests blocked. It checks 1440×900, 390×844, 320×568 and 844×390 layouts,
visible controls, no document overflow, panel/keyboard navigation, precise item
placement and native full-screen entry/exit. Screenshots were inspected for desktop
and phone portrait/landscape. Native AILANG logic and transport are unchanged.

## Public browser release update (supersedes relay notes below)

The current UI uses `site/transport.js` to call OpenRouter directly with the
visitor's key. WASM host adapters prepare typed requests and parse/sample replies;
network waiting does not occupy the worker. No Studio API is needed. The public
artifact uses its own pinned v0.40.2 runtime and registry decisions@0.4.0 dependency.
See README.md and PUBLISHING.md for build commands, spending semantics and checks.

## Current update — AILANG branding and player-created Nouls (2026-09-20)

Preview build `ailang-11`. Official AILANG SVG, locally hosted Montserrat and
Sunholo tokens come from https://www.sunholo.com/assets.html (kit revision
aa420f4c1ebd). White/pale ground, slate and orange now cover the UI, interactable
objects and regenerated Blender sprites. Sources/licenses live in
`site/assets/brand/`. Desktop, phone, pointer and touch are checked in Chrome.

“Create a Noul” asks Jev six typed questions. Five Score distributions map via
expected values to act confidence (0.4–0.9), threat evidence (0.4–0.85), cadence
(6–20 ticks), speed and stamina (0.6–1.4×); highest-ranked Choice selects one of
four existing appearances. The player reviews traits before insertion (8 Nouls
maximum). Original description informs behavior questions. Supported physical
abilities are walking speed and endurance; flying/magic/combat are not simulated.
Creation uses the same session cost limit and exposes/downloads complete mapping
evidence. Perception banks the profile, so replay reconstructs the custom gates;
import restores missing custom creatures. Legacy bank rows still replay.

Relay now allows four independent simultaneous requests, one per session.
Per-session locks protect cost accounting; temporary slot contention retries
without pausing normal play. Laptop and phone have independent worlds and each
has the user-approved $0.10 session budget, not shared world state.

Validation: all 13 modules compile; 41 native package tests pass, including six
creation cases; real Go/WASM covers creation, bounds, escaping, perception,
custom replay and restoration; eight relay tests cover concurrency and billing.
Browser creation tests use an explicitly synthetic API response and actual WASM
insertion. No real paid character-mapping call has been performed by the agent.
The existing `_str_len` named-test extraction bug reproduced when invoking
`perceive` through the new test; the named policy case uses a bank-shaped snapshot,
while real WASM tests exercise the full perception path. Native character runtime and the 6/6 main selftest also pass with runtime
contracts enabled. No new static proof is claimed for float/profile mapping. Strict quality remains release-metadata work.

Earlier entries below are historical.

# Browser host validation — 2026-09-20

## Delivered

- `host.ail`: JSON/string boundary over the existing world, decision policy and
  bank. Simulation, sampling, policy, SVG and probability rendering run in AILANG.
- `site/`: Worker-hosted Go/WASM, habitat, selectable creatures, evidence inspector,
  cumulative sampling strip, replay inspector, description
  placement, bank import/download and a key-gated live connection, without reloading WASM when switching.
- `serve.py`: isolated loopback preview with an explicit public-file allowlist.
  `python3 decisions/serve.py --port 8942 --session-budget 0.10` from the repo root. Also included in
  the existing `scripts/serve.sh` assembly.
- The shared `wasm/ailang.wasm` was rebuilt from the local core checkout.

## Evidence

CLI: `AILANG v0.40.2-6-ge12e0335d-dirty`, commit e12e0335d.
WASM: rebuilt from local core HEAD `3011da868b02ff9de8b4bb30c77323c410c4ebf8`;
its build does not inherit the installed CLI's version stamp.

- Compile: `ailang check --package .` passes all 10 files.
- Native package tests: 9/9 bank tests and 6/6 movement tests pass. Native module tests must be run
  separately: this CLI accepts only the first path in a multi-path `ailang test`.
- Host tests: 4 example tests plus 100 generated contract cases pass.
- Proof: `ailang verify host.ail` proves `validCompletedCount`. Other host exports
  do not have static proof; JSON/float/higher-order paths are integration-tested.
- CLI runtime with contracts: existing selftest passes 6/6.
- Real WASM integration: `node decisions/test-wasm.cjs` from repo root loads all
  modules and checks the initial SVG, fixture action, distribution, divergence
  rejection, malformed-bank rejection, 30-tick seeded determinism twice, artifact
  insertion/escaping/bounds, perception, new-entity deliberation, tagged Env
  missing-key errors and the nonnegative counter validation. No model call is mocked as real.
- SVG artwork rendered locally to PNG and visually inspected.
- JavaScript syntax and serving-script shell syntax pass.
- Loopback and Tailscale HTTPS GET return 200. Browser automation cannot attach:
  no browser connector, and Chrome/Firefox native surfaces return cgWindowNotFound.
  Full automated browser layout/interaction validation remains unavailable; the
  user reviewed the page on the laptop and confirmed the live run below.
- Laptop review confirmed the page loads. A live browser call reproduced
  `E_NET_DNS_FAILED: lookup openrouter.ai on [::1]:53`. Core's `netProxyRoundTripper`
  resolves DNS itself and installs a custom `DialContext`, bypassing Go's browser
  fetch transport. This is not a key error. OpenRouter OPTIONS returned 204 with
  the required CORS permissions.
- The private preview now routes `/decisions/api/decision` to `live_server.ail`
  through the native AILANG CLI. Browser WASM keeps advancing the world while
  the server calls the same oracle. The key is sent over the private HTTPS origin,
  injected only in the child environment, never included in argv or files, and
  provider access is restricted to `openrouter.ai`. The form describes this route.
- Tailscale HTTPS → preview → AILANG → OpenRouter was tested with an intentionally
  invalid key and returned the expected `http 401`. The user then confirmed reaching 24 banked real decisions on the laptop. The UI halts visibly on live errors; automatic typed retry/backoff is not implemented
  because `oracle.deliberate` currently flattens errors to strings.

## Quality inventory

`ailang pkg quality --strict .` exits 2: missing release changelog, release kind,
repository metadata; AGENT.md and smoke entry are also absent. The application
manifest has no exported modules, so its inventory reports zero public contracts
and does NOT establish proof coverage. The direct proof/test results above are
separate evidence. No registry publication was attempted.

## Reproduced runtime friction

1. Top-level module `host` with `import ./world` fails on the installed CLI with
   `failed to load pkg/world: invalid package import path`. Bare `import world`
   succeeds, consistent with the existing application modules. Reproduce by
   changing that one import and running `cd decisions && ailang check host.ail`.
2. WASM automatically decodes JS integer-valued numbers as AILANG `int`, even
   when the receiving signature takes `float`. Passing `(12,18)` to a float
   placement boundary fails at runtime. Host coordinates now cross as strings
   and are parsed with `stringToFloat`. The integration check pins this case.
3. The package can exceed the WASM default 2-second type-check budget under load
   (observed 51,660 checker steps in `decideOrFallback`). The Worker sets an
   8-second per-module budget; failures stay visible. Load progress is displayed.
4. `AilangREPL` references `window`; Worker initialization uses the native Go
   loader and globals directly. Env handlers return `{_ctor:'Ok',_fields:[key]}`
   or tagged `Err(NotFound(...))`, not a bare string.

## Scope and semantics

Recorded mode verifies individual actions from saved decisions and rolls.
“Replay this decision” replays the evidence in the inspector and pauses the
habitat; it does not rewind world positions or claim historical world replay. Imported
banks are verified before replacing the displayed bank. The synthetic fixture is retained for tests but is not loaded by the UI. The
landing page connects to live Jev using the saved key or a Connect Jev action.

The inspector exposes the full answers, questions and perception. Distribution
segments follow `ranked` ordering, exactly as `sampleFrom` consumes them. Threat
and confidence overrides are explained independently from the hypothetical roll.
A single persistent browser Worker holds the world; it has Rand but never
receives the live key or Net capability. Connecting live, pausing and replaying inspector evidence do not reload it.
Live mode has one sequential request at a time and runs until paused or the
user-approved $0.10 session budget is reached; an asynchronous response applies to current positions without rewinding
the world, while seen-entity bookkeeping uses the original perception snapshot; Net, Env and Rand each have a per-call budget of one at the adapter.


## Private laptop preview

`https://voights-mac-studio.tail97eda0.ts.net:8443/decisions/` proxies to
`127.0.0.1:8942`. Both devices need Tailscale. The existing website on HTTPS 443
and its `/discord` and `/wasm` routes are preserved. Only this preview process
was restarted to add the CLI bridge. Static `scripts/serve.sh` hosting supports
exploration/replay; live mode requires `decisions/serve.py` until core's browser
Net transport is fixed.


## Continuous-session update (user feedback)

The user approved $0.10 per live session after the automatic approval reviewer
blocked uncapped operation. The relay defaults to live disabled and requires an
explicit `--session-budget`. It tracks billed `cost_usd` against an opaque
in-memory session, checks the budget before each request, halts on unknown cost,
and enforces a secondary 10,000-request limit. A completed call can cross the
budget threshold because its actual usage is known only after the response.
`python3 -m unittest discover -s decisions -p test_server.py` passes 5 relay tests:
budget rejection, origin rejection, request ceiling, call 25 / cost accumulation,
and missing-cost stop. Browser ledger shows the most recent 80 entries while
JSONL download retains all rows. Completed responses are banked even while paused.

The final landing page is live Jev only, with Connect Jev and Pause / Resume.
Saved keys reconnect automatically. No synthetic fixture or random exploration
appears by default. Recorded evidence is available only through the ledger/import.
WASM initializes once per page, rather than on each mode change (the original
three-mode navigation has been removed in response to user feedback).


## Movement correction after laptop review

The corner pile-up was reproduced in six regression probes: resting still
moved, clamped boundaries retained outward headings, fleeing never completed,
hesitation resumed an old flee intent, and missing approach targets persisted.
All six probes failed before the correction and pass afterwards via both native
named tests (`ailang test motion_test.ail`) and the executable probe with
`--verify-contracts`. The world now reflects blocked movement inward, releases
blocked intents, and makes the creature eligible for a new judgment. Fleeing
finishes beyond perception range; resting and hesitation stay stationary.
Movement is four times slower, and body/label margins keep creatures visible.

Runtime position/energy contracts and the existing six CLI selftests pass.
The real WASM harness additionally passes 120 ticks from a corner configuration,
checking bounds and continued movement, plus stationary rest with energy recovery.
The remaining WASM integration checks still pass. These are executed tests and
runtime contracts, not a static proof of floating-point movement. No new paid
provider call was made for this physics correction. Strict package quality still
reports the existing three publication metadata gates (changelog, release kind,
repository URL); this is a demo application, not a newly published package.

Preview assets carry `jev-motion-5`; AILANG modules are served with `no-store`.
Reload the page to replace an already running world's old module definitions.

## Organic woodland graphics pass

Blender 5.2.1 rendered authored moss, fern, stone and flower geometry and four
personality-specific soft creature sprites. WebP assets total approximately
203 KB. Rendering code and design direction live in `art/`; regenerate with
`art/build_assets.py`. CLI SVG consumers must also provide relative `assets/`
from `site/assets/` (the browser and static assembly do this automatically).
Permanent red rings and primitive circular bodies were replaced by sprites,
contact shadows and a selection-only marker. Object types now use shaded
mushrooms, berry clusters, stones, metal fragments and thorn-like silhouettes.

The artwork stays mounted between ticks: only dynamic SVG attributes/content
change. An isolated headless Chrome run at 1440px and 390px verified all five
assets return 200, no browser exceptions, no horizontal mobile overflow, creature
selection and portrait updates, and preservation of the exact sprite DOM node
across an actual AILANG coast tick. Desktop and mobile screenshots were inspected.
This supersedes the earlier browser-automation limitation: local Playwright can
launch the installed Chrome without a CUA browser connector. No user key or paid
model call was used by this check.

All ten AILANG files compile; three renderer escaping tests, six contract-enabled
CLI selftests, the full Go/WASM integration suite and five relay tests pass.
Existing static proof coverage and package publication metadata limitations are
unchanged. The Tailscale preview keeps its approved $0.10 session budget.

## Living ecosystem, turns, and player objects

The final scene has bare ground. The tree and path are individual described
entities, alongside the other objects; background woodland artwork is no longer
used. Every object exposes its exact description on hover, keyboard focus, or
tap. The same descriptions enter perception. Cosmetic `kind` and player pictures
are not sent to the model as semantic flags.

Creatures have hunger, thirst and bowel levels in their serialized AILANG state
and model perception. Batched questions include eating, drinking and toilet
behaviors plus separate distributions over described targets for each. These
sample model-ranked entity IDs, including arbitrary introduced IDs; no action
routes to a fixed food/water/toilet ID. Physical effects happen on arrival:
eating reduces hunger and consumes the chosen object, drinking reduces thirst,
and pooing reduces bowel urgency. This is simplified physiology, not a model
of nutrition or toxicity. Hesitation now lasts 18 ticks, then returns to
exploration; personality confidence thresholds and old bank policy stay intact.

Bubbles use seven nouns: food, water, toilet, danger, rest, explore, unsure.
They summarize an executed intent or bodily need; they do not claim to reveal
hidden model reasoning. The inspector explicitly labels them as need / intent.
The old synthetic fixture is still replayable and its generator keeps the v0
question set scoped to its original described objects.

Blender renders sixteen directions and four walking poses plus a neutral pose
per creature. Four 2048×640 atlases total approximately 409 KB. Browser animation
interpolates only AILANG-provided positions/headings, takes the shortest turn,
blends adjacent directional views, and advances the gait by distance traveled.
Rest stops the gait; reduced-motion mode shows the authoritative position and
neutral frame immediately. There is no second JS simulation.

Player pictures accept PNG/JPEG/WebP up to 4 MB, downsample to 384px, re-encode
as WebP and cap the encoded data URL at 180,000 characters. Eight pictures per
world bounds memory. Upload completions are generation-checked. Images stay in
browser memory and disappear on reset/reload; they are not included in banks or
model requests. The description (up to 160 characters) is the model input.

Validation: all 11 AILANG modules compile; native needs tests pass 11/11,
movement tests 6/6, renderer examples 7/7 plus two 100-case contract properties,
and contract-enabled CLI selftest 6/6. The needs runtime probe passes with
contracts. No new static proof of float physiology or rendering is claimed.
Strict quality still reports the same three publication metadata gates.

`test-browser.cjs` launches an isolated Chrome context with no key. It checks
intermediate travel position, gait/turn completion, sprite-node preservation,
object hover and touch descriptions, real uploaded-image placement through the
AILANG adapter, rejected SVG uploads, mobile horizontal overflow, and reduced
motion. Desktop and mobile screenshots were inspected. No new paid provider
call was made; model-answer tests use explicitly synthetic answers.

Language friction on the installed e12e0335d CLI: a named assertion directly
comparing `step(Toilet("player-object")).bowel == 0.0` failed with “expected float
arguments”, while the same expression passed in the normal runtime. Moving that
comparison into the pure `bowelRelieved()` helper makes the named test pass.

## Survival policy v2 and cursor popups

The idle/unsatisfied-needs diagnosis was: only four nearby target candidates,
fixed 80%/90% wary/paranoid gates, and new judgments interrupting need trips.
The whole map (up to 40 described entities) is now present in perception and
all target questions; immediate threat questions still use nearby objects.

At urgency 80%+, the behavior question narrows to relevant needs plus escape.
At lethal hunger/thirst levels, toilet use cannot displace survival choices.
The model still supplies behavior and target distributions and both are sampled.
The confidence gate interpolates from its personality baseline at 60% urgency
to 25% at 95%; immediate-threat detection also becomes less risk-averse. These
are explicit survival rules, not semantic object categories. New snapshots bank
`policyVersion: 2` and numeric `urgency`; replay and inspector thresholds derive
from that snapshot. Missing/legacy versions retain the original personality
gates. An urgent cautious 45%-confidence decision and its legacy hesitation both
verify in the real WASM bank path.

Chosen need trips suppress ordinary re-deliberation until arrival, target removal,
or a 360-tick timeout. Rest continues while tired unless another need becomes
urgent. Scheduling favors urgency with waiting-time credit; hesitation is six
ticks. Needs grow more slowly to allow travel and serial model calls.
Tiredness is the inverse of energy, preventing contradictory duplicate state.
Health falls during >=98% hunger/thirst, recovers after those needs are addressed,
and at zero records starvation/dehydration as the death cause. Death is terminal
until reset, freezes the creature and removes it from judgment scheduling;
late decisions cannot revive it. All-dead habitats stop with an explicit message.

Desktop descriptions now float beside the pointer and dismiss after leaving.
Touch and keyboard use a persistent readable popup. Browser regression checks
assert desktop anchoring and run an actual `hasTouch` mobile context, as well as
checking the death display and an empty judgment queue for dead creatures.

Validation: 12 modules compile; all 35 package-native tests pass (including nine
new survival cases); the contract-enabled survival runtime probe and six CLI
selftests pass. The real Go/WASM suite includes new/legacy bank gate replay.
Browser integration passes pointer, touch, death, movement, upload and responsive
checks. No new paid provider call was used; synthetic answers test policy and
execution, not the live model's quality. Float physiology/gates are runtime-tested,
not statically proven. Strict publication quality retains the existing three
metadata gates; no package is being published in this change.

### Live inspection and steady feed regression

`test-live-inspection.cjs` holds a simulation tick in flight and verifies pointer
and keyboard inspection plus character-tab switching without pausing. It then
applies another Noul's real-WASM judgment and checks that the open card retains
its selected creature. Empty, short and long feed entries must produce identical
feed, world and control geometry at desktop, 390px, 320px and landscape sizes.
