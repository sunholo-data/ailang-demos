# The Deliberating Nouls — an artificial-life showcase for sunholo/decisions

Small creatures ("Nouls") wander a world of **description-only things** —
"a humming red berry cluster", "a pile of small clean bones", "a dark burrow
breathing warm air". There is no `edible` flag anywhere: at decision points,
each creature sends what it sees, feels and remembers as a JSON state to a
System One decision model (`typesafe/jev-1.13` via OpenRouter, one batched
typed-question call per deliberation), and **samples its behavior from the
answer's probability distribution** — never argmax. Personality is data:
act thresholds, detection cut points, cadence and question flavor come from
per-creature tables, honoring the package's no-default-threshold rule. Every
deliberation is banked whole (state, questions, full Decision, roll, action)
and replays byte-for-byte offline.

Design: [DESIGN_SPEC.md](DESIGN_SPEC.md) · Plan: [SPRINT_PLAN.md](SPRINT_PLAN.md) ·
Next-session handover: [HANDOVER.md](HANDOVER.md)

## Run it (all offline, no key needed)

```bash
cd decisions

# Offline assertions (world round-trip, seeded determinism, banked replay,
# render probe) — the CI baseline:
ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail selftest

# Keyless simulation: 200 ticks, deterministic per seed, dumps world Json:
ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail simulate --ticks 200 --seed 7 --dump /tmp/world.json
ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail render --file /tmp/world.json > world.svg

# Recorded souls: write the synthetic fixture bank, then replay + verify:
ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail fixture --out bank/synthetic.jsonl
ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail replay --bank bank/synthetic.jsonl

# Native tests:
ailang test world.ail souls.ail render.ail bank_test.ail
```

## Live tier (needs a key, operator-run)

```bash
OPENROUTER_API_KEY=sk-or-... ailang run --caps IO,FS,Net,Env,Rand --entry main \
  main.ail record --ticks 24 --out bank/recorded.jsonl
ailang run --caps IO,FS,Net,Env,Rand --entry main main.ail replay --bank bank/recorded.jsonl
```

The bank at `~$0.00003/call` (list: $0.042/1M input tokens; percepts are
capped ~700 tokens) — 24 ticks of four deliberating creatures costs well
under a cent. `replay` verifies every banked action reproduces exactly and
exits non-zero on divergence. Decisions calls are `! {Net, Env}` and travel
outside the AI effect's budget accounting (visible in OpenRouter Broadcast).

**Data boundary:** the state — including creature vitals, memories and
entity descriptions — leaves the machine to TypeSafe via OpenRouter. Do not
record banks against states containing private text.

## Browser demo

Run `python3 decisions/serve.py --port 8942 --session-budget 0.10` from the repository root, then open
`http://127.0.0.1:8942/decisions/`. This isolated preview serves only the demo's
public assets. `scripts/serve.sh` also assembles the host at `/decisions/`.

The landing experience is **live Jev intuition**. The habitat loads once; a saved
OpenRouter key reconnects automatically, otherwise choose **Connect Jev**. There
are no mode tabs or synthetic decisions on landing. **Pause / Resume** controls
movement and new judgments. An in-flight judgment may complete after pausing.

Describe an unfamiliar object and click in the habitat to place it. Click a
creature to inspect its actual Jev distribution, personality threshold, sampled
roll and final action. The decision ledger fills only from live calls or a bank
you deliberately import. **Replay this decision** animates recorded evidence in
the inspector without reloading WASM or rewinding the habitat.

The key and perceptions pass through the private Studio preview server, which
runs the same AILANG oracle natively through OpenRouter to TypeSafe. The key is
held in memory for the child process, never written to a server file. Native
routing is needed because the present browser Net transport fails raw DNS.
The user confirmed a successful 24-decision live run before the arbitrary count
limit was removed. Sessions now continue until paused or the approved **$0.10**
cost budget is reached. Reported usage is visible beside the controls.

The synthetic fixture and seeded random simulator remain available to CLI/WASM
regression tests; neither is presented as Jev behaviour on the landing page.

The preview defaults to live disabled unless `--session-budget` is explicitly supplied.
Budget checks use reported usage after each completed call; the final call may cross
the threshold. A secondary 10,000-request ceiling covers missing/zero-cost usage.

Click a creature to inspect it; use the evidence disclosure for perception,
questions and full answers. The ledger separates recorded usage from free replay.

Browser integration regression: `node decisions/test-wasm.cjs` from repo root.
See [BROWSER_VALIDATION.md](BROWSER_VALIDATION.md) for evidence, limitations and
runtime compatibility notes. The WASM binary has been rebuilt for this host.

## Known issues

- **Named-test extraction bug** (reported to core, message
  `inbox_1789849816269_681807c4`): `ailang test` misbinds `std/list.length`
  to `_str_len` when a test file imports a sibling spanning std/list +
  std/string; `sortBy` chains fail under `ailang test` while the identical
  logic passes under `ailang run ... selftest`. Workaround shipped: named
  tests cover extraction-safe paths only; the pipeline asserts live in
  `selftest`.
- Rebuild `wasm/ailang.wasm` when the core checkout changes; the host requires
  the asynchronous call API and configurable type-check budget.
### Loading and preview caching

The demo uses the shared `/wasm/ailang.wasm`. The preview validates its ETag on
reload and returns a body-free 304 when unchanged. Because browsers can skip
ordinary HTTP caching for this large response, the worker also stores the binary
under its canonical URL in `ailang-runtime-v1` Cache Storage. Rebuilds replace that
entry after validation. Each visit still initialises the runtime and AILANG modules.
Cache/storage restrictions fall back to a normal download. Byte progress is shown
during the initial download; HTML, JavaScript and AILANG sources remain fresh.
`node decisions/test-runtime-cache.cjs` checks two real browser loads.

### Noul inventories

Nouls can choose **PickUp**, **Drop**, and **Destroy** through Jev. Player-added
items are movable; original habitat features remain fixed. A Noul can carry one
item, approaches ground targets before handling them, cannot steal/destroy/eat
another Noul's possession, and puts a dropped item beside itself. Death releases
held items. Destruction removes the item permanently. Target distributions and
the sampled actions remain banked and replayable; old snapshots default to empty
inventories. At most two extra target questions join the existing bounded call.

Carried pictures (or a placeholder until artwork arrives) follow the creature,
with an inventory line in the inspector and short pickup/drop/destruction notices.
User placement now has an immediate location ring and a confirmed ping, plus a
four-second description popup. Reduced-motion users get a stationary ring.

See `ITEM_VALIDATION.md` for native, WASM, browser, proof and live-service evidence.

### Living ecosystem and pictures

Hunger, thirst, and toilet urgency are part of the AILANG world and Jev's
perception. Jev ranks **described objects**, including player additions, as
possible targets; there are no food/drink/toilet category flags for player items.
Hover or tap an object to read its description. Bubbles show a bounded summary
of current need/intent, not hidden model reasoning.

**Add item** opens a compact composer (a bottom sheet on phones) and immediately
pauses the habitat. Describe an item or use a suggested idea, optionally attach
a picture, then choose a spot in the habitat or use **Place in centre**. Edit and
cancel keep the draft. Placement/cancel restores the previous running state;
an already-paused game stays paused. Mobile description text uses 16px to avoid
input zoom, and the habitat returns into view after closing the keyboard.

Optional pictures are browser-only artwork: PNG/JPEG/WebP up to 4 MB, eight per
world, resized to 384px. They are not sent to Jev or saved in decision banks and
are cleared by reset/reload. Jev judges the accompanying description.

With Jev connected, **Draw it for me** is enabled by default. Items appear
immediately and FLUX.2 Klein 4B draws their artwork in the background through
`api/image`; movement continues while new Jev calls yield to queued artwork.
An uploaded picture takes precedence, and the checkbox opts out of generation.
Only the description is sent to the image model. Pictures remain browser-only,
are resized/cropped to small sprites, and are not saved in banks. A uniform green
matte is removed from generated images only, to blend into the habitat.

Artwork uses `black-forest-labs/flux.2-klein-4b` on OpenRouter's dedicated Image API
(square PNG, one image per call; approximately **$0.014/image**). The presentation
transport is `item_art.py`; the AILANG world/policy still creates and judges items.
Artwork and judgments share the server's session budget and lock. Generation
requires at least the estimated image cost remaining; actual `usage.cost` is
recorded. Eight requests per session and per-item response caching avoid repeated
charges. Only local busy responses are retried. Unknown charges/timeouts exhaust
the remaining session budget conservatively. Errors leave the description-only
item usable; resetting invalidates pending browser artwork.

Image checks: `python3 -m unittest discover -s decisions -p test_server.py` and
`NOULS_PREVIEW_URL=http://127.0.0.1:8954/decisions/ node decisions/test-item-art.cjs`.
The browser check mocks the image endpoint and makes no paid calls. A live smoke
on 2026-09-20 generated a glowing stone in 6.2 seconds and reported **$0.014**;
that checks one prompt, not a quality or latency guarantee.

For browser integration, start `python3 decisions/serve.py --port 8943` without a
live budget, then run `node decisions/test-browser.cjs`. It uses isolated Chrome
and offline AILANG calls, never the user's key. See `art/README.md` for the Blender
walk/turn atlas pipeline and `BROWSER_VALIDATION.md` for evidence and limitations.

### Urgency, tiredness and survival

Creatures can see descriptions across the whole map. Severe needs narrow the
behavior choices and reduce the confidence required to act; Jev still ranks and
samples described targets. A chosen need trip continues until arrival. Tiredness
rises as energy falls and sleep restores it. Prolonged starvation/dehydration
reduce health; zero health is a terminal death state until Reset.

New banks record survival policy version 2 and urgency, so their adaptive gates
replay exactly. Older banks keep their original confidence rules. Full-map
questions use more tokens than the original nearest-four demo; the approved
$0.10 session budget continues to bound the live session.


## Create a Noul

Connect Jev, then choose **Create a Noul**. Supply a name (32 characters) and
personality/abilities (10–400 characters). One typed Jev call proposes bounded
confidence, threat sensitivity, decision cadence, walking speed and stamina.
Review these before adding the creature. The habitat supports eight Nouls;
reset starts over. All creatures use the existing action vocabulary; descriptions
do not add flight, magic, combat or new mechanics. The description remains part
of future decision questions, and the profile is banked for reproducible replay.
The interpretation and distributions can be downloaded from the creation dialog.
Creation calls count against the same $0.10 live session as creature judgments.

Laptop and mobile can run independently: four simultaneous server judgments,
with one in flight per session and separate budgets. Worlds are local to each
browser; this is not synchronized multiplayer.

## AILANG visual identity

Official assets and tokens: https://www.sunholo.com/assets.html, revision
`aa420f4c1ebd`. The original AILANG logo is retained unchanged; Montserrat fonts
and their SIL Open Font License are bundled in `site/assets/brand/`. UI and game
art use paper/pale ground, slate and Sunholo orange. Blender source is in `art/`.

### Company and personal space

Nouls now perceive other living creatures: names, descriptions, observable actions,
direction and distance. They do not receive another creature's private needs or
memories. Each personality has distinct social likes and dislikes; a custom Noul's
written description refines its preferences.

Two typed questions join the existing single Jev request: `companion` (including
own company) and `avoid_companion` (including nobody). Jev evaluates the options;
the banked roll samples a target. Preferences can be one-sided and change with
encounters. `Socialize(id)` follows a moving companion and stops within three world
units; an encounter increases comfort and enters recent memory. `Avoid(id)` moves
away until ten units apart. Dead/missing targets are abandoned; social trips are
bounded to 60/30 ticks between reconsiderations, and urgent needs take priority.
No messages, conversation or shared minds are simulated.

The inspector shows the social preferences, current social target or recent memory,
and the recorded company/avoidance distributions. Name tags sit above the creatures;
need bubbles sit below, moving above the name near the bottom edge. Old decisions
without social answers retain their previous replay behaviour. New snapshots add
`socialPolicyVersion: 1`; physiology remains policy version 2.

Validation: `ailang test social_test.ail` and
`ailang run --verify-contracts --caps IO --entry main social_test.ail` from this folder;
`node decisions/test-wasm.cjs` and `node decisions/test-browser.cjs` from the repo root.
Browser tests use synthetic decisions and an isolated browser without a real key.
The same approved per-session budget and one-request effect limits remain in place;
more perception text and two extra questions can increase cost per judgment.
