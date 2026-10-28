# DEFERRED DIRECTIVE — AgentHQ: The Living Diorama (visual redesign)

Status: **DEFERRED by user decision** ("do the art one later") on 2026-10-28. Do NOT start this until the current pipeline (specs 03–05) is verified and the user green-lights the pivot. This file preserves the full directive so a later session can execute it without chat history.

Source: verbatim user directive received 2026-10-28. Summary below is faithful; execute from it.

## Project status: major artistic pivot

Abandon the low-resolution pixel-art aesthetic in favor of a sophisticated, illustrated, animated 2.5D miniature office — a beautifully illustrated interactive dollhouse with expressive characters, atmospheric lighting, intricate furnishings, environmental animations, and genuine real-time AI agent monitoring. Not a mockup: evolve the existing app. Preserve infrastructure, logic, events, integrations, tests. Do not restart the project.

## 1. New visual identity

- Storybook illustration brought to life; three-quarter dollhouse perspective into a miniature office; every object has character (lamp light pools, monitor reflections, natural clutter, swaying plants).
- Influences: illustrated indie games, miniature dioramas, cozy animated films, hand-painted animation backgrounds, dollhouses, layered 2D games. References for quality, never copies of copyrighted art.
- Use: high-resolution illustrated assets, smooth controlled outlines, soft painterly shading, sophisticated palettes, subtle ambient occlusion, layered depth, warm localized lighting, expressive silhouettes, natural timing, intricate-but-readable detail.
- Avoid: pixelated graphics, low-res sprite sheets, procedural rectangles, recolored clone characters, flat furniture, excessive outlines, emoji-like characters, dashboard aesthetics, inconsistent AI-generated assets, blurry upscales.

## 2. Office as interactive diorama

Three-quarter elevated camera (not strict isometric pixel art). Zones: 7 workstations with individual personality (Hermes manager central; implementation dual monitors + mechanical keyboard + mugs; frontend art supplies + tablet; security organized/technical), meeting area, lounge, kitchenette/coffee, server area, atmospheric windows. Architecture: wooden floors, carpets, wall textures, curtains, wall art, varied plants, bookshelves, desk accessories, wastebaskets, cables, lighting fixtures, personal belongings, subtle imperfections. No uniform empty surfaces.

## 3. Character redesign (all 7, completely new)

Not upscaled sprites. Distinct identities, charming stylized proportions, readable expressions, distinct hair/outfits/silhouettes/palettes, one illustrated universe. Personalities: Hermes (confident, slightly eccentric manager), Architect (calm intellectual), Implementation (energetic, quick typing, enthusiastic), Frontend (creative, expressive), Tester (careful, analytical), Debugger (curious, puzzled→breakthrough), Security (composed, attentive). Presentation-only; never modify the actual AI agents.

## 4. Smooth animation

Not disconnected frame-swaps: layered 2D rigs / hierarchical animation, interpolation, separate limbs, independent eye/head motion, hand-authored curves. Behaviors: breathing, blinking, looking around, sitting, standing, walking, typing, thinking, stretching, coffee, reading, gestures, reacting to coworkers, receiving tasks, celebrating. Smooth eased transitions; no robotic loops. No expensive unjustified dependencies.

## 5. Cats as major characters

Pixel (tuxedo): small, energetic, beautiful coat, expressive eyes, animated tail, smooth walk/run, playful jumps, stretch, groom, pounce, sit, sleep, investigate; leaps on desks, knocks over harmless decor, interrupts employees — purely cosmetic. Biscuit: enormous, exceptionally round, very sleepy; prominent belly, slow breathing, lazy blinks, ear twitches, long naps, slow stretch, heavy deliberate walk; occupies chairs and keyboards. Visibly larger/heavier; physically different movement; instantly distinguishable without UI.

## 6. Atmospheric environmental effects

Coffee steam, swaying plants, changing monitor graphics, lamp glow, dust motes in sunlight, spinning fans, curtain movement, posture adjustments, blinking indicators, subtle reflections. Peaceful, not distracting. Day/evening/night lighting (day: bright natural; evening: warm long shadows + lamps; night: lamp pools + blue/cyan monitor accents + city lights in windows — especially cozy). Performance-conscious lighting.

## 7. Asset production pipeline

Procedural sprite generation is no longer suitable for final production.
1. Audit local art tools (ComfyUI, local models, image/vector/animation tools) — verify, don't assume.
2. Style guide: proportions, furniture perspective, line weight, palette, lighting direction, shadow softness, materials, asset resolution, animation conventions, export formats.
3. Concept art: one polished office-corner illustration sets the quality bar.
4. Convert to layered game assets: transparent foreground, background layers, furniture illustrations, character animation components, environmental overlays, lighting effects, accessories. Correct behind/in-front sorting; not a single flattened image.
5. Integrate into existing renderer: keep Phaser (scene, layers, animated characters, camera, effects, interactivity, lighting presentation) + React (interface, inspection panels). Don't rebuild working architecture unnecessarily.

## 8. Workstation interactions

Click computer → highlight → smooth camera move → background dims → beautiful workstation UI → real agent activity, live updates → close returns camera smoothly. Polished, readable, useful. Always distinguish live / disconnected / unavailable / demo / replay. Never fabricate work.

## 9. FIX THE STARTUP PROBLEM (do this part FIRST, before the art pivot)

Indefinite loading must be resolved: app must initialize without Hermes/OpenCode connectivity; missing integrations show accurate disconnected states; diagnostics for failed backend requests, failed WebSocket, missing assets, renderer init failures, unavailable integrations, JS errors. Never hide runtime errors behind infinite loading.

## 10. Protect existing functionality

Preserve structure, git history, React app, backend, telemetry, agent identities, WebSocket, persistence, tests, inspection UI, Hermes/OpenCode configs. Git checkpoint before significant changes. No changes to AI inference infrastructure, no paid APIs, stay local-first.

## 11. Visual vertical slice FIRST

One exceptional office corner before mass production: 1 illustrated workstation, 1 redesigned employee, 1 detailed animated cat, floor/wall section, decorations, atmospheric lighting, multiple animation states, camera movement, working workstation interaction, functional disconnected state — rendered inside the real app, not a concept image. Screenshot at app resolution; assess cohesion, readability, detail, perspective, animation, lighting, composition, performance, polish. If it still looks like a developer prototype, improve the pipeline before scaling.

## 12. Performance

Optimized atlases, layered assets, compression, limited particles, bounded animation work, minimal redraws, paused/reduced rendering when hidden, adjustable effects, reduced-motion respect. 60 FPS target on the workstation, measured not assumed. No continuous AI inference for ambience — deterministic lightweight systems.

## 13. Completion criteria

Slice runs in-app; assets no longer look like pixel-art placeholders; character + cat animated; lighting/environmental effects work; camera works; workstation interaction works; startup independent of AI connectivity; functionality preserved or regressions documented; tests pass; screenshots of the real app. Document incomplete features accurately.

## 14. Immediate execution order (when un-deferred)

Inspect current rendering/asset pipelines → review brief + PROGRESS → write redesign plan → preserve existing implementation → fix critical startup issues → establish illustrated style → produce first complete character + workstation + cat → integrate into one interactive corner → capture real screenshots → run tests → report. Do not stop at a proposal. Build the living miniature world.
