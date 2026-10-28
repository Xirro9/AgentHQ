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
- [x] Phase 0b: environment audit + scaffold + toolchain verified
- [x] Phase 1: living office (scene, camera, depth, desks, HUD, demo fixture, idle loops, basic cats, audio controls) — spec sessions 01-03
- [x] Phase 2: full cat personality system (FSMs, incidents, cleanup, petting) — spec session 02
- [x] Phase 3: read-only telemetry backend (schema, adapters, SQLite, WS, reconnect, gaps) — spec sessions 01+05
- [x] Phase 4: live office connection — demo-driven with honest mode badges; Hermes live integration LANDED in session 06 (hook→JSONL bridge, `hermes: connected`); opencode adapter still experimental/disconnected (see INTEGRATION_AUDIT.md)
- [x] Phase 5: workstation explorer (tabs, filters, history, replay) — spec sessions 04+05
- [ ] Phase 6: visual/sonic polish + vision-QA cycles — partially covered by per-session vision QA; superseded by the deferred Living Diorama pivot (docs/ART_PIVOT_LIVING_DIORAMA.md)
- [ ] Phase 7: packaging/hardening (Tauri evaluation, dev-only npm audit bumps, esbuild scripts policy)

## Current status

- Phase 0b done: scaffold + art pipeline (242 frames, QA'd visually via 2 critique cycles) + world layout + doctor. Commit 0d0a9df.
- Specs 01-05 under docs/specs/. Session pipeline (sequential, one GLM slot):
  - 01-server ✅ verified (tsc strict, 25/25 vitest, live boot: health/snapshot/states/WS all confirmed; opencode adapter honestly 'disconnected'). Commit af035f7.
  - 02-cats ✅ verified (tsc, 34/34 tests incl. 9 cat-sim tests; seeded determinism, biscuit rest fraction 0.67–0.74 in band, speed ratio >6x). Commit c00eca5.
  - 03-office-scene ✅ verified (tsc strict, build, 34/34 tests, Playwright: office renders, HUD live vs demo backend, desk hover/click/tooltip, wheel zoom + camera reset, pet→hearts, reduced-motion clean, 0 console errors). Store/useHq/Boot/Office/WorkerActor/CatLayer + bridge; sim untouched (client-side blocked rects + target alignment only).
  - 04-panels-ui ✅ Hermes-verified (independent re-run: tsc 0, build 0, 59/59 vitest, hermes verify ok=true, Playwright click-through: Hermes DeskPanel opens with live feed + cohesive styling, task-001 cycling columns, 62s idle 0 console errors). Commit aeed6ac. Architecture adopted: fps cap = game loop fpsLimit (App), cat gates = CatLayer.applyGate (sim untouched), settings = store.updateSettings (validate+persist+CustomEvent).
  - 06-container-bridge ✅ Hermes-verified (Hermes hook events → `scripts`-external writer `/opt/data/hooks/hermes_hook_log.py` → `data/hermes-events.jsonl` → new `src/server/adapters/hermes.ts` file-tail adapter → sanitize → db/WS; env-configurable bind `AGENTHQ_HOST`/`AGENTHQ_PORT` (defaults byte-identical 127.0.0.1/4310); session-id pseudonymization (raw `local-<64hex>` never emitted); independent security review: no critical/high, M2 wedge + L1 unguarded timer + L4 FIFO fixed, M1/L2 recorded DEFERRED in INTEGRATION_AUDIT.md; live-verified: fresh `hermes -z` session auto-captured (on_session_start → pre/post_tool_call → on_session_end), 0 dup ids across 148 live events, health via container eth0 IP). Config side: 7 hook events in config.yaml + surgical allowlist (7 pairs), `hermes hooks doctor` all green. Host visibility = one-time container restart with `-p 127.0.0.1:4310:4310` (host-loopback only). Commit 038ab67.
  - 05-replay-hardening ✅ Hermes-verified (independent re-run: tsc 0, build 0, 81/81 vitest; Playwright click-through: Activity drawer → ↺ Replay → "last 5m" → transport/speeds/scrubber present → after Play the feed populates live ("all sources · 7 events"); docs EVENT_SCHEMA/OPERATIONS/SECURITY_MODEL/TEST_MATRIX + scripts/e2e.md + docs/evidence/ screenshots). Replay = pure ReplayTimeline (src/client/net/replay.ts) + ReplayBar; perf.ts = fps cap w/ visibilitychange + particle budget + timer map. NOTE: full `hermes verify` initially blocked by approval queue; re-run approved and PASSED (ok=true, readiness 200) — spec 05 fully closed.
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
