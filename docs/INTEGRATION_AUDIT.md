# INTEGRATION_AUDIT

Verified facts about this workstation's environment. "Verified" = actually observed at audit time. Do not code against unverified API names.

## Verified 2026-10-27 (Phase 0b)

- OpenCode **v2.2.0** CLI at `/opt/data/tools/npm/bin/opencode`.
- Agent definitions (six): `architect, implementation, frontend, tester, debugger, security` at `~/.config/opencode/agent/*.md` (frontmatter + system prompt). Built-in `explore` exists.
- Model: GLM-5.3-Flash Q4_K via llama.cpp at `http://glm-server:8080/v1`, health endpoint OK. **One inference slot** — no parallel agent runs.
- `opencode serve` exists ("Start the v2 API and web server", flags: --hostname ...). This is the candidate telemetry source for the OpenCode adapter.
- Hermes agent gateway running locally (Hermes is the orchestrator writing this app).
- ComfyUI 0.43.0 installed (CPU-only, on-demand start/stop scripts). NOT needed for sprite production; original art is generated programmatically.
- Asset library `/opt/data/assets/library` (CC0, cataloged): Kenney UI pack (HUD/buttons), interface sounds (audio), roguelike-rpg tiles, pixel-platformer. Search index works; keyword coverage is limited.
- Node v26.12.1, npm 12.0.2, no pnpm. PIL 13 available via `/opt/hermes/.venv/bin/python`.

## Unverified / to confirm at Phase 3

- Exact OpenCode v2 event-stream paths and event names (`/api/event`, `session.*` names in the brief §8.1 are DOCUMENTED claims, not verified against the installed 2.2.0 binary). Adapter must probe at runtime, degrade honestly to DISCONNECTED/DEMO, and never invent events.
- Hermes lifecycle hooks reachable in this deployment mode (gateway hooks exist; CLI/TUI coverage unverified). Hermes desk status stays "from verified sources only" until then.
- Whether `opencode serve` can run alongside the user's normal workflow without side effects (read-only assumption to be proven with a disposable fixture task).

## Rules for adapters

- Read-only. No writes into Hermes/OpenCode. Fail-open with respect to the dev workflow, fail-closed on data exposure.
- Sanitize server-side before storage/push. No raw payloads to the browser.
