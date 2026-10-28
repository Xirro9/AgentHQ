// tests/e2e/run.ts — E2E entry point (spec 05 §4): npx tsx tests/e2e/run.ts
// Boots/attaches the dev stack, drives the app through playwright-cli, and
// writes screenshots + the console log to docs/evidence/. See scripts/e2e.md.
import { runE2E } from './office.e2e'

const code = await runE2E()
process.exit(code)
