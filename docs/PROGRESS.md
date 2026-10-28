# PROGRESS

Durable milestone tracker. Update after every verified milestone. Keep terse — future sessions resume from here, not from chat logs.

## Handoff notes (for future Hermes/OpenCode sessions)

- Project root = this repo (contains AGENT_HQ_MASTER_BRIEF.md). Single npm package (monorepo intentionally not used at this scale — brief §4.2 allows adaptation).
- Art is generated: `assets-src/generate_sprites.py` (PIL) → `public/assets/gen/*` + atlas JSON + `public/assets/gen/manifest.json`. Never hand-edit exported PNGs; edit the generator and re-run it.
- Palette + scale rules live in docs/ART_BIBLE.md. Cat sim must stay pure TS in `src/sim/` (no Phaser imports) so it stays unit-testable.
- Telemetry is demo-first: OpenCode adapter is experimental until its event API is verified against the installed binary (see INTEGRATION_AUDIT.md). UI must show honest mode badges (LIVE/DEMO/REPLAY/DISCONNECTED).
- Node 26: use built-in `node:sqlite` — do NOT add better-sqlite3 (native build).
- Verify claims with real runs: `npm run build`, `npm test`, Playwright screenshots.

## Milestones

- [x] Phase 0a: repo cloned, brief committed, README published
- [ ] Phase 0b: environment audit + scaffold + toolchain verified  ← IN PROGRESS
- [ ] Phase 1: living office (scene, camera, depth, desks, HUD, demo fixture, idle loops, basic cats, audio controls)
- [ ] Phase 2: full cat personality system (FSMs, incidents, cleanup, petting)
- [ ] Phase 3: read-only telemetry backend (schema, adapters, SQLite, WS, reconnect, gaps)
- [ ] Phase 4: live office connection (real events drive desks; honest provenance)
- [ ] Phase 5: workstation explorer (tabs, filters, history, replay)
- [ ] Phase 6: visual/sonic polish + vision-QA cycles
- [ ] Phase 7: packaging/hardening (Tauri evaluation)

## Current status

- Phase 0b done: scaffold + art pipeline (242 frames, QA'd visually via 2 critique cycles) + world layout + doctor. Commit 0d0a9df.
- Specs 01-05 under docs/specs/. Session pipeline (sequential, one GLM slot):
  - 01-server ✅ verified (tsc strict, 25/25 vitest, live boot: health/snapshot/states/WS all confirmed; opencode adapter honestly 'disconnected'). Commit af035f7.
  - 02-cats ✅ verified (tsc, 34/34 tests incl. 9 cat-sim tests; seeded determinism, biscuit rest fraction 0.67–0.74 in band, speed ratio >6x). Commit c00eca5.
  - 03-office-scene ✅ verified (tsc strict, build, 34/34 tests, Playwright: office renders, HUD live vs demo backend, desk hover/click/tooltip, wheel zoom + camera reset, pet→hearts, reduced-motion clean, 0 console errors). Store/useHq/Boot/Office/WorkerActor/CatLayer + bridge; sim untouched (client-side blocked rects + target alignment only).
  - 04-panels-ui (frontend agent) — IN FLIGHT (first launch killed by foreground timeout; relaunched clean)
  - 05-replay-hardening — queued
- Lesson learned: never `git add -A` while an OpenCode session is running — 0b2a05e accidentally committed a broken in-flight src/sim (repaired by session 02; targeted adds only from now on).
- Client shell bootstrap landed (loader overlay in src/client/App.tsx; scene agent extends it). Full `hermes verify --json` gate: ok=true (bootstrap/build/test OK, readiness 200). Commit 0b2a05e.

## Blockers

- none

## Deferred directive (user decision 2026-10-28)

- **"The Living Diorama" visual redesign** (illustrated 2.5D dollhouse style replacing pixel art) — full directive preserved verbatim in docs/ART_PIVOT_LIVING_DIORAMA.md. User said "do the art one later". Execute ONLY after specs 03–05 are verified AND the user green-lights it. Note: its §9 (fix indefinite loading / diagnostics without live integrations) overlaps with current work — the office scene landing IS the loading fix; the diagnostics hardening belongs to spec 05.

## Queued fixes (apply at next session boundary — do NOT touch node_modules while an OpenCode session is running)

- ~~@fastify/static upgrade~~ DONE at session-01 boundary (af035f7).
- Remaining npm audit: dev-only tinypool (critical) + @vitest/mocker (moderate) — dev-only exposure; bump vitest major at Phase 7 hardening, not mid-pipeline.
- esbuild postinstall blocked by install-scripts policy — harmless (vite build works) but consider `npm install-scripts approve esbuild` for clean installs.
