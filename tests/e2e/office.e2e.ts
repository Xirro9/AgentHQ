// tests/e2e/office.e2e.ts — standalone E2E verification for AgentHQ (spec 05 §4).
//
// Neither `playwright` nor `@playwright/test` is installed in this repo (no new
// deps allowed), so this driver speaks to the INSTALLED `playwright-cli` binary
// (see scripts/e2e.md for the manual command list). It:
//   1. boots the dev stack if needed (api :4310 + vite :5173, both loopback),
//      or attaches to an already-running one without killing it,
//   2. waits for the Phaser canvas, screenshots the idle office,
//   3. clicks each of the 7 desk chips and screenshots the DeskPanel,
//   4. opens the task board, toggles night ambience,
//   5. runs a replay smoke (REPLAY badge → scrub → workers react → exit →
//      live demo flow returns, spec 05 acceptance #2),
//   6. idles 30s and asserts stability,
//   7. fails if ANY browser console error was collected.
// Screenshots land in docs/evidence/.
//
// Run:  npx tsx tests/e2e/run.ts
// Env:  HQ_E2E_WEB_PORT (default 5173) · HQ_E2E_IDLE_MS (default 30000)
//       HQ_E2E_BASE_URL (attach to a running stack) · HQ_E2E_SKIP_BOOT=1

import { execFile, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const WEB_PORT = Number(process.env.HQ_E2E_WEB_PORT) || 5173
const BASE_URL = process.env.HQ_E2E_BASE_URL || `http://127.0.0.1:${WEB_PORT}`
// The api port is fixed in src/server/index.ts (loopback 4310) — an ops constant,
// documented in docs/OPERATIONS.md.
const API_URL = 'http://127.0.0.1:4310'
const IDLE_MS = Number(process.env.HQ_E2E_IDLE_MS) || 30_000
const EVIDENCE_DIR = resolve(ROOT, 'docs/evidence')
const CONSOLE_LOG = resolve(EVIDENCE_DIR, 'e2e-console.log')

/** Chip order == AGENT_IDS render order in the HUD strip. */
const AGENTS = [
  'hermes',
  'architect',
  'implementation',
  'frontend',
  'tester',
  'debugger',
  'security'
] as const

const failures: string[] = []
const notes: string[] = []

function note(msg: string): void {
  notes.push(msg)
  console.log(`  · ${msg}`)
}

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---- process helpers -----------------------------------------------------------

interface Proc {
  label: string
  child: ReturnType<typeof spawn>
}

function spawnLogged(label: string, cmd: string, args: string[]): Proc {
  const logPath = resolve(EVIDENCE_DIR, `e2e-${label}.log`)
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  const out = (chunk: Buffer): void => {
    try {
      writeFileSync(logPath, chunk, { flag: 'a' })
    } catch {
      /* evidence logging is best-effort */
    }
  }
  child.stdout?.on('data', out)
  child.stderr?.on('data', out)
  console.log(`  → spawned ${label} (${cmd} ${args.join(' ')}), log: docs/evidence/e2e-${label}.log`)
  return { label, child }
}

async function fetchOk(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

async function waitUntilReady(url: string, label: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fetchOk(url)) return true
    await sleep(500)
  }
  console.log(`  ✗ ${label} not ready at ${url} within ${timeoutMs}ms`)
  failures.push(`${label} readiness (${url})`)
  return false
}

// ---- playwright-cli helpers ------------------------------------------------------

async function cli(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileP('playwright-cli', args, {
    cwd: ROOT,
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024
  })
  return stdout
}

/** Evaluate a JS expression in the page; returns the parsed JSON result. */
async function evalJs(expression: string): Promise<unknown> {
  const out = await cli(['eval', expression])
  const start = out.indexOf('### Result')
  if (start === -1) throw new Error(`eval produced no result: ${out.slice(0, 300)}`)
  const rest = out.slice(start + '### Result'.length)
  const end = rest.indexOf('### Ran Playwright code')
  const body = (end === -1 ? rest : rest.slice(0, end)).trim()
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`eval result not JSON: ${body.slice(0, 300)}`)
  }
}

async function shot(filename: string): Promise<void> {
  await cli(['screenshot', '--filename', `docs/evidence/${filename}`])
  console.log(`  📸 docs/evidence/${filename}`)
}

function countConsoleErrors(consoleOut: string): number {
  return (consoleOut.match(/^\[ERROR\]/gm) ?? []).length
}

// ---- boot -------------------------------------------------------------------------

async function bootStack(): Promise<Proc[]> {
  console.log('step 0 — dev stack')
  const procs: Proc[] = []
  if (process.env.HQ_E2E_SKIP_BOOT === '1') {
    note('HQ_E2E_SKIP_BOOT=1 — attaching without boot checks')
    return procs
  }
  if (await fetchOk(`${API_URL}/api/health`)) {
    note(`api already healthy at ${API_URL} — attaching (not killing it)`)
  } else {
    procs.push(spawnLogged('api', 'node_modules/.bin/tsx', ['src/server/index.ts']))
    await waitUntilReady(`${API_URL}/api/health`, 'api', 30_000)
  }
  if (await fetchOk(BASE_URL)) {
    note(`web already serving at ${BASE_URL} — attaching (not killing it)`)
  } else {
    procs.push(
      spawnLogged('web', 'node_modules/.bin/vite', [
        '--port',
        String(WEB_PORT),
        '--strictPort',
        '--host',
        '127.0.0.1'
      ])
    )
    await waitUntilReady(BASE_URL, 'web', 60_000)
  }
  return procs
}

// ---- steps ------------------------------------------------------------------------

interface PageState {
  canvas: boolean
  badge: string | null
  chips: number
}

function pageStateExpr(): string {
  return `(() => ({ canvas: !!document.querySelector('#office canvas'), badge: document.querySelector('.hq-badge')?.textContent ?? null, chips: document.querySelectorAll('.hq-strip .hq-chip').length }))()`
}

async function waitForCanvas(): Promise<void> {
  console.log('step 1 — canvas + idle office')
  const deadline = Date.now() + 45_000
  let state: PageState | null = null
  while (Date.now() < deadline) {
    try {
      state = (await evalJs(pageStateExpr())) as PageState
      if (state?.canvas && state?.badge) break
    } catch {
      /* page still booting */
    }
    await sleep(1000)
  }
  check('Phaser canvas rendered', state?.canvas === true)
  check('mode badge present', typeof state?.badge === 'string' && state.badge.length > 0, `badge=${String(state?.badge)}`)
  check('7 desk chips in the HUD strip', state?.chips === 7, `chips=${String(state?.chips)}`)
  await sleep(2500) // let the loader overlay finish + first demo beats land
  await shot('e2e-01-idle.png')
}

async function deskPanels(): Promise<void> {
  console.log('step 2 — click each of the 7 desk chips')
  for (let i = 0; i < AGENTS.length; i++) {
    const id = AGENTS[i]
    try {
      await cli(['click', '.hq-strip .hq-chip >> nth=' + i])
      await sleep(600)
      const panel = (await evalJs(
        `(() => ({ open: !!document.querySelector('.hq-desk-panel'), title: document.querySelector('.hq-desk-panel .hq-panel-title strong')?.textContent ?? null }))()`
      )) as { open: boolean; title: string | null }
      check(
        `desk chip ${id} opens its panel`,
        panel.open && (panel.title ?? '').toLowerCase() === id,
        `title=${panel.title}`
      )
      await shot(`e2e-02-panel-${id}.png`)
      await cli(['press', 'Escape'])
      await sleep(250)
    } catch (err) {
      check(`desk chip ${id} opens its panel`, false, String(err))
      await cli(['press', 'Escape']).catch(() => undefined)
    }
  }
}

async function taskBoard(): Promise<void> {
  console.log('step 3 — task board (T)')
  await cli(['press', 't'])
  await sleep(600)
  const open = (await evalJs(`!!document.querySelector('.hq-board')`)) as boolean
  check('task board opens', open === true)
  await shot('e2e-03-taskboard.png')
  await cli(['press', 'Escape'])
  await sleep(250)
}

async function nightToggle(): Promise<void> {
  console.log('step 4 — toggle night ambience (S → Ambience: night)')
  await cli(['press', 's'])
  await sleep(500)
  await cli(['click', ".hq-settings-group[aria-label='Ambience'] .hq-seg-btn >> text=night"])
  await sleep(700) // ambience tween
  const active = (await evalJs(
    `document.querySelector('.hq-settings-group[aria-label=\"Ambience\"] .hq-seg-btn--active')?.textContent ?? null`
  )) as string | null
  check('night ambience selected', active === 'night', `active=${active}`)
  await shot('e2e-04-night.png')
  await cli(['press', 'Escape'])
  await sleep(250)
}

/**
 * Replay smoke (spec 05 acceptance #2): enter via the GlobalFeed replay
 * button, pick the 5m window, assert the REPLAY badge, scrub to the end and
 * assert workers reconstructed states from history, then exit and assert the
 * live demo flow returns with a repopulated feed.
 */
async function replaySmoke(): Promise<void> {
  console.log('step 5 — replay smoke (REPLAY badge, scrub, exit → live)')
  try {
    await cli(['click', '.hq-replay-entry'])
    await sleep(400)
    await cli(['click', '.hq-replaybar .hq-chip-btn >> nth=0']) // "last 5m"
    await sleep(1200)
    const badge = (await evalJs(`document.querySelector('.hq-badge')?.textContent ?? null`)) as string | null
    check('REPLAY badge shows after entering replay', badge === 'REPLAY', `badge=${badge}`)
    // Scrub to the end of the window: focus the slider and jump with End.
    await cli(['click', '.hq-replay-scrub'])
    await cli(['press', 'End'])
    await sleep(800)
    const replayState = (await evalJs(
      `(() => ({ states: [...document.querySelectorAll('.hq-chip-state')].map((el) => el.textContent?.trim() ?? ''), bar: !!document.querySelector('.hq-replaybar'), clock: document.querySelector('.hq-replay-clock')?.textContent ?? '' }))()`
    )) as { states: string[]; bar: boolean; clock: string }
    const reconstructed = replayState.states.some((s) => s !== 'unknown')
    check(
      'workers reconstructed states from scrubbed events',
      reconstructed,
      `states=${replayState.states.join(',')}`
    )
    check('replay bar visible during replay', replayState.bar)
    await shot('e2e-05-replay.png')
    await cli(['click', 'text=Exit replay'])
    await sleep(2000) // reconnect + snapshot refill
    const after = (await evalJs(
      `(() => ({ badge: document.querySelector('.hq-badge')?.textContent ?? null, events: document.querySelector('.hq-activity-count')?.textContent ?? '0', bar: !!document.querySelector('.hq-replaybar') }))()`
    )) as { badge: string | null; events: string; bar: boolean }
    check('leaving replay returns to the live demo badge', after.badge === 'DEMO', `badge=${after.badge}`)
    check('feed repopulated after replay exit (no duplicates/blockage)', Number(after.events) > 0, `events=${after.events}`)
    check('replay bar dismissed', after.bar === false)
  } catch (err) {
    check('replay smoke completed', false, String(err))
    await cli(['press', 'Escape']).catch(() => undefined)
  }
}

async function idleStability(): Promise<void> {
  console.log(`step 6 — ${Math.round(IDLE_MS / 1000)}s idle stability`)
  await sleep(IDLE_MS)
  const state = (await evalJs(pageStateExpr())) as PageState
  check('canvas still alive after idle', state.canvas === true)
  check(
    'mode badge honest after idle (DEMO/LIVE, never stuck REPLAY/DISCONNECTED)',
    state.badge === 'DEMO' || state.badge === 'LIVE',
    `badge=${state.badge}`
  )
  await shot('e2e-06-idle-stable.png')
}

async function consoleGate(): Promise<void> {
  console.log('step 7 — console error gate')
  const all = await cli(['console'])
  try {
    writeFileSync(CONSOLE_LOG, all)
  } catch {
    /* best-effort */
  }
  const errors = countConsoleErrors(all)
  check('zero browser console errors', errors === 0, `${errors} errors (docs/evidence/e2e-console.log)`)
}

// ---- main ---------------------------------------------------------------------------

export async function runE2E(): Promise<number> {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  console.log('AgentHQ E2E (playwright-cli driver)')
  console.log('─'.repeat(60))

  const procs = await bootStack()
  if (failures.length > 0) {
    console.log('─'.repeat(60))
    console.log('ABORTED — stack never became ready')
    return finish(procs, 1)
  }

  let browserOwned = false
  try {
    const openOut = await cli(['open', BASE_URL], 120_000)
    browserOwned = /opened with pid/.test(openOut)
  } catch (err) {
    // An existing session may be attached already; commands reuse it.
    note(`playwright-cli open: ${String(err).slice(0, 120)} — trying to reuse the session`)
  }

  try {
    await waitForCanvas()
    await deskPanels()
    await taskBoard()
    await nightToggle()
    await replaySmoke()
    await idleStability()
    await consoleGate()
  } finally {
    if (browserOwned) await cli(['close']).catch(() => undefined)
  }

  console.log('─'.repeat(60))
  const ok = failures.length === 0
  console.log(ok ? 'E2E PASSED' : `E2E FAILED — ${failures.length} check(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  return finish(procs, ok ? 0 : 1)
}

function finish(procs: Proc[], code: number): number {
  for (const { label, child } of procs) {
    console.log(`  → stopping spawned ${label}`)
    child.kill('SIGTERM')
  }
  return code
}

// Direct invocation: npx tsx tests/e2e/office.e2e.ts
if (process.argv[1] && new URL(import.meta.url).pathname === resolve(process.argv[1])) {
  const code = await runE2E()
  process.exit(code)
}
