# AGENT HQ
## The Living Office: A Local-First, Real-Time AI Workforce Visualization
### Master Build Directive for Hermes + OpenCode

> **Document purpose:** This is an executable project brief and implementation directive for Hermes. Place this Markdown file in the exact directory where Agent HQ should be developed. **The directory containing this file is the project root.** Hermes must build the application in that directory. This document is not a request for a concept pitch, mockup-only deliverable, or further roadmap. Build the working software.
>
> **Project name:** Agent HQ (working title, keep unless there is a compelling practical reason to change it).
>
> **Core promise:** A beautiful, cozy, living pixel-art office that displays **truthful real-time Hermes and OpenCode activity**, lets the user **click a desk/computer to inspect the agent's actual work**, and contains **two delightfully mischievous autonomous cats**. It must be both a useful local engineering observability tool and a little world worth keeping open all day.
>
> **Nonnegotiable:** Everything runs locally, using free tools and existing local infrastructure. Never use hosted LLM/image inference or paid APIs. Never invent live activity. Never allow a cat simulation to modify or disrupt a real project.

---

# 0. YOUR MISSION: IMPLEMENT, DON'T JUST DESCRIBE

You are **Hermes**, orchestrator of this workstation's local AI development team. You are responsible for **producing a polished, functional Agent HQ application**, not merely creating an architecture plan, documentation, or an inert prototype.

Operate from the directory containing this Markdown file, which is explicitly the intended application location. Start by printing and verifying the resolved absolute project root. If the root already contains a prior version of Agent HQ or related work, **inspect, preserve, and improve the existing implementation** rather than restarting, deleting, or rewriting it wholesale. Do not assume this is an empty folder. Record any inherited components and tests.

Use **OpenCode 2.2.0** and its existing configured agents for code implementation. Hermes coordinates, selects the smallest appropriate pipeline, reviews results, and ensures milestones are tested. Do not spawn parallel LLM agents: the existing local GLM server has one configured inference slot. Do not replace the deployed model, Hermes gateway, OpenCode configuration, or existing skills.

The app's quality target is **a portfolio-worthy desktop application** that feels like a small independent pixel-art game: lively, tactile, warm, funny, and exceptionally polished. It must not look like a generic business dashboard with emoji stuck on top. At the same time, it must not become a beautiful fake dashboard. It must present real observed telemetry, including data provenance and connection health.

**Your order of priorities:**

1. A compelling, functioning, interactable, animated office.
2. Truthful, safe, read-only live integration with the actual Hermes/OpenCode environment.
3. Excellent agent workstation inspection and history/replay interfaces.
4. Two autonomous cats with memorable, safe environmental interactions.
5. Performance, accessibility, polish, testability, and production-grade operations.

Build in slices that remain runnable. Preserve functioning milestones in version control and a concise progress journal. If you must simplify a feature, simplify its scope, **not the integrity of real-time data or the visual identity**.

---

# 1. WHAT THE USER SHOULD EXPERIENCE

## 1.1 The first ten seconds

The user launches Agent HQ. There is a brief, refined opening transition, with an optional very short logo treatment: a tiny office building/monitor icon, the Agent HQ wordmark, and a subtle loading animation. No huge unnecessary splash or long animation gate.

The main office appears quickly. It is a richly composed **isometric or 2.5D pixel-art studio** seen from an elevated camera. Warm desks, soft lamps, glowing monitors, shelves, plants, a little kitchenette, a sofa, a whiteboard, an activity corkboard, a small server rack or server room, and windows overlooking a stylized city or skyline. The scene feels inhabited even when all agents are idle.

Seven recognizable worker stations/presences are shown: Hermes as the manager and **six existing custom OpenCode agents**. The built-in Explorer can appear as a visiting helper or pop-up station when truly active, but **do not misrepresent it as a seventh custom agent**. Character identities and labels come from the audited runtime configuration, not guesses. Use the actual configured agent IDs to bind events to stations.

In the room, a **small black-and-white tuxedo cat** darts from a desk to the carpet, pauses, swishes its tail, and investigates the furniture. Nearby, a **large, round, slow-moving cat** sleeps on the couch with a gentle breathing animation. Ambient lights glow; monitors flicker subtly; small details move. The world is playful and atmospheric without distracting from important status information.

A discreet HUD shows **Live / Reconnecting / Disconnected / Demo / Replay**, current project and task if known, a small summary of active agents, and access to settings. A clear status distinction prevents a disconnected app from pretending the agents are actively working.

## 1.2 The primary interaction

The user clicks a worker, desk, monitor, or illuminated task badge. The camera may subtly shift or zoom and a **gorgeous inspection panel** opens without discarding the office. It shows real observed work for that specific agent: current project, active task, status, recent action, tool executions, test results, timestamps, and a chronological event feed. Click a more prominent expand button to open a large **workstation view** with tabs for Live Activity, Tasks, Files/Diffs, Tests, Browser/Artifacts, Timeline, and Diagnostics. Full-screen inspection must be possible; closing it should return seamlessly to the same office camera and state.

The user can watch the actual actions occurring in real time. New events animate into view. Older events remain scrollable; the viewer does not forcibly scroll if the user is inspecting history. The user can pause auto-follow, copy a safe log entry, filter event types, and jump back to live. Never leak hidden reasoning, unredacted secrets, credentials, private browser cookies, or unapproved sensitive source contents.

## 1.3 Manager and team behaviors

When Hermes receives and starts handling a task, Hermes's character becomes attentive. They consult a desk or whiteboard; a card appears on the task board. When actual delegation occurs, a tasteful physical animation depicts the handoff: Hermes walks to the receiving desk or a folder traverses a pneumatic tube / desk messenger path. The receiving character starts working only after **actual agent start/execution evidence** appears. Tool calls animate as typing, writing, browsing, inspecting, or testing based on verified event categories. Completion triggers a small appropriate celebration or desk reaction. Failures produce a clear, not-cat-caused warning and prompt a debugger or tester activity when those agents are genuinely involved.

## 1.4 The two cats

Cats continue living in the office regardless of whether AI work is occurring. Their movement and mischief are independent, deterministic in test mode, and **purely cosmetic with respect to real agent work**. The tuxedo cat is energetic and chaotic; the fat cat is slow, drowsy, and occasionally devastating in its indifference. Agents respond to messes visually, but no production files, real keyboards, Docker services, or OpenCode sessions are tampered with by a cat.

The user should occasionally catch a tiny hilarious incident out of the corner of their eye. The cats must be charming enough that it is enjoyable to keep the office open even with no tasks underway.

---

# 2. FOUNDATIONAL PRODUCT RULES

1. **No fabricated live data.** Only observed external events may appear in the live activity feed. Unknown information should be labeled Unknown, Unavailable, Not exposed, or Inferred, as appropriate.
2. **Separate simulation from reality.** Walk cycles, coffee breaks, cat mischief, decorative thoughts, and environmental animations may be simulated. Actual task states, tool execution, test results, edited files, and completion claims must come from source events or explicitly labeled inference.
3. **All observers are passive.** Agent HQ must not slow, block, prompt-inject, interfere with, or reconfigure Hermes/OpenCode requests. Instrumentation must fail open with respect to the development process and fail closed regarding unauthorized information disclosure.
4. **Local-first, zero extra paid services.** Do not call any cloud LLM, remote image generator, metered API, or hosted telemetry provider. During installation, package downloads from official sources are acceptable; runtime should work offline when connected to local services.
5. **Do not expose private data by default.** Sanitize before storage and transport. Raw chain-of-thought/reasoning streams must never be shown or persisted by Agent HQ. Redact secrets and sensitive tool inputs/outputs.
6. **One inference slot.** The app itself must use no continuous LLM inference. Use deterministic visuals and event-driven state machines for animation. Do not have GLM narrate every tool call or choose cat actions.
7. **Actual usefulness.** Workstation inspection must be a serious practical monitoring tool, not just a pretty overlay.
8. **Performance and responsiveness.** Smooth rendering when idle, modest memory, bounded telemetry memory, frame-rate limiting when unfocused, and graceful connection loss.
9. **Meaningful art direction.** Original coherent pixel art with matching perspective and palettes. Avoid inconsistent generated imagery, generic icon soup, or placeholder rectangles as final artwork.
10. **Accessible alternatives.** Office is mouse-first, but important features are accessible via keyboard, labeled controls, and a non-canvas agent list. Respect reduced-motion settings.
11. **Evolvable architecture.** New agents and custom rooms can be added without rewriting event ingestion or the renderer.
12. **Be honest in status reports.** Clearly distinguish complete, partially complete, simulated, unverified, and deferred features.
13. **Keep all work inside this project folder** except narrow, necessary, approved read-only integrations and approved deployment configuration. Never alter arbitrary other repositories or core AI services.
14. **No forced overengineering.** Build the simplest architecture that reliably meets the requirements; avoid an unrelated multi-service orchestration framework.
15. **Test in normal and failure conditions.** A happy-path visual demo is insufficient.

---

# 3. DEVELOPMENT CONTEXT AND REQUIRED DISCOVERY

## 3.1 Known environment, to verify rather than assume

- Ubuntu workstation with three NVIDIA RTX PRO 6000 Blackwell GPUs.
- Existing Docker services `glm-server` and `hermes`.
- GLM-5.3-Flash Q4_K served locally through llama.cpp.
- Existing OpenCode V2, reported as version 2.2.0.
- Existing OpenCode agents (exact IDs to confirm): architect, implementation, frontend, tester, debugger, security; built-in explore also exists.
- OpenCode model assignments locally pinned.
- Existing tools reportedly include Serena, Playwright CLI, GLM screenshot vision, design skills, test/lint tools, and a local ComfyUI installation.
- Prior reports may be found at `/opt/data/docs/HERMES_DEVELOPMENT_TOOLKIT_2.md` and related backups. Read if available, but do not treat a report as a substitute for runtime verification.

## 3.2 Inspect before scaffolding

1. Print `pwd`, real path, directory listing including hidden files, and Git status.
2. Search for existing Agent HQ application components, mockups, assets, configs, TODO files, and work-in-progress implementations. Preserve them.
3. Inventory relevant project-level coding standards and instructions. Respect the existing project.
4. Inspect active OpenCode and Hermes versions and interfaces **without changing their configurations**.
5. Verify what events, APIs, logs, and hooks are actually available in those installed versions. Do not assume a current online example matches the deployed binary.
6. Identify a stable integration strategy that works with the existing Docker networking and persistent mounts.
7. Establish baseline build/test and frontend performance if code exists.
8. Record discoveries in `docs/INTEGRATION_AUDIT.md`.

## 3.3 Official docs and repository references to verify

- Hermes agent: https://github.com/NousResearch/hermes-agent
- Hermes event hooks: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/hooks.md
- Hermes browser: https://hermes-agent.nousresearch.com/docs/user-guide/features/browser
- OpenCode V2 event API: https://dev.opencode.ai/v2/docs/api
- OpenCode V2 plugin server docs: https://opencode.ai/v2/docs/build/plugins/server/
- Phaser docs: https://www.phaser.io/oss/docs/
- Tauri V2 capabilities: https://tauri.app/security/capabilities/
- Tauri V2 sidecars: https://v2.tauri.app/develop/sidecar/
- ComfyUI: https://github.com/Comfy-Org/ComfyUI
- ComfyUI API example: https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example.py
- Playwright CLI: https://github.com/microsoft/playwright-cli
- Kenney assets: https://kenney.nl/assets
- Pixelorama: https://github.com/Orama-Interactive/Pixelorama
- jsfxr: https://github.com/chr15m/jsfxr

Use documentation for the *installed versions* and inspect authoritative schemas. Do not invent endpoints, event names, or API capabilities.

---

# 4. TECHNOLOGY CHOICES

## 4.1 Preferred stack

**Frontend:** React + TypeScript + Vite for HUD, detail panes, menus, settings, task board details, and user-facing forms. **World renderer:** Phaser 3, pinned to a verified compatible version, for the office, actors, props, pets, camera, particle effects, tweens, and depth ordering. React and Phaser must coexist cleanly; Phaser handles the canvas world and a small bridge emits typed selection/interaction events to React. Avoid rendering every moving pixel-art object as a React DOM node.

**Backend:** Node.js with TypeScript, Fastify or an equivalently lightweight maintained HTTP/WebSocket framework, SQLite for event persistence, a real-time event normalizer, and read-only source adapters. Prefer a single backend process plus source connectors; do not build microservices. If Python is demonstrably simpler for a specific Hermes hook adapter, allow a tiny Python bridge, but don't duplicate the full backend. Use SQLite WAL and bounded retention.

**Transport:** Local WebSocket for pushing normalized events to frontend; HTTP for initial snapshot, sessions, event history, search, artifacts, and health. A distinct transport between external agent event producers and the HQ backend is permitted when required by environment boundaries.

**Packaging:** Web-first development build that works in a normal local browser. Add Tauri V2 desktop packaging **after the web application and telemetry work**, without making the initial development dependent on Tauri. Tauri must use minimal capabilities and a secure sidecar/loopback strategy if necessary. If a native package is impractical, deliver a launchable local web app and document packaging as deferred, not fake-complete.

**Audio:** Web Audio or locally bundled short WAV/OGG effects produced with jsfxr or similarly licensed tooling. Audio must default off or start only after explicit user interaction, with mute and volume controls.

**Art:** Original art, appropriate free/CC0 assets, and locally generated source art prepared into coherent pixel sprites. No paid content and no remote image APIs.

## 4.2 Suggested repo structure (adapt to existing contents)

```text
./                              # EXACT folder containing this brief
├── AGENT_HQ_MASTER_BRIEF.md
├── README.md
├── package.json
├── pnpm-workspace.yaml           # if a workspace is justified
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/             # React shell, overlays, routes
│   │   │   ├── office/          # Phaser scenes and world systems
│   │   │   ├── actors/          # worker presentation controllers
│   │   │   ├── cats/            # independent cat simulation
│   │   │   ├── ui/              # desk panels, task board, settings
│   │   │   ├── hooks/           # React subscriptions
│   │   │   └── styles/
│   │   ├── public/assets/
│   │   └── tests/
│   └── server/
│       ├── src/
│       │   ├── api/
│       │   ├── telemetry/
│       │   │   ├── adapters/    # Hermes, OpenCode, fixture/replay
│       │   │   ├── normalize/
│       │   │   ├── redact/
│       │   │   ├── ingest/
│       │   │   └── state/
│       │   ├── db/
│       │   ├── auth/
│       │   └── health/
│       └── tests/
├── packages/
│   ├── shared/                   # typed event schemas and contracts
│   ├── simulation/               # pure cat/ambient simulation logic
│   └── assets/                   # manifests, authoring validators
├── assets-src/                    # original source and generation inputs
├── docs/
│   ├── INTEGRATION_AUDIT.md
│   ├── ART_BIBLE.md
│   ├── EVENT_SCHEMA.md
│   ├── SECURITY_MODEL.md
│   ├── PROGRESS.md
│   ├── DESIGN_DECISIONS.md
│   ├── OPERATIONS.md
│   └── TEST_MATRIX.md
├── scripts/
│   ├── doctor.*
│   ├── seed-demo.*
│   └── asset-validate.*
├── test-fixtures/
└── src-tauri/                     # only when native packaging begins
```

Do not force a monorepo if an existing well-structured application makes it unnecessary. Prefer maintainable, typed modules and small interfaces over a huge single source file.

## 4.3 Coding standards

- Strict TypeScript where practical, with documented justified exceptions.
- Use stable IDs, typed schemas, runtime validation at external boundaries, and explicit event versions.
- Testable pure state transformations separated from Phaser rendering.
- No hard-coded runtime secrets, absolute personal paths, or guessed container IP addresses.
- Consistent linting/formatting using existing project standards; Biome or equivalent if no standard exists.
- Small predictable dependencies, no unnecessary icon or UI framework bloat.
- Avoid unbounded timers, polling loops, canvas texture allocations, and WebSocket listeners.
- Keep a clean dev/prod separation; test fixtures must never appear as real events.
- Document commands that actually work in this folder.

---

# 5. VISUAL IDENTITY AND ART DIRECTION: THE OFFICE MUST BE STUNNING

## 5.1 Overall aesthetic

Imagine **a lovingly detailed indie pixel-art game about a tiny AI startup**. The perspective is elevated 2.5D/isometric, with believable spaces, readable characters, cohesive proportions, and layered environmental lighting. It should feel cozy, warm, subtly magical, and nerdy. A viewer should recognize it as a real little game at a glance, not an observability dashboard reskinned as a game.

**Palette direction:** Deep navy/charcoal shadows, dark plum and smoky violet accents, warm amber lighting, soft teal/cyan terminal highlights, honey-colored wood and cream/neutral surfaces. The emotional mood is "late-night indie development studio," with time-of-day variations. Maintain strong readability and avoid neon overload. Use saturated color sparingly for active events and important indicators.

**Quality markers:** Carefully considered composition; unique furniture silhouettes; thoughtful lighting; detailed but legible pixel clusters; layered occlusion; smooth camera motion; lively idle animations; intentionally designed typography in overlays; appropriately timed sounds; restrained particles. Screen text in detailed UI remains crisp HTML, not unreadably small canvas text.

**Avoid:** Generic SaaS cards pretending to be furniture, mixing incompatible perspectives, giant emoji avatars as final characters, blurry upscaled AI art, badly aligned sprites, random art styles, giant neon HUD clutter, excessive permanent speech bubbles, unreadable scrolling terminal text in miniature monitors.

## 5.2 Map and spatial composition

Design a coherent office floor plan with connected navigation space and distinguishable zones:

1. **Hermes manager's corner:** slightly elevated or central focal area, a tidy dark wooden desk, terminal, lamp, clipboard, and pinned planning board.
2. **Developer workstation:** keyboard-heavy, dual monitors, code-themed decorations, organized mess.
3. **Architect workstation:** blueprint mats, diagrams, wall whiteboard, books, schematics.
4. **Frontend workstation:** tablet, color swatches, little sketches, accent monitor and creative trinkets.
5. **Tester workstation:** checklists, test monitor, small status panels, clipboard.
6. **Debugger workstation:** investigative clutter, magnifying-glass accent, coffee mug, stacked logs.
7. **Security workstation:** more disciplined, darker palette, protected monitor, shield motif, subtle warning light.
8. **Shared collaboration area:** task corkboard, table, seating, maybe a tiny meeting station.
9. **Lounge:** couch for the fat cat, rug, potted plants, blanket, bookcase.
10. **Kitchenette:** coffee maker, water cooler, mugs, food bowls for both cats.
11. **Server corner:** blinking racks and tasteful equipment lights, representing local infrastructure health.
12. **Window wall:** stylized skyline, parallax layers, weather/lighting atmosphere; simulated weather must never be presented as an actual forecast.
13. **Cat routes:** accessible desks, couch, food bowls, window seat, cardboard box, and unobstructed paths.

An isometric room should be practical to navigate, not merely a beautiful flat collage. Have a clear walkable-floor mask and obstacle representation. Render actors sorted by world position for realistic front/back occlusion. Interactive objects use hit areas corresponding to their art.

## 5.3 Floor plan and camera requirements

- Build the scene for desktop and large monitor use first, while remaining responsive on narrower browser windows.
- Allow smooth zoom in/out within safe limits, drag-pan with mouse, and accessible navigation controls.
- Provide **Reset Camera** and **Focus on Agent** actions.
- Camera should never pan a selected monitor panel out of view unpredictably.
- Remember camera framing during panel expansion and restore it on closing.
- Keep clickable desk targets comfortable in the default view.
- Implement hover/focus outlines or a small attractive tooltip for interactive props.
- Use stable world coordinates and an extensible scene-object registry.
- Use finite navigation paths: no characters walking through desks, walls, or each other when easily avoidable.
- Support reasonable behavior if paths are blocked or animation targets disappear.
- Recompute layout correctly on resize and device-pixel-ratio changes.

## 5.4 Pixel-art asset specifications

Choose a consistent base character scale, e.g. 24x32, 32x48, or another size that makes expressions readable in the camera perspective. Record the decision in `docs/ART_BIBLE.md`. Use crisp nearest-neighbor sampling when appropriate and pixel-perfect alignment where it doesn't conflict with smooth camera movement. Keep characters and props on a consistent projected grid.

Create or source coherent original pixel-art assets for:

- Office floor, walls, trim, windows and shadows.
- Furniture variants: seven desks or a reusable base with differentiated decorations.
- Computers, monitors, terminals, cables, lamps, screens, whiteboard, task board.
- Coffee machine, mugs, book piles, plants, bins, keyboard, stool, couch, cat beds, food bowls.
- Seven agent character identities or six custom agents plus Hermes (Explorer optional cameo).
- Tuxedo cat and fat cat with required motions.
- Status overlays, alert glyphs, tiny particles, and environmental effects.

All generated or retrieved assets must have `assets-src/manifest.json` or similar with origin, author, license, processing history, and exported sizes. Verify commercial-use eligibility if not original, even though this is currently a local work project. Avoid copyrighted character sprites and unlicensed UI packs.

**Use installed free/local art tools when useful:** ComfyUI for concept art and generation, Pixelorama or compatible sprite-editing tools if available, local image-processing and sprite-sheet packing. Verify current availability. Do not block implementation on a missing GUI application: produce strong temporary code-drawn pixel assets that can be replaced without changing scene logic. Temporary art must be intentionally styled, not an excuse to leave the finished scene as featureless colored boxes. Maintain separate source/export directories.

## 5.5 Animation requirements

Minimum employee sprite states: idle seated, idle standing, 4-direction or perspective-appropriate walking, typing, thinking, reading, coffee, reaction/surprised, task handoff, brief celebration. More nuanced states for agent specialties are welcome. Use little details like monitor glow, tiny status pips, paper movement, lamp toggles, and posture changes.

Minimum tuxedo states: walk, sprint/zoomies, idle, sit, tail flick, groom, crouch/pounce, jump on/off furniture, bat object, mischief, escape, sleep briefly.

Minimum fat-cat states: long sleep, chest/belly breathing, ear twitch, stretch/yawn, slow rise, waddle, sit, look around, climb slowly, occupy keyboard/chair, doze off.

Animation transitions must be smooth and deliberate. Do not teleport characters except for explicit recovery on broken path/state, and conceal such recovery gracefully. Use time-based animations and easing; support reduced motion.

## 5.6 Lighting and ambience

- Configurable **day / evening / night / auto-local-time** ambiance. Auto-local-time may use the device's local time; show the label. Do not claim to know an external location.
- Day: warm natural light and brighter window colors.
- Evening: muted sunset palette, warm lamps.
- Night: navy shadows, glowing monitors, gentle neon accents.
- Optional decorative rain, window droplets, drifting dust, steam from coffee, tiny twinkling lights.
- Weather is ambient simulation, not a live meteorological reading.
- Avoid expensive full-screen blur/postprocessing or excessive particle counts that degrade frame rate.
- Make visual intensity adjustable.

---

# 6. THE EMPLOYEES: CHARACTER DESIGN AND REAL STATES

## 6.1 Identity map

Each character has a canonical `agentId` sourced from the runtime or verified configuration, a display label, visual role, desk ID, base animation set, idle routine, work routine, and status presentation. **Do not alter actual agent personalities or prompts** to make the display cuter. Office characterization is entirely presentation-layer fiction.

| Role | Character vibe | Distinct desk object | Idle behavior | Real-work animation |
|---|---|---|---|---|
| Hermes | Calm, quick, supportive manager | Clipboard, task board, central display | Reviewing papers, coffee, pacing | Plans, dispatches folders, checks board |
| Architect | Thoughtful and meticulous | Blueprint board, ruler | Studies plans, tidies diagrams | Draws diagrams, consults code map |
| Implementation | Energetic builder | Multi-monitor desk, keyboard | Fidgets, tinkers | Types, builds, edits, compiles |
| Frontend | Artistic perfectionist | Color swatches, tablet, posters | Sketches thumbnails | Designs, checks browser, iterates visuals |
| Tester | Patient, suspicious, organized | Test checklist, bug jars | Sorts notes | Runs tests, green/red result indicators |
| Debugger | Tireless detective | Magnifier, stacked logs | Studies small logbook, drinks coffee | Traces failures, investigates, fixes |
| Security | Steady guardian | Shield marker, audit terminal | Patrol glance, organizes files | Reviews, scans, signals findings |

The roles are illustrations. Use installed agent names exactly for telemetry joins. If the actual agent IDs differ, map them through a configuration-driven adapter rather than hardcoding assumptions.

## 6.2 Exact externally grounded states

The source-of-truth state machine should distinguish:

- `unknown`: not yet established or insufficient data.
- `offline`: adapter cannot contact source.
- `idle`: source has evidence of no active work (not merely absence of messages).
- `assigned`: task is known but actual execution not started.
- `planning`: genuine planning or analysis activity observed.
- `working`: source reports execution, a tool call, or relevant activity.
- `waiting`: pending tool, permission, I/O, or known blocker.
- `testing`: an observed test invocation currently running.
- `reviewing`: an observed review/scanning operation.
- `failed`: observed execution failure, error, or actionable test failure.
- `completed`: source confirms completion.
- `stale`: a prior active state is no longer trustworthy because telemetry disappeared or timed out.

Decorative animation states (walking, coffee, cleaning cat mess) must not overwrite the true externally grounded status. Keep **two state tracks**: actual work status and visual animation/ambient activity. Example: an agent may be `working` while the visible actor briefly reacts to a cat, but the inspector must still show `working` with provenance. In very busy tasks, defer cosmetic interactions instead of disrupting the reading of work states.

## 6.3 Specialty animation mapping

Map actual event categories to optional, small presentations:

- `task.started`: sit up, monitor wakes, task card appears.
- `agent.delegated`: manager passes folder; destination reacts.
- `tool.read` / `code.search`: page flip, monitor scanning motif.
- `tool.edit` / `file.changed`: rapid typing and short code glyph motion.
- `tool.shell`: terminal flash with clear active spinner.
- `test.started`: tester's checklist fills progressively only from real test evidence.
- `test.passed`: small green confirmation animation.
- `test.failed`: red indicator and disappointment, not a fabricated causal explanation.
- `review.started`: security/reviewer reading files.
- `review.finding`: audit marker, severity from observed tool output if available.
- `task.completed`: subtle celebratory flourish.
- `task.blocked` / `permission.asked`: visible waiting indicator.
- `session.reconnected`: return to trustworthy source state, no fake resumed task.

Do not infer test totals from a generic successful shell command. Test counts require parseable test output or a structured test report.

## 6.4 Movement and life during idle

Employees should not become statues. Give each a bounded ambient behavior scheduler that operates when real work does not demand a particular animation: glance toward a colleague, fetch coffee, read book, look out window, doodle, straighten desk, briefly walk to board, go back to work area, react to cat. Use role-specific probabilities, cooldowns, a seeded RNG, animation priority, and pathfinding. This is world simulation, never telemetry.

Make employees feel alive without walking constantly or making desk identity ambiguous. Most agents should remain near their desk and return appropriately when work begins.

---

# 7. THE CATS: TWO COMPLETE AUTONOMOUS NPC SYSTEMS

The cats are essential product features, not optional decoration. Their behavior should be a standout attraction. Implement both with independent AI/state machines and actual navigation/interaction rules.

## 7.1 Cat A: small tuxedo chaos goblin

**Working name:** Pixel (configurable; show a small name tag on hover or in a playful cat info panel).

**Appearance:** Small black-and-white tuxedo pattern, white chest, white paws, bright expressive eyes, exaggerated tail, quick motions, distinct compact silhouette.

**Personality:** Curious, impulsive, zoomy, mischievous, occasionally affectionate, entirely innocent in its own mind.

**Behavior repertoire:**

- Curious roaming, sniffing furniture, investigating objects.
- Fast walking, tiny jumps, sudden zoomies across safe routes.
- Tail flicking, loafing, grooming, brief naps.
- Sitting on warm keyboards/monitors.
- Chasing toy ball or a moving light speck.
- Batting loose papers and pens off desks.
- Tipping a decorative coffee mug (cosmetic animated spill).
- Pawing loose cables (cosmetic wobble, no actual unplugging).
- Scratching at the printer.
- Hiding behind plant pots.
- Stealing a small harmless object and being chased.
- Running away from an agent who approaches.
- Sometimes approaching a worker for attention.

**Behavior cadence:** Frequent movement, short rests, unpredictable but believable spurts. Example initial parameters: decision check every 4-9 seconds, normal locomotion speed approximately 1.4-2.0x that of the fat cat, occasional 2-4 second zoomies burst, mischief cooldown on the order of 90-180 seconds. These are tuning defaults, not hard requirements. Expose rates in a data file.

**Full authored mischief scenes:**

1. **Keyboard Cat:** Pixel leaps onto the Developer keyboard. A fake gibberish string appears only on the **miniature decorative office monitor**. Developer looks offended, gently scoops Pixel down, resets the decorative monitor. Never inject text into an actual editor, terminal, or OpenCode session.
2. **Coffee Catastrophe:** Pixel bats a mug, spill particles and puddle sprite appear; a worker gets paper towels and cleans it. Do not show real service errors as consequences.
3. **Cable Thief:** Pixel drags a loose prop cable toward the lounge; a worker notices and follows; cable gets restored. Purely virtual.
4. **Printer Battle:** Pixel stares down a printer and bats at the paper. The printer wobbles, paper spits out, worker retrieves sheets.
5. **Plant Assassin:** Pixel nudges a small plant until it tilts; worker rights the pot. No actual project files affected.
6. **The Zoomies:** Fast laps around the office, brief skid at corners, optional toy collision. Characters react but maintain true work state.
7. **Forbidden Warmth:** Pixel curls up on the Security monitor or keyboard; Security politely relocates them.
8. **Cat vs. Laser:** A harmless simulated pointer/tiny glowing mote appears, Pixel stalks and pounces.

Each incident needs: eligibility, start condition, target prop, path, animation beats, sound, temporary environmental state, worker reaction, resolution, cooldown, and a deterministic replay path. No incident may leave a prop permanently broken or interfere with critical navigation. Queue repairs when agents are busy.

## 7.2 Cat B: large, languid office supervisor

**Working name:** Biscuit (configurable).

**Appearance:** Very round, clearly larger sprite, thick tail, slow blinking eyes, soft belly, cozy sleepy posture; gray or ginger is acceptable if coherent with palette. Visually distinct from Pixel at any scale.

**Personality:** Sleepy, stubborn, immovable, occasionally affectionate; inspires reverence by doing absolutely nothing.

**Primary behaviors:**

- Sleeps for long stretches on the couch with gentle breathing.
- Ear twitches, stretches, yawns, wakes briefly, falls asleep again.
- Slowly waddles to food bowl, window, rug or another preferred sleep site.
- Stands in a doorway and makes workers reroute around them.
- Occupies a chair while a worker politely waits.
- Falls asleep on a keyboard and refuses to relocate.
- Moves rarely and slowly; never behaves like Pixel at normal settings.
- Watches chaos with one eye, then returns to sleep.

**Suggested cadence:** Roughly 65-85% of time in resting/sleep states in ordinary simulation. Short, rare walks separated by long naps, slow acceleration and distinct heavy gait. Rare mischief compared with Pixel. Tune until the contrast is comically obvious.

**Authored incidents:**

1. **Great Keyboard Occupation:** Biscuit slowly climbs onto the Architect's keyboard, instantly sleeps. Architect tries politely to move them, gives up, gets a spare keyboard, continues working.
2. **Chair Theft:** Biscuit owns Security's chair; Security obtains another chair. Biscuit wins.
3. **Printer Throne:** Biscuit sits on the printer, which makes one strained mechanical sound. Everybody looks. Biscuit does not care.
4. **Doorway Boulder:** Biscuit occupies a passage. Agent reroutes around; no deadlocked pathfinding.
5. **The Slowest Crime:** Biscuit nudges a stack of papers off a table with absurdly slow deliberate motion. Worker tidies while Biscuit goes back to sleep.

## 7.3 Cat behavior architecture

Separate a **pure, testable simulation core** from rendering. Consider a utility/goal-based scheduler plus hierarchical finite-state machines:

```text
CatCore
  needs: curiosity, energy, comfort, hunger (purely playful; never distressing)
  traits: speed, boldness, sleepiness, mischievousness
  state: sleep | wake | wander | investigate | chase | interact | recover
  intent: destination + interaction target + interruptibility
  cooldowns: action-specific
  rng: seeded for deterministic tests/replay
  navigation: tile/nav graph with collision-safe paths
  animation: event projection, not source-of-truth
```

No need to create a complex behavior tree framework if simple rules suffice. Avoid repetitive jitter or the same mischief firing every minute. Use weighted choice, time-of-day variation, object affordances, and occupancy/cooldown constraints.

## 7.4 Agent responses to messes

The office should respond physically and humorously:

- React briefly with a head turn, exclamation bubble, or surprised sprite.
- Identify which idle or available character can safely enact a cleanup animation.
- Walk to the broken prop and perform a repair/cleanup motion.
- Restore the prop's visual state.
- Return to the previous ambient schedule.
- If all workers are occupied by real work, show a subtle pending cleanup state and perform it later. Real execution must not pause.
- Optionally Hermes, as manager, can supervise a cosmetic repair if available.

**Truth constraint:** Cat incidents must not appear in real agent logs or be labeled as technical causes of actual build failures. If a real test fails during cat mischief, the overlay must show "Observed test failure" independently. Do not fake causation.

## 7.5 Optional sandbox chaos mode, strictly separate

A future **Sandbox Chaos Mode** may generate harmless, reversible exercise bugs in a **disposable example repository** so actual agents can practice debugging. This must be **off by default**, require explicit user action, and never touch production project files, active Hermes/OpenCode configs, or real user repositories. It is **not required** for initial release. The core cat simulation must remain cosmetic.

## 7.6 Clickable cats and Easter eggs

Click a cat to open a small charming profile with name, current activity, a few harmless stats (naps today, mischief count, favorite place), and maybe a **pet** interaction. Petting may trigger purr/heart/animation but must not alter real telemetry. Add rare tasteful Easter eggs such as `sudo meow` on a decorative monitor, a cat loaf by the rack, or a tiny office "employee of the month" portrait featuring Biscuit. Keep jokes subtle enough not to overwhelm the monitoring utility.

---

# 8. REAL-TIME TELEMETRY: AN ENGINEERING REQUIREMENT, NOT A DECORATION

This is the most technically important subsystem. A beautiful office that invents agent work is a failed product.

## 8.1 Source adapters

Implement independent, read-only adapters for:

- **Hermes:** Actual lifecycle, delegation, session, tool, and handoff events where supported. Prefer documented plugin or lifecycle hooks that work in the relevant execution modes. **Gateway-only hooks do not cover all CLI/TUI invocations.** Determine where Hermes actually runs and which hooks fire. Choose passive, lightweight instrumentation. Never patch the Hermes core to add observability unless absolutely necessary and approved.
- **OpenCode V2:** Actual session and tool events. Investigate the deployed server's event subscription API, session endpoints, and plugin system. The current documentation mentions an `/api/event` stream with events such as `session.execution.started`, `session.tool.called`, `session.tool.success`, `session.tool.failed`, `session.idle`, `session.status`, and `session.execution.succeeded/failed`; **confirm those names and route semantics in installed OpenCode 2.2.0** before coding against them.
- **Local service health, optional:** Read-only availability for GLM, Hermes gateway, OpenCode adapter, and ComfyUI if integrated. Prefer health endpoints. Do not poll `nvidia-smi` every frame; hardware stats are optional and rate-limited.

## 8.2 Avoid invasive hooks

Observability hooks must be minimal, bounded, asynchronous, and isolated. If a hook blocks or crashes, it must not stop a model call, corrupt its request, or delay a test run. Prefer emitting a small sanitized event to a local endpoint or append-only local spool. Use a bounded queue and explicit overflow accounting. **Do not perform heavy parsing, screenshot generation, or database writes synchronously inside a critical Hermes/OpenCode tool-call hook.**

Do not rely on brittle scraping of colorful terminal output when structured events exist. If a fallback log parser is necessary, label its confidence, isolate it, and write fixture tests against real sample lines.

## 8.3 Accurate agent attribution and causality

The system must join events to the right agent and task using actual source identifiers. Preserve:

- Source (`hermes`, `opencode`, `system`, `demo`, `replay`).
- Native session ID and optional parent session ID.
- Agent identity ID, where exposed.
- Tool call ID, task ID, project/worktree ID, when exposed.
- Event kind.
- Timestamp from source and receive timestamp.
- Monotonic ordering or sequence ID when available.
- Confidence/provenance for derived classifications.

**Do not guess ownership solely from filenames, process names, or the most recently active desk.** If an event can't be confidently attributed, show it in an Unassigned/System stream.

Differentiate Hermes orchestrator tasks from OpenCode child tasks. Make handoffs visible only when supported by real correlation data or carefully labeled inference. Do not invent an invisible agent merely to fill a desk.

## 8.4 Proposed normalized event schema

The schema below is **a proposed internal contract, not a claim about an external API**. Implement runtime validation and versioning.

```ts
type EventSource = 'hermes' | 'opencode' | 'system' | 'demo' | 'replay';
type WorkEventKind =
  | 'session.started' | 'session.ended' | 'agent.started' | 'agent.stopped'
  | 'task.created' | 'task.assigned' | 'task.started' | 'task.completed'
  | 'task.failed' | 'task.blocked' | 'agent.delegated'
  | 'tool.started' | 'tool.completed' | 'tool.failed'
  | 'file.changed' | 'test.started' | 'test.completed'
  | 'review.started' | 'review.finding'
  | 'permission.requested' | 'permission.resolved'
  | 'status.changed' | 'integration.connected'
  | 'integration.disconnected' | 'integration.gap'
  | 'artifact.created' | 'diagnostic.recorded';

type NormalizedEvent = {
  schemaVersion: 1;
  eventId: string;             // unique stable ID for deduplication
  ingestSeq: number;           // server-assigned increasing sequence
  source: EventSource;
  nativeEventType: string;     // inspectable original event label
  kind: WorkEventKind;
  occurredAt: string;          // ISO UTC timestamp, if known
  receivedAt: string;
  sessionId?: string;
  parentSessionId?: string;
  taskId?: string;
  projectId?: string;
  agentId?: string;
  toolCallId?: string;
  status?: 'started' | 'succeeded' | 'failed' | 'interrupted';
  publicSummary: string;       // sanitized, concise, display-safe
  safeFileRefs?: string[];     // sanitized references, no secret data
  severity?: 'info' | 'warning' | 'error';
  provenance: 'direct' | 'derived' | 'simulation';
  confidence?: 'high' | 'medium' | 'low';
  safeDetails?: Record<string, unknown>; // allowlisted only
};
```

Raw external payloads are never directly forwarded to the browser. Define allowlists and redaction; do not store raw provider request bodies, hidden reasoning tokens, or full tool arguments by default.

## 8.5 Live stream and reconnection

- Backend persists normalized events in SQLite; UI connects over WebSocket.
- On connection, client requests/receives a consistent snapshot with latest ingest sequence.
- Thereafter receives ordered incremental events.
- On reconnect, client supplies last seen sequence; backend replays retained events or explicitly reports a gap.
- Deduplicate by stable event ID and sequence; UI must not double-count events after reconnect.
- Keep heartbeats, backoff with jitter, status indicators, and a small reconnection banner.
- Bounded memory on the frontend; use virtualized long event lists and paginated historical queries.
- Handle clock skew using received timestamps where necessary.
- Multiple tabs should not create duplicate source hooks; one server ingests sources and fans out to consumers.
- If the upstream OpenCode event stream is volatile and disconnects, **do not promise lossless history**. Persist what HQ observes, reconcile with supported session APIs where possible, and show a gap marker when exact reconstruction is impossible.
- Do not mark a worker "working" indefinitely based on a stale last event; use source health and known session statuses.

## 8.6 Read-only safety and privacy

Default telemetry view contains only display-safe summaries, statuses, timestamps, and approved metadata. To view more detail, provide explicit settings such as:

- Safe activity feed (default ON).
- File paths (default only safe relative paths).
- Source diffs (OFF unless explicitly enabled for the current project/session and redacted).
- Tool stdout excerpts (OFF by default or restricted to sanitized, limited output).
- Browser screenshots (OFF by default until expressly enabled and locally available).
- Retention duration and per-project visibility.

Do not expose raw shell environment variables, process command lines containing tokens, API keys, cookies, authentication headers, private reasoning traces, hidden chain-of-thought, or unrestricted filesystem browsing. Sanitize on the server **before storing and pushing**, with explicit tested patterns and allowlists. Redaction is defense in depth; use field-level exclusion as the main control.

**Permissions:** The office is a monitoring surface, not a new general shell. Do not implement arbitrary remote command execution, arbitrary file reads, model controls, or automatic edits just to make workstations clickable. If any control interface is considered later, keep it separately permissioned and explicitly opt-in.

**Network:** Bind backend only to loopback by default. If the user later needs another device to connect, require an explicit secure configuration; do not bind to `0.0.0.0` during initial setup. Use appropriate origin validation, local authorization where needed, CSRF protections for state-changing routes, and avoid insecure public CDP / localhost proxy exposure. Document how Docker networking is bridged without exposing agent internals.

## 8.7 Honest fallbacks

If structured Hermes hooks are not accessible, build the OpenCode adapter fully, and show Hermes status only as available from a verified source. Mark unavailable fields honestly. Do not fabricate a manager plan or "thought". Support a local **Demo Mode** with simulated events for showcasing interactions, clearly watermarked DEMO. Support **Replay Mode** of captured sanitized events. Never mix demo events into the real live timeline.

---

# 9. WORKSTATION INSPECTION: CLICK THROUGH TO EXACTLY WHAT THE AGENTS ARE DOING

## 9.1 Three presentation levels

**Level 1: Office glance.** Mini-monitor glyphs, status pips, a short readable agent label, hover tooltip "Editing combatEngine.ts" only if backed by observed safe event. Visual state should communicate idle, active, running test, blocked, review, error, or disconnected at a glance.

**Level 2: Desk detail pane.** Clicking desk/worker opens a polished overlay anchored intelligently, showing agent identity, project, task title, current action, live event feed of last ~10 events, health, start time, relevant test summary, and quick actions: Expand, Follow Agent, Open Task Board, Close. If there is no data, say so and keep the panel useful.

**Level 3: Expanded workstation.** A major resizable or full-screen panel with high-quality readable UI. The office may dim in the background, pause camera motion, or remain softly alive. Tabs:

1. **Overview:** latest status, task, project, runtime, source connectivity, last event age.
2. **Live Activity:** chronological sanitized stream, live-follow toggle, timestamps, categories, search/filter.
3. **Tasks:** related task cards with real statuses, parent/child association where known, delegation timeline.
4. **Files / Diffs:** safe file-change list; optional redacted diff only with explicit enablement, never automatically open arbitrary secret files.
5. **Tests / Reviews:** observed test invocations and actual results, failure details, reviewer findings; distinguish unparsed tool output from verified pass counts.
6. **Browser / Artifacts:** locally available screenshots, saved reports, artifact previews, with opt-in privacy safeguards and clear timestamps.
7. **Timeline / History:** scrub a past period and see states/events without pretending playback is live.
8. **Diagnostics:** provenance, adapter health, last heartbeat, event gaps, stream version, dropped event counters.

Avoid implementing every tab as a static placeholder. Build feature-complete vertical slices, disable or label unsupported tabs honestly, and improve incrementally.

## 9.2 Behavior details

- Hover/tooltips are supplementary; all actions work with click, touch, and keyboard.
- Agent selection is mirrored between office and optional accessible list.
- Clicking a small decorative prop that is not a workstation should not accidentally open the wrong agent.
- Open/close animation is quick and doesn't trigger layout shift.
- Safe clipboard support for log entries and diagnostics.
- Filters: agent, project, event type, time range, success/failure, source.
- Search history with capped query size and indexed fields.
- Remember view preferences locally without leaking credentials.
- Allow simple copyable deep links or state restoration for a selected agent in web mode, without exposing private server addresses in shared URLs.
- Show real timestamps, relative ages, and timezone-aware formatting.
- Display both currently executing and last-completed state clearly.
- Keep UI readable at 100% and 125% zoom on desktop.

## 9.3 Task board integrated into world

A corkboard mounted in the office is an interactive object. It displays small physical sticky-note representations of known work. Click to open a full accessible **Kanban-style task board** with columns such as:

`Queued` → `Planning` → `In Progress` → `Testing / Review` → `Done` / `Blocked`

Only create a real task card when grounded in a task/session event or a supported explicit user-entered local note (clearly marked manual). A test stage is not inferred merely because the role "Tester" exists. Animated sticky notes move between columns upon observed state changes. Use subtle real-world gestures: paper slides, stamp, little pin. Completed work can trigger a tiny office celebration.

Provide task click-through to related agent sessions and activity. Show "uncorrelated session" instead of guessing if task/session links are unknown.

## 9.4 Global timeline and replay

Provide a global recent activity button with chronological events across sources. Replay Mode allows selection of a stored window, stepping play/pause, speed (0.5x/1x/2x/4x), scrubbing, and a clear REPLAY watermark. Reconstruct actual statuses from stored normalized events as far as available; unknown gaps remain visible. The decorative cats may replay from recorded simulation seeds or run separately, but their activity must never be misrepresented as historical telemetry.

---

# 10. OFFICE SYSTEMS: INTERACTIVE OBJECTS, AMBIENCE, AND MICRO-STORIES

The office must have dozens of small details, not just seven chairs.

## 10.1 Interactive set pieces

- **Hermes desk:** opens manager/session overview.
- **Agent desks:** open respective workstation panel.
- **Corkboard:** opens task board.
- **Server rack:** opens service status and optional GPU usage if available through approved read-only sources. This is not a control panel for restarting services.
- **Whiteboard:** opens project/architecture overview only if real non-sensitive data exists; otherwise tasteful office decor.
- **Coffee machine:** click to play a short cosmetic animation, perhaps an employee visits it when idle.
- **Window:** cycles decorative scene or changes the ambience; does not imply real weather.
- **Couch:** observe Biscuit's sleep; small click reaction.
- **Cat food bowls / toy:** click to trigger bounded cosmetic pet interactions.
- **Lights:** optional scene brightness control, not workstation lights.

## 10.2 Physics, layering, and movement

Use a collision-aware navigation graph or grid with static obstacles and dynamic reserved tiles. Characters need not have high-end crowd simulation, but should not pass through desks or overlap in ridiculous ways. Provide sensible priority for animation and path requests. Implement depth sorting by projected ground position to achieve believable occlusion; floor tiles, prop bases, actors, and overhead pieces must draw in correct order. Puddles and paper piles render in the right layer. Keep the camera/cursor mapping correct at every zoom.

## 10.3 Decorative monitor animations

Every workstation should have distinct tiny animated monitor activity appropriate to its role. **This is a visual symbol, not a reproduction of private source files by default.** Miniature code rain, diagrams, palette swatches, test lines, and security waveforms are purely decorative. When an actual tool event occurs, change motif/state appropriately, but never present fabricated source text as actual code.

## 10.4 Ambient sound design

Add an optional locally bundled soundscape: soft keyboard ticks, coffee machine, subtle office room tone, cat meows/purrs, occasional printer noise, tiny positive chime when a task genuinely finishes. Keep levels subdued. Include Master, Ambience, UI, and Cats sliders; mute toggle; preserve settings. No forced autoplay. Respect browser gesture policies and reduced sensory preferences.

## 10.5 Delightful special moments

- Rare tuxedo zoomies through a clear office route.
- Biscuit wins a chair standoff.
- Celebration when an observed task completes.
- Nervous reaction to an observed error.
- Tiny team gathering when a significant multi-agent job completes, if event correlation supports it.
- Decorative achievement-like badges for harmless cat antics, e.g. "Coffee Incident #7" (labeled simulation; never actual task metrics).
- A little "employee of the month" board with rotating wholesome flavor.

No random ambient event should turn into a loud, blocking, or unskippable cutscene.

---

# 11. REALISTIC WORKSTATION STATUS AND DATA PROVENANCE

## 11.1 Status UI

Every agent's inspector should expose:

- Source: Hermes or OpenCode.
- Session and agent ID where safe.
- Task title or fallback label.
- Actual current state and last observed event.
- Last update time and live stream connectivity.
- Confidence indicator for inferred classifications.
- A **Source Details** disclosure showing which event supports the status, without showing secret fields.

If activity isn't exposed, show "Live status unavailable". Never invent a stream of code changes.

## 11.2 Testing metrics must be honest

Do not display fake counters such as "18/20 tests passed" unless there is actual parseable output supporting that exact count. Likewise, do not show fake token totals, fake throughput, or made-up GPU utilization. If data is unavailable, hide the metric or show Unavailable.

## 11.3 Start with minimal safe instrumentation

Recommended initial event subset:

- session start/stop/status
- active agent ID
- tool name and lifecycle, without sensitive arguments
- sanitized file-changed path
- test start/end and parseable result
- recognized task delegation and completion
- integration connect/disconnect/errors

Then add richer details after privacy tests. This is preferable to over-collecting everything and attempting to redact it later.

## 11.4 Source trust and replay distinction

Use badges: `LIVE`, `DEMO`, `REPLAY`, `DERIVED`, `STALE`, `DISCONNECTED`. Demo mode should ship with a great self-contained scenario that exercises every worker, handoffs, testing, review, cat interactions, panel expansion, and task board. **The demo can be dramatic and charming, but must always be unmistakably labeled simulation.**

---

# 12. ASSET PRODUCTION PIPELINE

## 12.1 Art bible before scale production

Create `docs/ART_BIBLE.md` including:

- Core style keywords, lighting model, palette with color values.
- Perspective and camera projection rules.
- Tile dimensions and character scale.
- Animation FPS, frame dimensions and naming conventions.
- Character silhouette and costume rules for each role.
- Cat silhouette, colors, and expressions.
- Prop families and semantic layers.
- UI typography and iconography.
- Ambient effects and accessibility variants.
- At least one assembled visual reference sheet / screenshot of the actual rendered scene, produced locally.

Do not keep generating unrelated art with inconsistent palettes. Establish a coherent small collection first, then expand.

## 12.2 Local generation and cleanup

If ComfyUI works safely and has VRAM headroom, use it to generate **concepts or illustrations**. For production pixel art, refine or redraw into controlled sprites; use deterministic programmatic methods where appropriate. Do not imply ComfyUI automatically generates consistent spritesheets. Maintain an export process that checks dimensions, transparency, and pixel grid alignment.

Use the installed asset catalog and approved free packs where helpful. Do not use bought assets or remote paid APIs. Record all origins and licenses. Do not insert Pokémon or another franchise's sprites from the web into the production app.

## 12.3 Asset validation

Automate checks for:

- Missing files and broken atlas references.
- Unexpected dimensions or frame counts.
- Transparent background correctness.
- Consistent frame origins / pivots.
- Nearest-neighbor scaling where intended.
- File naming and metadata completeness.
- Undeclared external assets or URLs.
- Atlas loading in Phaser.

Keep source PSD/Krita/Pixelorama files if available, but serve optimized exported assets in the app.

---

# 13. PERFORMANCE AND RESOURCE BUDGETS

This app should remain pleasant to run on the workstation alongside active inference.

**Targets, not guarantees:**

- Aim for 60 FPS at normal 1080p desktop office view on typical current GPU hardware, with graceful 30 FPS cap when backgrounded or under load.
- Office scene ready within a reasonable local startup window; avoid loading huge unoptimized art bundles.
- Avoid unbounded asset or history memory usage; use sprite atlases and event-window virtualization.
- No GPU-intensive ComfyUI inference just to animate idle agents or cats.
- No GLM calls for ambience, cat decisions, or status narration.
- Keep event processing separate from render loop; batch incoming events at safe intervals.
- Avoid SQLite writes for every animation tick. Persist telemetry, not ambient frame-by-frame state.
- Cap concurrent visual particles, pathfinding requests, sounds, and outstanding HTTP requests.
- Profile after implementing a full scene; report actual FPS, memory, and event processing throughput.
- Provide performance settings: reduced effects, FPS cap, particle toggle, optional shadow/lighting toggle, cat activity frequency, audio level.
- Respect reduced motion preferences and supply a way to pause decorative world simulation while leaving telemetry live.

Use `requestAnimationFrame` or Phaser's loop appropriately. Do not build dozens of competing `setInterval` loops or leak listeners on React remounts.

---

# 14. ACCESSIBILITY AND EXPERIENCE QUALITY

- All important data available through conventional accessible HTML controls, independent of canvas exploration.
- Keyboard navigation among agent list, task board, and inspector controls.
- Visible focus outlines and accessible labels.
- Sufficient text contrast in panels; color alone must not indicate error/success.
- Responsive inspection panels for narrower browser widths; on mobile, prioritize a readable list-and-details mode rather than squashing the entire office.
- Reduced motion mode tones down zoomies, particles, camera animations, and celebrations while keeping status changes visible.
- Pause/disable ambient simulation without pausing real telemetry.
- Sound off or opt-in by default, with independent controls.
- Nonblocking notifications and lightweight error toasts.
- Helpful empty states, offline states, and loading states.
- Friendly keyboard shortcuts only if documented and not conflicting with inputs.
- Display connection health and stale data prominently enough to avoid misleading users.

---

# 15. SECURITY MODEL AND LOCAL DEPLOYMENT

Agent HQ must never become a back door into the workstation.

- Local-only service binding by default.
- No external analytics, tracking pixels, cloud logs, or CDN-only runtime assets.
- Never publish a public dashboard accidentally.
- Docker adapters use read-only accesses and scoped credentials when needed; do not mount Docker socket into an internet-facing service.
- Do not collect or expose API keys, tool secrets, hidden model reasoning, user chat contents, unapproved source diffs, or private files.
- Sanitize data **before persistence**, and defense-in-depth sanitize on presentation.
- Treat external event content as untrusted; escape rendered strings, prevent script injection, limit payload sizes, and sanitize paths.
- Use allowlisted project roots for optional artifact previews; no arbitrary path parameter file server.
- If project-specific artifacts are sensitive, opt out by default.
- Do not persist screenshot imagery unless explicitly selected and necessary; document retention and deletion.
- Event database and local config must have restrictive file permissions.
- Do not provide write actions into Hermes/OpenCode, shell control, restart controls, or container management from the normal HQ UI.
- If packaging with Tauri, use minimal Tauri capabilities and origin restrictions. Keep sidecars scoped and non-privileged.
- Include automated security tests for malformed events, secrets in payloads, unauthorized file access attempts, cross-origin WebSocket requests, and path traversal.

Make a `docs/SECURITY_MODEL.md` with data flow, threat model, trust boundaries, retention behavior, and all remaining limitations.

---

# 16. TESTING STRATEGY: REAL BEHAVIOR, NOT JUST PRETTY SCREENSHOTS

Create a proper test matrix spanning simulation, backend, rendering, UI, integration, and deployment.

## 16.1 Simulation unit tests

- Seeded RNG generates reproducible cat behavior.
- Pixel walks, sprints, and enters/exits states legally.
- Biscuit spends most of time resting and moves markedly slower in statistical simulation tests.
- Misbehavior respects per-prop cooldowns, agent availability, and valid targets.
- Incidents always resolve and restore prop state.
- Path planning avoids static obstacles and resolves dynamic blockage.
- Cosmetic simulation never calls file or shell mutation APIs.
- Disabling ambient simulation preserves real telemetry state.
- Worker work status and worker cosmetic animation state never overwrite each other.

## 16.2 Telemetry backend tests

- Normalize real-style sample events for Hermes and OpenCode.
- Reject malformed payloads and unknown oversized fields.
- Deduplicate repeated events.
- Handle out-of-order events and timestamp differences.
- Reconnect/resume from last known sequence.
- Mark gaps when upstream stream cannot replay lost events.
- Recover from dropped adapter connection and restart.
- Redact embedded fake secrets before storage and transport.
- Ensure raw reasoning-related events are not persisted or displayed.
- Keep correct agent/session/task attribution.
- Generate accurate derived status from permitted evidence.
- TTL and stale-state behavior works.
- SQLite migrations, retention, and pagination work.

## 16.3 Frontend unit/component tests

- Agent selection correctly opens corresponding workstation.
- Panels expand/collapse without losing live state.
- Task board shows actual events and won't invent stages.
- Event filters, auto-follow, time formatting, history search work.
- Live/Replay/Demo badges always reflect actual mode.
- Disconnected adapters produce visible honest states.
- Browser artifacts are displayed only when explicitly permitted.
- Keyboard controls and screen-reader labels work for major interactions.

## 16.4 Playwright E2E tests

Use the installed Playwright CLI and proper repeatable scripts where useful:

1. Launch the app from documented commands.
2. See an actual office scene rather than a blank canvas.
3. Wait for cat animations; validate deterministic test-mode behavior.
4. Click each employee desk and verify exact panel identity.
5. Expand and close workstation panels.
6. Use keyboard-accessible agent list.
7. Open task board, browse demo tasks, and verify explicit DEMO label.
8. Change day/evening/night setting.
9. Toggle sounds and reduced motion.
10. Simulate an upstream disconnect and verify UI says disconnected/stale.
11. Reconnect and verify event deduplication.
12. Exercise history/replay and timeline scrubbing.
13. Resize between 1920x1080, 1366x768, and narrow viewport, ensuring usable layout.
14. Capture screenshots of first launch, idle office, active office, cat mischief, agent panel, expanded view, and task board.
15. Assert zero unexplained browser console errors.

## 16.5 Visual QA with local vision

If the existing GLM image endpoint and OpenCode screenshot integration are actually verified, use the Frontend agent to visually inspect screenshots and identify issues in spacing, perspective, sprites, contrast, layering, framing, and popup positioning. Supplement model critique with deterministic layout checks. Do not treat GLM's visual feedback as authoritative when it conflicts with measurable evidence.

Run at least three explicit **build → screenshot → inspect → fix → retest** cycles across development, not just one ceremonial screenshot at the end.

## 16.6 Source integration proof

A completed live integration milestone requires observed evidence from the actual workstation, not only demo fixtures. Run an **approved harmless OpenCode task in a disposable fixture project** and confirm:

- Session/agent start observed.
- Correct desk lights up.
- Tool event appears, correctly sanitized.
- Completion/test result appears with correct attribution.
- Office returns to an appropriate status.
- Connection loss is shown accurately.
- Agent processes are unaffected by HQ running.

If Hermes lifecycle observation is not verifiable from current mode, report that limitation explicitly rather than pretending a hook succeeded. Retain honest Demo Mode and any functioning OpenCode live adapter.

## 16.7 Performance and stability tests

- Long-running idle test at least 30 minutes (or scripted accelerated simulation where appropriate).
- Burst events with bounded memory and correct ordering.
- Background tab/frame throttling.
- Asset loading failures and fallback behavior.
- Backend process restart.
- Graceful frontend recovery.
- Stress test many retained events without rendering huge DOM lists.
- Measure CPU/memory/FPS and identify regressions.

---

# 17. PHASED DEVELOPMENT: DELIVER A REAL APPLICATION IN WORKING MILESTONES

**Build phases sequentially, but keep continuous end-to-end usability. Each phase ends with tests, screenshots, progress report, and an appropriately scoped Git commit if the repo is clean and Git is available.** Do not stop at a plan. Do not spend the entire budget polishing architecture docs while no office is playable.

## Phase 0: Reconnaissance and foundation

- Inspect folder, existing Agent HQ work, and environment.
- Confirm runtime agent identities and telemetry access.
- Select stack and write brief ADRs for deviations.
- Create initial app shell, shared types, scripts, lint/test configuration.
- Make `pnpm dev` or equivalent work; document startup.
- Create `docs/PROGRESS.md` with a durable milestone checklist and a tiny concise handoff section for future Hermes/OpenCode sessions.

**Exit criteria:** app runs locally, test runner works, project is understood, existing files preserved.

## Phase 1: The beautiful living office

- Build a genuinely appealing isometric/2.5D office, with working camera, correct depth sorting and responsive viewport.
- All seven primary presences clearly identifiable by role.
- All desks clickable with a real styled UI pane, initially fed by a clearly labeled demo fixture.
- Add core furniture, lounge, coffee area, server racks, windows, lighting and decorative detail.
- Add worker idle loops, occasional movement, subtle monitor visuals.
- Add two distinct cat sprites and their different movement speeds/idle patterns.
- Implement audio controls and visual preferences.
- Integrate a polished sample task board.

**Exit criteria:** Somebody opening the app immediately says "this is an actual little game." Not a wireframe, not a generic dashboard. Screenshots of the office and interactive panels exist. Demo labeling clear.

## Phase 2: The full cat personality system

- Build seeded cat FSMs and navigation.
- Implement the required Pixel and Biscuit actions.
- Implement at least 4 tuxedo incidents and 3 fat-cat incidents end to end, with cleanup responses. Additional incidents from spec afterward.
- Add click-to-pet, food bowl interactions, favorite places, expressive reactions.
- Add rare ambient jokes and sensible cooldowns.

**Exit criteria:** Cats behave differently, interact with environment believably, don't glitch through desks, and cannot modify actual work. Tests verify collision, cooldown, resolution and deterministic behavior.

## Phase 3: Read-only telemetry backend

- Implement schemas, source adapters, sanitization, SQLite, snapshot/history endpoints and WebSocket stream.
- Document actual Hermes and OpenCode APIs available in this installation.
- Persist normalized observed events and preserve their provenance.
- Implement reconnect, duplicate suppression, gap signaling, stale status.
- Keep demo/replay separated from live ingestion.

**Exit criteria:** Backend ingests real OpenCode events (and Hermes events if available), a fixture stress test passes, and no external agent operations are modified.

## Phase 4: Live office connection

- Replace demo-driven desk states with actual live data when Live mode is selected.
- Map observed events to consistent worker animation, status indicators, handoff visuals and task board changes.
- Show adapter health, unknown/unassigned events, offline and stale states accurately.
- Verify live activity through an actual disposable test task.
- Ensure cosmetic simulation and live work state are independent.

**Exit criteria:** Real tasks light the correct desks in real time; no fabricated status claims or fake performance metrics.

## Phase 5: Serious workstation explorer

- Implement complete expanded workstations with Overview, Live Activity, Tasks, Files/Diffs, Tests, Browser/Artifacts, Timeline, Diagnostics.
- Make content detailed, searchable, navigable, and safe.
- Implement source provenance, timestamping, explicit redaction and opt-in sensitive previews.
- Provide global timeline and replay.
- Ensure controls remain responsive under a large event history.

**Exit criteria:** The app is genuinely useful for inspecting active development, not just for watching cartoons.

## Phase 6: Visual and sonic polish

- Replace placeholder assets with polished coherent original pixel art.
- Refine character animation, cat movements, environmental events, UI motion and lighting.
- Improve ambient sound and responsive UI.
- Add appropriate particle effects, mini-celebrations and rare Easter eggs.
- Perform multiple local-vision screenshot critiques and fix findings.

**Exit criteria:** Visual quality is cohesive and professional, while performance and readability remain strong.

## Phase 7: Desktop packaging and production hardening

- Evaluate and implement Tauri V2 only if compatible with the tested web/backend architecture.
- Bundle/connect local backend safely, with minimal privileges and a reliable startup/recovery path.
- Make clean-install steps and exact launch commands straightforward for the user's Ubuntu workstation.
- Complete security audits and long-run tests.
- Make telemetry and cat settings persistent.

**Exit criteria:** Reproducible production build, documented Linux launch, no exposure of agent credentials or private endpoints, clean tests. If native packaging is blocked, a robust local web launch is an acceptable documented partial deliverable.

---

# 18. HOW HERMES MUST USE ITS EXISTING AGENT TEAM

Do not create a bunch of new agents for this project. Use the six existing specialized OpenCode roles and the built-in Explorer, sequentially due to the single local GLM inference slot. Avoid duplicated planning/implementation passes for trivial changes.

| Existing role | Primary project responsibility | Recommended tools/skills |
|---|---|---|
| Hermes | Orchestration, decisions, source discovery, acceptance reviews, milestone tracking | Existing OpenCode delegation, safe read-only integration tools |
| Architect | Design telemetry architecture, schemas, security boundaries, isometric model, milestones | Serena read-only, project architecture, targeted reference docs |
| Implementation | Backend adapters, event storage, game systems, cat FSMs, typed logic | Serena, ast-grep, test-driven-development, game systems |
| Frontend | Phaser scene, React panels, aesthetics, animation, responsive layouts | Impeccable, Anthropic Frontend Design, Vercel skills, Playwright, GLM vision |
| Tester | Unit/integration/E2E tests, fixture events, visual correctness checks | Playwright, test methodology, existing quality tools |
| Debugger | Pathfinding bugs, event races, reconnection faults, performance regressions | Serena, systematic-debugging, Chrome DevTools when necessary |
| Security | Data redaction, passive hook safety, local auth, artifact boundaries, dependency review | Semgrep, Gitleaks, Trivy, read-only code inspection |

**Agent roles must be additive, not exclusive.** Hermes may route a feature to Implementation and then Tester, or Frontend and Tester, according to risk and size. Do not insist on all six agents for every tiny change.

**Verification:** Implementer does not self-certify high-risk work. Tester verifies behavior; Security reviews privacy boundaries; Hermes checks exit criteria. Limit self-repair loops and do not silently redefine success criteria to pass tests.

**Budget/context:** Keep OpenCode assignments precise, reference file paths, and request structured status summaries. Use the skill-router and lazy loading instead of injecting whole skill libraries. Keep `docs/PROGRESS.md` updated between sessions so interrupted work can resume without rereading giant chat histories. Do not create long-running parallel agent calls.

---

# 19. USER CONFIGURATION AND CUSTOMIZATION

Provide a tasteful settings panel with persistence:

- Launch mode: Live if available, otherwise explicit Demo or offline state.
- Office camera zoom, reset, and camera-follow preferences.
- Ambient day/evening/night/auto-local-time.
- Decorative weather (none/rain), not a live forecast.
- Cats: enable/disable, activity level, names, pet interaction, peaceful mode (no mischief).
- Worker idle animations and celebration intensity.
- Audio: mute, master, ambience, UI, cats.
- Performance: FPS cap, particles, reduced motion, effects quality.
- Privacy: per-project visibility, safe file paths, optional opt-in diffs/artifacts, history retention.
- Notifications: gentle task completion/error alerts.
- Connection diagnostics and backend status.

No setting may silently turn on hosted inference, upload code, or make the backend public. Keep configuration simple and validated.

---

# 20. DEMO MODE: A DELIGHTFUL, SELF-CONTAINED TOUR

The app must work beautifully even if live agent telemetry is unavailable. Provide a self-contained demo scenario, explicitly labeled **DEMO**, that cycles through believable **simulated** team events:

1. Hermes receives a fictional programming task.
2. Architect reviews a diagram.
3. Hermes delegates to Implementation.
4. Implementation edits a fake sample file in the fixture stream.
5. Frontend reviews a design mockup.
6. Tester detects a simulated failing check.
7. Debugger investigates and fixes a simulated issue.
8. Security reports a fictional finding in the sample fixture.
9. Tester reruns and succeeds.
10. Hermes completes the fictional task; corkboard card moves to Done.
11. Pixel causes at least one cosmetic mess; a worker tidies it.
12. Biscuit occupies a chair, yawn-stretches, and goes back to sleep.

All text and metrics in this scenario must be labeled demo and live in a dedicated fixture namespace. This is necessary for development, automated tests, and showcasing the app, but it must never appear as real workstation activity.

Provide a clear button to restart the demo and a switch to Live when configured. Do not mix live telemetry with the demo data store.

---

# 21. TROUBLESHOOTING, RECOVERY, AND OPERATIONS

Provide exact working startup commands and a `scripts/doctor` utility that checks:

- Node/package toolchain.
- Local app server and event backend.
- Required SQLite path and migrations.
- WebSocket reachability.
- Hermes/OpenCode adapter configuration and source health.
- Network binding (should be local by default).
- Asset manifest integrity.
- Browser/renderer availability.
- Tauri packaging prerequisites if relevant.

Gracefully handle any missing source without crashing the office. Document whether adapters need to be deployed inside a particular container or share a Docker network; do not hardcode `localhost` across unrelated containers. If any hook needs configuration in Hermes/OpenCode's existing environment, make the smallest change, back it up, verify it can be turned off instantly, and prove the coding agent still works unaffected.

**Do not automatically restart GLM, Hermes, OpenCode, Docker, or GPU-intensive services.** Ask before any change that could interrupt the user's work. Do not replace another service's configuration just to make the HQ dashboard connect.

---

# 22. COMPLETION CHECKLIST: NOT NEGOTIABLE

Do not call Agent HQ complete unless the following are actually demonstrated:

### Visual world

- [ ] A polished office renders with correct depth and furniture detail.
- [ ] Hermes and all six custom agents are identifiable.
- [ ] Worker animations represent specialty and grounded state.
- [ ] Day/night lighting and environmental ambience work.
- [ ] Camera navigation, interactive props, and responsiveness work.

### Cats

- [ ] Pixel is small, tuxedo-colored, frequently active, fast and mischievous.
- [ ] Biscuit is larger, very slow, sleeps most of the time and rarely wanders.
- [ ] At least four unique Pixel incidents are implemented.
- [ ] At least three unique Biscuit incidents are implemented.
- [ ] Workers visually clean up/recover from cosmetic incidents.
- [ ] No incident can affect production code or services.
- [ ] Clicking each cat provides a fun small interaction.

### Live telemetry

- [ ] At least one real external adapter is verified against installed runtime.
- [ ] Hermes/OpenCode events are normalized and attributed safely.
- [ ] The app shows true connection/offline/stale state.
- [ ] Live updates have correct ordering and reconnect handling.
- [ ] Event history persists and is queryable.
- [ ] Sensitive data and hidden reasoning are never exposed.
- [ ] Demo and replay are unmistakably labeled and isolated.

### Useful monitoring

- [ ] Each desk opens the correct agent inspector.
- [ ] Expanded workstation view is readable and functional.
- [ ] Activity feed, filters, timeline and task board work.
- [ ] File/test/review data are truthful and provenance-labeled.
- [ ] Empty, disconnected and unsupported states are handled gracefully.

### Engineering and delivery

- [ ] Tests for cat state machines and telemetry pass.
- [ ] Playwright browser E2E tests pass.
- [ ] Visual screenshots were inspected and key defects fixed.
- [ ] No critical browser console errors.
- [ ] Privacy/security review performed with existing tools.
- [ ] Reproducible local launch documented.
- [ ] Git working state and milestones are clearly reported.
- [ ] User can run the app from this project directory without guesswork.

If an item is not achieved, mark it incomplete and explain the blocker. Do not claim "complete" because only the demo works or because the feature exists as a static mockup.

---

# 23. REQUIRED PROJECT DOCUMENTATION AND OUTPUTS

Keep these files current:

- `README.md`: what Agent HQ is, requirements, setup, launch, controls, privacy, Live/Demo/Replay distinctions.
- `docs/PROGRESS.md`: milestone states, last verified checks, next exact work item, and current blockers.
- `docs/INTEGRATION_AUDIT.md`: what existing Hermes/OpenCode APIs/hooks are really supported.
- `docs/EVENT_SCHEMA.md`: internal schema, examples, source mapping, reconnect/gap logic.
- `docs/ART_BIBLE.md`: art direction and asset specs.
- `docs/SECURITY_MODEL.md`: read-only telemetry, sanitization, threat model, local network boundary.
- `docs/TEST_MATRIX.md`: test cases and actual results.
- `docs/OPERATIONS.md`: launch, stop, health, logging, migrations, backup/recovery.
- `docs/DESIGN_DECISIONS.md`: architecture decisions and deviations with rationale.
- `assets-src/manifest.json`: actual art origins and licenses (or equivalent).

At each milestone, provide a concise user-facing report with:

1. What is now genuinely playable/useful.
2. What real integrations were verified.
3. Which details remain simulated.
4. Screenshots or local paths to visual evidence.
5. Tests executed and results.
6. Next milestone and any constraints.

**Do not ask the user to do manual steps that Hermes can safely perform.** If a request would require destructive changes or privileged access to an existing service, stop only that portion and continue independent implementation. Never promise background work after the current run without an actual scheduling mechanism.

---

# 24. INITIAL EXECUTION ORDER: START BUILDING NOW

Your very first actions in this folder must be:

1. Confirm this Markdown file's parent directory is the project root. Print the path.
2. Inventory files and Git; preserve any existing Agent HQ work.
3. Audit available tools, agents, event interfaces, and asset pipeline.
4. Write a very short implementation plan in `docs/PROGRESS.md` while preserving this brief's scope.
5. Start building the polished web-first office with a working demonstration and actual cats.
6. Wire the first honest telemetry adapter as soon as the vertical slice exists.
7. Implement clickable live workstations and the task board.
8. Iterate using Playwright browser interaction, screenshots, and verified local vision if available.
9. Continue through the phases, testing and documenting each.

**One crucial guardrail:** Don't spend the entire first development session on source auditing, documentation, asset browsing, or conceptual planning. The office must become visible and interactive early. Let the quality improve through functional milestones. Do not call work complete until the app itself works.

**One crucial creative requirement:** This should be a joyful little world. The cats, characters, subtle jokes, tactile desk interactions, cozy atmosphere, and genuine live activity all matter. Keep the soul of the idea intact throughout implementation.

---

# 25. FINAL ACCEPTANCE SCENARIO: WHAT THE USER SHOULD SEE

The user launches **Agent HQ** on the workstation and sees a cozy, detailed pixel-art office. Hermes is near the task board. Six specialists are at their own stations. A tuxedo cat sprints under a desk and chases a toy. A fat cat is asleep on the couch with a tiny rising-and-falling belly.

The user gives Hermes a real development task outside the app. A **verified live event** reaches Agent HQ. Hermes becomes active, a task note appears on the board, and the appropriate worker receives a folder animation only if a handoff actually occurred. The user's selected agent types at a tiny monitor. Clicking that computer opens a gorgeous live panel showing the actual sanitized source-backed session, recent tool calls, task status, files, and test results. Expanding the computer shows a full, usable activity explorer.

Meanwhile, Pixel knocks over a decorative coffee mug. The employee reacts, cleans it up at an appropriate moment, and the real coding process continues uninterrupted. Biscuit opens one eye, watches the catastrophe, and returns to sleep. A real test finishes; if passing, the appropriate desk indicator turns green. The corkboard advances the real task. If a connection goes down, the office says **Disconnected** instead of pretending work continues. If the event source cannot expose some data, the UI says **Unavailable** instead of making it up.

The world is attractive enough to leave running all day. The monitoring features are accurate enough to be useful at work. The cats are entertaining enough to make the app memorable.

**That is the product. Build it.**

---

## End of master directive
