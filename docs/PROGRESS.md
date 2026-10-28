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

- Phase 0b started: environment verified (opencode 2.2.0 + 6 agents, glm-server healthy, node 26, npm 12). Scaffold + art pipeline next.

## Blockers

- none
