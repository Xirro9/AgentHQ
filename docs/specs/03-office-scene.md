# Spec 03 — Phaser office scene + React shell (the living office)

You are building the visual heart of AgentHQ: a cozy pixel-art office (Phaser 3) embedded in a React shell. Read `docs/ART_BIBLE.md`, `public/assets/gen/layout.json`, `public/assets/gen/atlas.json`, and `AGENT_HQ_MASTER_BRIEF.md` §1, §5, §6.4 first.

Hard constraints: TypeScript strict, no new npm dependencies (phaser/react/react-dom/zod only), textures come ONLY from the generated atlas, placement ONLY from layout.json. Do not edit `assets-src/`, `src/server/`, `src/shared/events.ts`, `src/sim/` (they exist or are being built in parallel — if `src/sim/cats.ts` is missing, stub a minimal `CatCore`-shaped import behind a local interface and wire it so the real one drops in).

## Files to create
1. `src/client/net/store.ts` — framework-free reactive store:
   ```ts
   export type Mode = 'live' | 'demo' | 'replay' | 'disconnected'
   export interface HqState { mode: Mode; events: NormalizedEvent[]; agentStates: Record<AgentId, {state: WorkState; since: string}>; selected: AgentId | null; ambience: 'day'|'evening'|'night'|'auto'; settings: {...} }
   export const store = { get(), subscribe(fn), set(patch), select(agentId), addEvents(events: NormalizedEvent[]) (cap 500, dedupe by eventId), setAgentStates(...) }
   ```
   Pure pub/sub. `addEvents` keeps newest 500, sorted by ingestSeq.
2. `src/client/net/useHq.ts` — React hook: subscribes to store; opens WebSocket to `ws(s)://location.host` + `/ws` (vite proxy handles dev); sends `{type:'hello', lastSeq:0}`; handles snapshot/event/mode/ping; exponential backoff reconnect with jitter (1s..15s); sets mode: 'demo' when server says so, 'live' when receiving non-demo events, 'disconnected' when socket down; on snapshot+every 5s polls `GET /api/states` and `GET /api/health` (debounced) → setAgentStates/mode.
3. `src/client/office/BootScene.ts` — loads `assets/gen/atlas.json`, every sheet PNG in it, and `assets/gen/layout.json`. Adds all frames to textures. Shows a tiny "waking the office…" text (HTML overlay handles the pretty loader — keep canvas text minimal).
4. `src/client/office/OfficeScene.ts` —
   - Render order: floors (layout.floors as one Image each or a RenderTexture — your choice, must handle 360 tiles at 60fps), then wall sprites + furniture from layout.sprites with `depth = y + frameHeight` (y-sort). Store interactive metadata.
   - `layout.workstations`: for each, spawn worker sprite (sheet `agent_<id>`, frame `sit_idle_0`, origin bottom-center at worker.x+8, worker.y+24) and register hit area over desk+monitor+chair rect (desk.x-4..+36, desk.y-24..+20) with `setInteractive` → on pointerdown `store.select(id)` + `window.dispatchEvent(new CustomEvent('agenthq:focus-desk', {detail:{agentId}}))`. Hover: subtle brightness tween + tooltip event `agenthq:hover` {agentId, x, y (screen px)}.
   - Interactables (layout.interactables): pointerdown dispatches `agenthq:interact` {kind}.
   - Camera: drag to pan (clamped to world bounds), wheel zoom 0.6..1.8 toward pointer, `agenthq:camera-reset` recenters; keyboard arrows pan. Respect `prefers-reduced-motion` (no smooth tweens).
   - Ambience: `store.ambience` ('auto' → device local hour) picks window frame (`window_day/evening/night`) and a scene tint overlay: day none, evening warm amber multiply ~12%, night navy multiply ~28% + lamp/monitor glow sprites (additive alpha circles — generate at runtime with Graphics, they are light, not art). Transitions tween 1.5s.
   - Decorative monitor flicker: each workstation monitor sprite alpha oscillates 0.85..1.0 (sin, different phase); server rack frames cycle every 800ms.
5. `src/client/office/workers.ts` — WorkerActor class: owns sprite, cosmetic FSM + true state separately. Anim mapping (from atlas): working→`sit_type_0/1` loop; testing→same + amber status pip; failed→`react_0` 1.2s then back + red pip; completed→`celebrate_0/1` ×2 then idle; waiting→`sit_idle` + violet pip; planning→`think_0/1`; idle→`sit_idle_0/1` blink loop. Cosmetic scheduler (seeded Rng per agent): when true state is idle/working, occasionally (every 25-70s) stand + `walk_down/side` 2-4 tiles to a nearby point (coffee machine for debugger, whiteboard for architect, window for frontend) then return; NEVER during testing/reviewing/failed. Cosmetic state never overwrites the pip/tooltip state.
6. `src/client/office/cats.ts` — instantiate `CatCore` (from src/sim) with `buildWorld(layout)`; in `scene.update(time, delta)` call `core.update(dt)`; apply returned events: move sprites (pixel: sheet `cat_pixel` frames walk_0..3 at 8fps, run_*, sit_*, loaf, sleep; biscuit: `cat_biscuit` sleep_0..2 breathing 1fps, waddle, sit, stretch), render messes (`fx.puddle` etc.) at mess coords, hearts on purr, `exclaim` bubble above a worker for 1.5s when a mischief starts near their desk. Cats y-sorted with furniture. Clicking a cat → `agenthq:pet` → `core.pet()` + heart.
7. `src/client/App.tsx` — full-viewport layout: Phaser canvas container (mount BootScene→OfficeScene, scale FIT, pixelArt: true, backgroundColor #12101f); overlays:
   - HUD top-left: mode badge (LIVE teal / DEMO amber / REPLAY violet / DISCONNECTED red — solid chip, small, uppercase) + project label ("demo fixture" in demo mode) + tiny clock.
   - Top-right: agent status strip — 7 chips (color from AGENTS catalog, state text, pip dot; click = select).
   - Bottom-center hint text ("drag to pan · scroll to zoom · click a desk").
   - Tooltip div following `agenthq:hover` (dark plum bg, cream text, 1px violet border, 12px font).
   - Minimal CSS in `src/client/styles.css` — palette: bg #12101f, panels rgba(35,35,61,.92), cream text #f2e6d8, violet accents. Rounded 10px, subtle shadow. No UI framework.
8. `src/client/main.tsx` + `src/client/office/bridge.ts` (window CustomEvent helpers, typed) as needed.

## Acceptance criteria (run them)
1. `npx tsc -p tsconfig.json --noEmit` exit 0 (if src/server/state.ts doesn't exist yet, do NOT import it — poll /api/states only; leave a TODO).
2. `npm run build` exit 0.
3. `npx vite --port 5199 &` then `curl -s localhost:5199 | grep -o '<div id="root">'` works; `curl -s localhost:5199/assets/gen/atlas.json | head -c 80` returns JSON.
4. If Playwright CLI is available (`playwright-cli`), open the page, wait 3s, screenshot to /tmp/office.png, assert no console errors. If unavailable, note it — the orchestrator will verify visually.

Report: files, build output tail, any deviations (especially sim stubs).
