# The deliberating Nouls

A browser artificial-life demo of `sunholo/decisions`: typed Jev judgments,
sampled actions, banked distributions and deterministic offline replay.

**[Play the public demo](https://www.sunholo.com/ailang-demos/decisions/)** ·
[All AILANG demos](https://www.sunholo.com/ailang-demos/)

Bring your own OpenRouter key. No Tailscale or private Studio access is needed.

## Public browser architecture

The page is static. AILANG WASM builds the typed Jev request, validates the answer,
applies personality/urgency policy, samples actions, renders the world and replays
evidence. Browser `fetch` sends the prepared request **directly to OpenRouter**;
network waiting does not block the worker's world updates. No Sunholo API server
receives the visitor's key. The key is saved in browser localStorage under the
shared `openrouter-api-key` convention.

- Decisions and character interpretation: `https://openrouter.ai/api/alpha/decisions`
  using `typesafe/jev-1.13`.
- Optional item artwork: `https://openrouter.ai/api/v1/images` using
  `black-forest-labs/flux.2-klein-4b` (roughly $0.014 per image).
- `site/transport.js` carries bytes, tracks reported spending and limits requests.
  It contains no decision policy or simulation. `host.ail` provides the pure
  prepare/complete boundary using the package's `buildRequest` / `parseAnswers`.
- Each tab stops at $0.10 of reported session usage, with at most one request in
  flight, 10,000 calls and eight generated images. The last call can cross the
  dollar threshold. This client-side guard is not an OpenRouter account cap.
  Reset/reload creates a new session. Unknown usage/network outcomes stop further
  spending conservatively; provider errors are never automatically retried.
- Separate devices have separate worlds, keys and sessions. This is not shared
  multiplayer. Imported banks reproduce decisions, not historical world positions.

`serve.py` and `live_server.ail` retain the earlier private/native relay for CLI
integration tests. The public UI does not call it. That workaround was introduced
because core's native Net DNS/proxy path failed in WASM. Browser fetch now bypasses
that transport while retaining AILANG request schemas, parsing and policy.

## Build and run

The demo pins AILANG **v0.40.2** in `.ailang-version` and registry dependency
`sunholo/decisions@0.4.0`. It has its own runtime directory so other demos keep
their existing shared runtime version.

```sh
cd decisions
ailang lock
ailang check --package .
ailang test --package .
cd ..
scripts/build-decisions.sh /tmp/nouls-site/decisions
python3 -m http.server 8959 --directory /tmp/nouls-site
```

Open `/decisions/` on that server. `build-decisions.sh` verifies the pinned runtime
archive SHA-256, copies only browser assets/modules/package source and includes no
keys, Python relay or local paths. CI tests the exact artifact before Pages deployment.
The repo-wide `scripts/serve.sh` also assembles a local preview; `serve.py` serves
source changes without rebuilding, using the locally available shared runtime.

## Play and inspect

Connect your OpenRouter key to begin. Add described objects (160 characters),
optionally attach PNG/JPEG/WebP up to 4 MB, or ask FLUX to draw them. Uploaded images
stay in your browser; generation sends only the description to OpenRouter. Pictures
are reduced to small sprites and are not stored in decision banks. Hover or tap
objects to see the descriptions Jev sees.

Create a Noul with a name (32 characters) and personality/abilities (10–400
characters). One Jev call proposes confidence, threat sensitivity, decision
frequency, speed and stamina. Review the mapping before adding it (eight Nouls
maximum). Descriptions influence subsequent judgments; flying, magic, combat and
crafting do not create new mechanics. Mapping evidence is downloadable, and the
profile is banked for replay.

Nouls experience hunger, thirst, toilet needs, tiredness and health. Urgency can
lower caution and prioritize survival. They choose objects by description, not
predefined food/drink labels. They can form social preferences and approach or
avoid other Nouls. Player items can be picked up, dropped and destroyed, with
capacity one and no stealing from another creature. Starvation/dehydration can
kill a Noul; reset begins a new world. The bare backdrop contains no pretend
scenery: visible trees and paths are described entities.

## Validation

```sh
node --test decisions/test-transport.cjs
NOULS_WASM_DIR=/tmp/nouls-site/decisions/wasm node decisions/test-wasm.cjs
NOULS_PREVIEW_URL=http://localhost:8959/decisions/ node decisions/test-public-browser.cjs
NOULS_PREVIEW_URL=http://localhost:8959/decisions/ node decisions/test-browser.cjs
NOULS_PREVIEW_URL=http://localhost:8959/decisions/ node decisions/test-item-art.cjs
```

Browser model responses in these tests are explicitly synthetic. Set
`NOULS_CHECK_CORS=1` for a real browser CORS/auth check using a deliberately invalid
key; this cannot demonstrate paid model output quality. See `PUBLISHING.md`,
`BROWSER_VALIDATION.md`, `SOCIAL_VALIDATION.md` and `ITEM_VALIDATION.md` for evidence
and known language/proof limitations. Package publication metadata remains
separate from website deployment.

## Visual identity

Original AILANG SVG, Montserrat and Sunholo tokens come from
https://www.sunholo.com/assets.html, revision `aa420f4c1ebd`. Fonts and their SIL
Open Font License are in `site/assets/brand/`. Blender source is in `art/`;
creature sprites use slate and orange, sixteen headings and five gait frames.
