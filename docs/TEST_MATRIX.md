# TEST MATRIX — actual coverage and results

Verified 2026-10-28 after spec-05 landing. Canonical gates: `npm test`, `npx tsc -p tsconfig.json --noEmit`, `npm run build`, `hermes verify --json` (bootstrap→build→test→readiness), `node scripts/doctor.mjs`.

| Area | File | What it proves | Status |
|------|------|----------------|--------|
| Sanitization | tests/server.test.ts | unknown-key stripping, token redaction, oversize rejection, schema validation | ✅ 25/25 |
| Persistence | tests/server.test.ts | insert/dedup/snapshot ordering/filtered queries (node:sqlite WAL) | ✅ |
| State derivation | tests/server.test.ts | §6.2 states from evidence (working/testing/failed/completed/idle/stale) | ✅ |
| Seeded determinism | tests/cats.test.ts | same seed + schedule → identical event logs | ✅ 9/9 |
| Cat behavior stats | tests/cats.test.ts | Biscuit rest fraction in 0.6–0.88 band; Pixel ≥1.4× Biscuit speed | ✅ |
| Incident lifecycle | tests/cats.test.ts | cooldowns enforced, messes always resolve, activeMesses() drains | ✅ |
| Pathfinding | tests/cats.test.ts | A* routes around blocked rects, never enters them | ✅ |
| Sim purity | tests/cats.test.ts | no phaser/react/node-builtin imports in src/sim | ✅ |
| Replay clock | tests/replay.test.ts | virtual-time stepping, speed multipliers, window subsets | ✅ 22/22 (in 81 total) |
| UI logic | tests/ui.logic.test.ts | task-column derivation (role ≠ testing stage), filters, relative time, settings validation | ✅ 25/25 |
| E2E (playwright-cli) | tests/e2e/ + scripts/e2e.md | app boots, office renders, panels per agent, replay smoke, 30s idle, 0 console errors | ✅ + evidence in docs/evidence/ |
| Idle soak | manual note | 6-min supervised probe: heap flat 40→40 MB, badge correct, 0 errors; **full 30-min window not automated** | ⚠️ partial |

## Known gaps (documented, not hidden)
- 30-minute automated soak (spec 05 #3) — manual note only; 6-min probe clean.
- Hermes live adapter — deferred with honest UI state until gateway hooks are verified in this deployment (INTEGRATION_AUDIT.md).
- OpenCode live adapter — experimental; probes the real endpoint, shows DISCONNECTED honestly, never fabricates events.
- Dev-only npm audit: tinypool (critical) + @vitest/mocker (moderate) — queued for Phase 7.
