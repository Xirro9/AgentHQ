#!/usr/bin/env python3
"""Hermes shell hook -> AgentHQ telemetry bridge (read-only observer).

Reads ONE JSON hook payload from stdin (the Hermes shell-hook wire format:
{hook_event_name, tool_name, tool_input, session_id, cwd, extra, ...}), tags it
with event_id + ts, and appends it as one JSON line to the AgentHQ events file.

Safety contract:
- NEVER writes to stdout (shell hooks parse stdout JSON as a block/modify
  response — any stdout here could alter real tool behavior).
- NEVER exits non-zero for telemetry failures (exit code 2 would BLOCK a
  pre_tool_call). All errors are swallowed: telemetry must never disturb the
  agent loop.
- Rotates the target file at ~25 MB (AgentHQ's tail adapter detects the inode
  change and reopens).
- Creates files 0644 / dirs 0755 (umask 022) regardless of how Hermes was
  launched, so the Ubuntu-host AgentHQ reader can keep following the file
  across recreation and rotation via the Docker bind mount.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

TARGET = Path(
    os.environ.get(
        "AGENTHQ_EVENTS_FILE",
        "/opt/data/projects/AgentHQ/data/hermes-events.jsonl",
    )
)
MAX_BYTES = 25 * 1024 * 1024


def main() -> int:
    # Host-reader guarantee: new/rotated event files must always be 0644 under
    # 0755 dirs, whatever umask the Hermes process happens to inherit.
    os.umask(0o022)
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return 0
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            return 0
        record = {
            "event_id": uuid.uuid4().hex,
            "ts": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        try:
            if TARGET.exists() and TARGET.stat().st_size > MAX_BYTES:
                os.replace(TARGET, TARGET.parent / (TARGET.name + ".1"))
        except OSError:
            pass  # rotation is best-effort; keep appending either way
        with open(TARGET, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass  # fail open, always
    return 0


if __name__ == "__main__":
    sys.exit(main())
