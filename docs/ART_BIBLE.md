# ART_BIBLE

## Style
Top-down oblique (3/4, Stardew-like) cozy pixel art. Chibi workers (big heads, 2px eyes), round animals. Everything is generated procedurally — single source of truth: `assets-src/generate_sprites.py`. Never edit exported PNGs.

## Scale & grid
- Logical grid: 16px tiles. Export scale: **3x nearest-neighbor** (48px on screen per tile).
- Room: 30x18 tiles (480x288 logical). Wall band: y=0..96 logical (wall_top y32..48, wall_face y48..96). Floor: y>=96.
- Characters: 16x24 logical. Cats: Pixel 16x12, Biscuit 24x16.
- Camera default zoom 1.0 on the 3x assets; pan/drag + zoom 0.6..1.8.

## Palette (core values, full set in manifest.json)
ink #1a1c2c · navy #23233d · plum #4f4a73 · violet #9b5de5 · teal #5ad0c8 · cyan #6bd0da · amber #f5c66b · wood #a5693f / #7c4b2c / #c98d5e · cream #f2e6d8 · carpet #4a466e · wall #3a3350 · night #10121f
Mood: late-night indie studio. Warm amber lamps + teal/cyan screen glow vs navy shadows. Saturated colors reserved for active events.

## Rules
- 1px ink outline on every non-tiling sprite (auto in generator).
- Characters front-facing at desks (cozy-game cheat), 4-frame walks (down/up/side; mirror side for left).
- Monitors show decorative role motifs (code/diagram/palette/tests/wave/terminal/board) — never real source text.
- Windows have day/evening/night variants; ambience tinting happens in engine, not extra art.
- All frames live in `public/assets/gen/*.png` + `atlas.json` (frame rects in exported 3x px) + `manifest.json` (palette, licenses).
- World placement comes from `public/assets/gen/layout.json` (also generator-owned).

## Animation FPS
Walks 7fps, idle blink 0.5fps toggle, typing 4fps, cat walk 8fps, Biscuit breathing ~1fps. Reduced-motion mode: freeze idle loops, keep status glyphs.
