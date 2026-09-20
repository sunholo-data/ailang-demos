# Woodland artwork

All geometry and materials are authored in `build_assets.py`; no third-party
models or textures are used. Blender renders a moss clearing and four transparent
creature sprites, then `cwebp` compresses them to a combined 203 KB.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 8 --python decisions/art/build_assets.py
```

Requires Blender (built with 5.2.1) and `cwebp` on PATH. Regenerate all assets
together for consistent seeded geometry. `-- --sprites-only` skips the habitat.

The browser does not run Blender or a 3D engine. `render.ail` places the sprites
and draws interactable entities, names, shadows and selection markers. The UI
patches positions without replacing image nodes. The background vegetation is
scenery, not a navigational obstacle or an entity in the decision perception.

CLI SVG exports now require `site/assets/` copied as `assets/` next to the SVG,
or a host providing those relative paths. SVG fragments and descriptions still
escape untrusted text. No new capabilities, network calls or model costs are
introduced by the artwork.

## Animated version

Each creature now also has a `*-walk.webp` atlas: 16 directions across, neutral
pose followed by four walking poses down, with 128px cells. Regenerate these with
`-- --sprites-only`. Lighting stays fixed while the geometry rotates; paw poses
and body lift are rendered in Blender. `site/motion.js` interpolates display
positions and blends neighboring directions without changing simulation state.

The final ecosystem uses **bare ground**. The woodland render above is retained
as a design reference but is not used by the page: visible trees and paths are
now described, interactive AILANG entities, as requested by the user.


## AILANG palette update

The active sprites now use Sunholo orange, slate, muted slate and a pale slate
variant. Geometry, sixteen headings and five gait rows are unchanged. Regenerate
with `-- --sprites-only`. The bare ground and interactable SVG objects are drawn
in `render.ail` using the same palette; page styling consumes the official tokens
in `site/assets/brand/sunholo-tokens.css`. Montserrat/OFL and the unchanged official
AILANG SVG were copied from the September 2026 kit (revision aa420f4c1ebd).
