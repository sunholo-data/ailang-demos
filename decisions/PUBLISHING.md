# Public website readiness — 2026-09-20

## Git reconciliation

The earlier demo and branding work was committed as fc09d6e on
build/discord-protocol-demo, then merged into main as e05abea. Both commits
are on origin. Subsequent social/inventory/artwork/cache changes were local
working-tree changes on main; the integration branch preserves them together.

## Verified combined application

- AILANG package check: 15 files passed.
- Native package tests: 71 passed, zero failures/skips.
- Python relay/cache/image suite: 18 passed.
- Real WASM integration passed, including custom characters, social decisions,
  inventory lifecycle and legacy bank replay.
- Real Chrome desktop/mobile checks passed, including item composer, social
  inspector, custom creation, popups, image placement and reduced motion.
- See SOCIAL_VALIDATION.md and ITEM_VALIDATION.md for provider/proof limitations.

## Public release blockers

1. Existing Pages deployment failed at the Co-Presenter copy: source directory
   is co_presenter, while the workflow used co-presenter. The integration branch
   corrects this one source path; the public URL stays co-presenter.
   Failed run: https://github.com/sunholo-data/ailang-demos/actions/runs/35512313845
2. Pages currently neither watches decisions/** nor assembles its browser files,
   six AILANG modules and the sunholo/decisions package. No public demo/hub link
   should be advertised before these are included and smoke-tested.
3. .ailang-version pins CI to v0.35.2, whereas the demo declares >=0.40.0 and is
   validated with local v0.40.2 CLI and a separately rebuilt shared WASM. CI
   downloads its runtime anew; the committed WASM is not sufficient. Validate a
   compatible release for all demos before changing the shared pin.
4. decisions/ailang.toml depends on a sibling checkout. Supply a pinned registry
   dependency or explicit reproducible CI vendoring; this package is absent from
   the root manifest that current CI resolves.
5. Live endpoints api/session, api/decision, api/character and api/image are
   implemented by the private Studio Python/native-AILANG relay. GitHub Pages
   cannot execute this service. Public live play needs a deployed API plus its
   origin/routing configuration, or a tested browser transport. Do not expose the
   current private preview merely to make the static page appear functional.
   Budget/concurrency behavior and visitor-provided key handling must remain
   explicit. Update the UI copy referring to the private Studio when deployed.

Do not publish a static-only copy as the working live Jev demo. The private
Tailscale preview remains the current review surface. Website publication is
separate from package-registry publication; existing package release metadata
warnings do not by themselves block a website release.
