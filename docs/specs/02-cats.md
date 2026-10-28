# Spec 02 — cat simulation core (pure TypeScript)

You are implementing the two autonomous cats' simulation brain for AgentHQ. This is a PURE module: no Phaser, no React, no imports from src/server or src/client, no filesystem, no timers of its own — the engine calls `update(dt)`. Everything must be deterministic from a seed.

## Read first
- `AGENT_HQ_MASTER_BRIEF.md` §7 (cats: behaviors, cadence numbers, incidents), §2 rule 2 (simulation vs reality), §16.1 (simulation tests).
- `public/assets/gen/layout.json` → `cat_routes`, `spawn` (world coordinates, logical px).
- `src/sim/` may import ONLY from `src/sim/*` and `src/shared/events.ts` (for types only if needed).

## Files to create
1. `src/sim/rng.ts` — `class Rng { constructor(seed: number); next(): number (0..1); int(minIncl, maxIncl): number; pick<T>(a: T[]): T; chance(p: number): boolean }` (mulberry32 or similar).
2. `src/sim/world.ts` —
   ```ts
   export interface SimWorld {
     walkable(x: number, y: number): boolean
     path(from: {x,y}, to: {x,y}): {x,y}[]          // 4-dir A* on 16px grid, max 400 expansions, fallback straight line
     targets: Record<string, {x,y}>                  // named interest points
     blocked: {x,y,w,h}[]                            // furniture rects (fed from layout by caller)
   }
   export function buildWorld(layout: { cat_routes?: any; spawn?: any }, extraTargets?: Record<string,{x,y}>): SimWorld
   ```
   Default targets: dev_keyboard, printer, plant, cable_corner, couch, security_monitor, architect_keyboard, doorway_lounge, papers_table, food_bowls, window_seat, toy, box.
3. `src/sim/cats.ts` — the core:
   ```ts
   export type MessId = 'puddle' | 'papers' | 'cable' | 'plant_tilt' | 'paper_jam'
   export type CatEvent =
     | { type: 'moved'; cat: 'pixel'|'biscuit'; x: number; y: number; facing: 'left'|'right' }
     | { type: 'state'; cat: 'pixel'|'biscuit'; state: string }
     | { type: 'mischief_started'; cat: 'pixel'|'biscuit'; incident: string; target: string }
     | { type: 'mess_created'; mess: MessId; x: number; y: number }
     | { type: 'mess_cleaning'; mess: MessId; by: string }
     | { type: 'mess_cleaned'; mess: MessId }
     | { type: 'incident_resolved'; incident: string }
     | { type: 'purr'; cat: 'pixel'|'biscuit' }

   export class CatCore {
     constructor(world: SimWorld, seed: number)
     pixel: CatAgentView; biscuit: CatAgentView      // x,y,facing,state,path
     update(dt: number): CatEvent[]                  // fixed-step friendly; drains events
     pet(cat: 'pixel'|'biscuit'): CatEvent[]         // hearts + brief happy state
     assignCleanup(mess: MessId, agentId: string): void
     activeMesses(): { mess: MessId; x: number; y: number; cleaning?: string }[]
     startIncident(name: string): boolean            // manual trigger (tests/demo); false if on cooldown
   }
   ```
   Behavior requirements (numbers from the brief, tunables in a `TUNING` const exported for tests):
   - Pixel: decision check every 4–9s; walk speed 26–38 px/s; zoomies burst 2–4s at ~2.2x speed; mischief cooldown 90–180s (per-incident floor 60s); states: wander, investigate(target), zoomies, sit, loaf, groom, pounce, bat, sleep(short), flee (when worker within 24px during mischief), mischief scenes.
   - Biscuit: 65–85% of wall time resting; walk speed 9–13 px/s; decision check every 20–40s; states: sleep, wake, stretch, waddle, sit, look, occupy (keyboard/chair/printer); rare mischief only (keyboard_occupation, chair_theft, printer_throne, doorway_boulder, slowest_crime).
   - Pixel mischief scenes (8, from brief §7.1): keyboard_cat, coffee_catastrophe (mess: puddle), cable_thief (mess: cable), printer_battle (mess: paper_jam), plant_assassin (mess: plant_tilt), zoomies_scene (no mess), forbidden_warmth, laser_chase. Each: eligibility (cooldown + target free), walk to target, perform (state frames), create mess where applicable, then flee/wander. Resolution: a mess is cleaned when `assignCleanup` called then 6s later `mess_cleaned`; props never stay broken.
   - Biscuit scenes (5, brief §7.2): keyboard_occupation (occupies target 40–90s), chair_theft, printer_throne, doorway_boulder (sits in doorway_lounge 30–60s), slowest_crime (nudges papers → mess 'papers' at absurd slow speed).
   - Cats never leave `world.walkable`; never overlap the same tile; incidents queue behind cooldowns; `activeMesses()` is the single source of mess truth.
4. `tests/cats.test.ts` (vitest) —
   - Seeded determinism: two cores, same seed, same update schedule → identical event logs (deep equal).
   - Statistical: run 600s simulated (fixed dt 0.1) ×3 seeds → biscuit rest fraction within 0.6..0.88; pixel average speed > biscuit average speed ×1.4.
   - Incidents: `startIncident('coffee_catastrophe')` → puddle mess created within 20s sim; `assignCleanup` → cleaned event; second call within cooldown returns false.
   - Pathfinding: path around a blocked rect exists and never enters blocked tiles.
   - Purity: assert the module graph — no imports of 'phaser'/'react'/node builtins (read the file text and regex-imports in the test).
   - Mess lifecycle: all messes eventually cleaned; `activeMesses()` empty after cleanup.

## Acceptance criteria
1. `npx tsc -p tsconfig.json --noEmit` exit 0
2. `npm test` green (server tests from spec 01 must still pass)
3. No modification outside src/sim/**, tests/cats.test.ts
Report: files, test output tail, tuning values used.
