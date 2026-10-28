#!/usr/bin/env node
// AgentHQ doctor — quick local environment health check (read-only).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
let fail = 0
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => { console.log(`  ✗ ${m}`); fail++ }

console.log('AgentHQ doctor')
console.log('─'.repeat(46))

// toolchain
const nodeMajor = Number(process.versions.node.split('.')[0])
nodeMajor >= 20 ? ok(`node ${process.versions.node}`) : bad(`node ${process.versions.node} (need >=20)`)

// node:sqlite
try { await import('node:sqlite'); ok('node:sqlite available') } catch { bad('node:sqlite unavailable') }

// project files
for (const f of ['package.json', 'index.html', 'public/assets/gen/atlas.json', 'public/assets/gen/layout.json', 'public/assets/gen/manifest.json']) {
  fs.existsSync(path.join(root, f)) ? ok(f) : bad(`missing ${f}`)
}

// atlas sheets on disk
try {
  const atlas = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/gen/atlas.json'), 'utf8'))
  const sheets = Object.keys(atlas.sheets)
  let missing = 0
  for (const s of sheets) fs.existsSync(path.join(root, 'public/assets/gen', `${s}.png`)) || missing++
  missing === 0 ? ok(`${sheets.length} art sheets present`) : bad(`${missing} sheets missing`)
} catch (e) { bad(`atlas.json unreadable: ${e.message}`) }

// data dir
const dataDir = path.join(root, 'data')
try { fs.mkdirSync(dataDir, { recursive: true }); fs.accessSync(dataDir, fs.constants.W_OK); ok('data/ writable') } catch { bad('data/ not writable') }

// deps
fs.existsSync(path.join(root, 'node_modules/phaser')) ? ok('phaser installed') : bad('run: npm install')
fs.existsSync(path.join(root, 'node_modules/vite')) ? ok('vite installed') : bad('vite missing')

// backend port (informational)
const busy = (() => { try { execSync('ss -ltn 2>/dev/null | grep -q ":4310 "', { shell: '/bin/bash' }); return true } catch { return false } })()
busy ? ok('backend :4310 listening (already running?)') : console.log('  · backend :4310 not listening (start with npm run dev)')

// opencode adapter target (informational, never required)
const oc = process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096'
try { execSync(`curl -s -m 2 -o /dev/null ${oc}`, { shell: '/bin/bash' }); ok(`opencode server reachable at ${oc}`) } catch { console.log(`  · opencode server not reachable at ${oc} (adapter will show disconnected — expected)`) }

// production build
fs.existsSync(path.join(root, 'dist/index.html')) ? ok('dist/ built (npm start ready)') : console.log('  · dist/ not built (npm run build for production mode)')

console.log('─'.repeat(46))
console.log(fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
