# Host integration scripts

Reference copies of the two artifacts that connect the Hermes container to this
application running on the Ubuntu host. The live pipeline is file-based and
one-way:

    Hermes tool call -> shell hook -> hermes_hook_log.py
      -> projects/AgentHQ/data/hermes-events.jsonl  (on the Docker bind mount,
         host path ~/ai-workbench/hermes/data/projects/AgentHQ/data/...)
      -> host AgentHQ file-tail adapter (src/server/adapters/hermes.ts)
      -> SQLite -> WebSocket -> UI

## hermes_hook_log.py

Deployed copy: `/opt/data/hooks/hermes_hook_log.py` inside the Hermes container
(the same file, host-visible at `~/ai-workbench/hermes/data/hooks/hermes_hook_log.py`).

Safety contract (unchanged): reads one hook payload from stdin, appends one JSON
line, never writes stdout, never exits non-zero, rotates at ~25 MB. It now also
self-sets `umask 022` so recreated and rotated event files are always 0644 under
0755 dirs, whatever umask the Hermes process inherits — otherwise rotation could
produce a file the host reader cannot follow.

## agenthq-host-setup.sh

Run ON THE UBUNTU HOST (idempotent, safe to re-run):

    bash ~/ai-workbench/hermes/data/agenthq-host-setup.sh

Verifies shared-file access as the invoking user, locates the host project,
checks node >= 22, updates the clone only if it predates the file-tail adapter
(`git pull --ff-only` with a clean-tree guard), writes durable local config
(`.env.agenthq`) plus a one-command launcher (`start-agenthq.sh`, equivalent to
`npm start` with the saved environment), starts the backend on 127.0.0.1:4311,
requires `adapters.hermes: connected` from `/api/health`, and verifies a REAL
Hermes event end-to-end by recomputing the adapter's event id:
`hermes-` + base64url(sha1(writer event_id)).

## Historical note

The 2026-10-28 outage ("No readable host event file found" on the host) was NOT
a path or adapter problem: the bind-mount root `/opt/data` (= the host's
`~/ai-workbench/hermes/data`) was mode 700 owned by the container uid, so no
host user could traverse it. Fixed traverse-only with `chmod 711`; sensitive
Hermes files (.env, auth.json, state.db = 600, config.yaml = 640) remain
unreadable to other uids.
