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

## Verified 2026-10-28 (container bridge / Hermes hooks)

- Hermes hook wire format (do not re-verify): a hook command receives **one
  JSON object on stdin** — `{hook_event_name, tool_name, tool_input,
  session_id, cwd, extra}` — plus top-level `args` and `parent_session_id`
  when applicable.
- Hook events mapped by the hermes adapter (authoritative names, verified
  against the installed Hermes VALID_HOOKS): `pre_tool_call` → tool.started,
  `post_tool_call` → tool.completed/tool.failed, `on_session_start` →
  task.started (legacy alias: `new_session`), `on_session_end` →
  agent.stopped, `subagent_start` → agent.started, `subagent_stop` →
  agent.stopped, `kanban_task_claimed` → task.started and
  `kanban_task_completed` → task.completed (taskId = `extra.task_id` when
  present), `gateway_platform_event`/`on_skill_lifecycle` → status.changed.
  Unknown names fall back to `status.changed` at low confidence with the
  native label preserved as `hermes.<hook_event_name>`.
- Consent mechanism: hooks run under Hermes' `hooks_auto_accept` /
  hook-allowlist configuration — the writer side is opted in there; AgentHQ
  only reads the file, it never configures or triggers hooks.
- JSONL file bridge contract: the Hermes-side writer prepends `event_id`
  (uuid string) and `ts` (ISO timestamp) to each hook object, then appends it
  as ONE line to `data/hermes-events.jsonl` (repo-relative; overridable via
  `HERMES_EVENTS_FILE`). The AgentHQ adapter tails that file read-only:
  2s polling (network-mount safe, no fs.watch dependency), tracks
  (inode, size, offset), replays the LAST 1000 complete lines on (re)connect
  and after rotate/truncate, holds trailing partial lines until completed
  (bounded: a newline-free region over 1 MiB is discarded as malformed and
  disclosed via a low-confidence `status.changed` note, so ingestion always
  progresses), never opens non-regular files (a FIFO would block openSync),
  and skips malformed lines silently. Dedupe key: `event_id` when present,
  else sha1 of the raw line. Only whitelisted scalar fields are extracted —
  `tool_input`, `extra` and `args` never reach the normalized event. Raw
  `session_id`/`parent_session_id` values (`local-<64hex>` in practice) are
  replaced with stable pseudonyms (`sess-` + first 10 base64url chars of
  sha256(raw id)) before sanitization — deterministic across restarts,
  distinct per session, and immune to the live-observed collapse where the
  long-hex `[REDACTED]` pattern turned every session into
  `local-[REDACTED]`.
- Container bind: the server runs inside a Docker container and is browsed
  from the host; Docker port publishing forwards to the container's eth0, not
  its loopback, so the container-side bind is env-configurable
  (`AGENTHQ_HOST`, default unchanged `127.0.0.1`) while the host-side publish
  address must stay loopback-only (`-p 127.0.0.1:4310:4310`).

## Known limitations (security review 2026-10-28)

Deferred findings — recorded only, deliberately not fixed in this slice.
Re-entry condition for both: **when AgentHQ is exposed beyond a single-user
workstation or run long-term unattended**.

- **M1 — DEFERRED: global dedupe namespace is spoofable.** Event dedupe keys
  share one global namespace, so anyone with write access to the watched
  Hermes events file can replay another source's `event_id` and suppress that
  source's events. Impact is telemetry integrity only (no data exposure, no
  write path); exploiting it requires local file write access, which is
  already inside the trust boundary (docs/SECURITY_MODEL.md §1). Per-source
  dedupe namespaces would fix it.
- **L2 — DEFERRED: unbounded event-store growth.** The events database has no
  retention/pruning; this matches the pre-existing demo/opencode adapter
  shape. The reset procedure is documented in docs/OPERATIONS.md
  ("Data: location, reset, backup, restore").

## Unverified / to confirm at Phase 3

- Exact OpenCode v2 event-stream paths and event names (`/api/event`, `session.*` names in the brief §8.1 are DOCUMENTED claims, not verified against the installed 2.2.0 binary). Adapter must probe at runtime, degrade honestly to DISCONNECTED/DEMO, and never invent events.
- Hermes lifecycle hooks reachable in this deployment mode (gateway hooks exist; CLI/TUI coverage unverified). Hermes desk status stays "from verified sources only" until then.
- Whether `opencode serve` can run alongside the user's normal workflow without side effects (read-only assumption to be proven with a disposable fixture task).

## Rules for adapters

- Read-only. No writes into Hermes/OpenCode. Fail-open with respect to the dev workflow, fail-closed on data exposure.
- Sanitize server-side before storage/push. No raw payloads to the browser.
