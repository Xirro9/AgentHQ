# E2E verification — how to run it

The office E2E is a standalone driver (`tests/e2e/office.e2e.ts`, entry
`tests/e2e/run.ts`). The repo deliberately has **no `playwright` / `@playwright/test`
npm dependency** (spec 05: no new deps), so the driver shells out to the installed
**`playwright-cli`** binary, which reads its browser config from
`.playwright/cli.config.json` (headless chromium).

## One command

```bash
npx tsx tests/e2e/run.ts
```

What it does, in order:

| Step | Action | Check |
|------|--------|-------|
| 0 | Health-checks `http://127.0.0.1:4310/api/health` and the vite dev server; **spawns whatever is missing** (`tsx src/server/index.ts`, `vite --port 5173 --strictPort`), and **attaches to whatever is already running without killing it** | stack ready |
| 1 | Opens the app in headless chromium, waits for the Phaser canvas | canvas rendered, mode badge present, 7 desk chips |
| 2 | Clicks each of the 7 desk chips (`hermes … security`) | each opens the matching DeskPanel |
| 3 | Presses `T` | task board opens |
| 4 | Presses `S`, selects Ambience **night** | night becomes the active segment |
| 5 | Replay smoke: clicks **↺ Replay**, picks *last 5m*, scrubs to the end, exits | `REPLAY` badge during replay, workers reconstructed states from history, `DEMO` badge + repopulated feed after exit |
| 6 | Idles 30s (`HQ_E2E_IDLE_MS`, default 30000) | canvas alive, badge honest (`DEMO`/`LIVE`) |
| 7 | Dumps the browser console | **zero `error`-level messages** (hard gate) |

Exit code `0` = all checks passed. Any failed check is listed at the end.

## Environment knobs

| Variable | Default | Meaning |
|----------|---------|---------|
| `HQ_E2E_WEB_PORT` | `5173` | vite dev port to boot/attach (the API stays on loopback 4310 — it is a fixed ops constant) |
| `HQ_E2E_BASE_URL` | `http://127.0.0.1:$HQ_E2E_WEB_PORT` | attach to an already-running stack elsewhere |
| `HQ_E2E_SKIP_BOOT` | unset | `=1` skips all boot/attach checks |
| `HQ_E2E_IDLE_MS` | `30000` | length of the idle-stability window |

If the standard ports are busy (e.g. your own dev stack is running), either let
the driver attach to it (it never kills processes it did not spawn) or point it
at its own vite port:

```bash
HQ_E2E_WEB_PORT=5199 npx tsx tests/e2e/run.ts
```

(The vite proxy still forwards `/api` + `/ws` to the shared loopback API on 4310.)

## Evidence

Every run writes to `docs/evidence/`:

| File | Must show |
|------|-----------|
| `e2e-01-idle.png` | office fully rendered, `DEMO` (or `LIVE`) badge, loader gone, agents at desks, cats present |
| `e2e-02-panel-<agent>.png` ×7 | DeskPanel open for exactly that agent (color dot + label + role), live feed rows |
| `e2e-03-taskboard.png` | kanban with the 7 columns; demo task-001 card in a column; DEMO provenance visible |
| `e2e-04-night.png` | settings slide-over with **night** active; office tinted navy behind it |
| `e2e-05-replay.png` | violet `REPLAY` badge top-left; replay bar with play/pause, ±1 step, scrub slider, 0.5x–4x speeds, virtual clock; workers showing states reconstructed from the stored window |
| `e2e-06-idle-stable.png` | same healthy office after 30s idle; badge back to `DEMO`/`LIVE` |
| `e2e-console.log` | full console dump; must contain **no `[ERROR]` lines** |
| `e2e-api.log`, `e2e-web.log` | stdout/stderr of processes the driver itself spawned (absent when it attached to a running stack) |

## Manual walkthrough (playwright-cli, no script)

```bash
npm run dev                                    # terminal 1 (or attach to a running stack)
playwright-cli open http://127.0.0.1:5173/     # terminal 2
playwright-cli eval "!!document.querySelector('#office canvas')"
playwright-cli screenshot --filename docs/evidence/manual-idle.png
playwright-cli click ".hq-strip .hq-chip >> nth=0"     # Hermes panel
playwright-cli press t                                  # task board
playwright-cli press Escape
playwright-cli press s                                  # settings → Ambience night
playwright-cli click ".hq-settings-group[aria-label='Ambience'] .hq-seg-btn >> text=night"
playwright-cli press Escape
playwright-cli click ".hq-replay-entry"                 # replay bar
playwright-cli click ".hq-replaybar .hq-chip-btn >> nth=0"   # last 5m
playwright-cli click ".hq-replay-scrub" && playwright-cli press End   # scrub to end
playwright-cli click "text=Exit replay"
playwright-cli console error                            # must return 0 messages
playwright-cli close
```

Note: the WebGL warnings Chromium logs during screenshots (`GPU stall due to
ReadPixels`) are a headless-screenshot artifact, not app errors — the gate
counts only `error`-level console messages.
