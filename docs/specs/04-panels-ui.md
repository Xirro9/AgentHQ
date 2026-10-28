# Spec 04 — inspection panels, task board, settings, audio

Builds on spec 03's store/bridge/scene. Read `AGENT_HQ_MASTER_BRIEF.md` §1.2, §9, §19, §10.4 and the existing `src/client/**` first. No new dependencies. TypeScript strict.

## Files to create
1. `src/client/ui/DeskPanel.tsx` — anchored panel (opens right of selected desk, flips side if near edge; 320px wide; glass-dark plum):
   - Header: agent color dot + label + role + close ×.
   - Body: current state chip (WorkState + since, relative time), project/task from latest task event, last event summary, live feed of the agent's last ~10 events (time, kind glyph, summary; newest on top, auto-follow toggle pauses on scroll-up + "jump to live" pill).
   - Footer: Expand button (→ WorkstationView), Follow toggle (camera eases to desk), Open Task Board.
   - Empty/unknown states: honest — "No activity observed yet", never placeholder lies.
2. `src/client/ui/WorkstationView.tsx` — full-screen overlay (office stays visible behind at 40% dim, camera motion paused): tabs Overview / Live Activity / Tasks / Files / Tests / Timeline / Diagnostics.
   - Overview: state, source(s) seen in events, session ids, last event age, connectivity.
   - Live Activity: virtualized-ish list (render cap 200 + "load more"), filter by kind + severity + text search (case-insensitive, 100 char cap), timestamps HH:MM:SS, copy button per row (clipboard API).
   - Tasks: task cards grouped by taskId from events (created/started/completed/failed timeline mini-steps).
   - Files: unique safeFileRefs with counts; click = copy path. NO file contents (not exposed).
   - Tests: test.started/completed events only; if no parseable counts exist show "result only" — never fabricate pass counts.
   - Timeline: simple scrubber over the agent's events (range input 0..n, position marker + event card at index).
   - Diagnostics: per-agent event count by kind, first/last seen, provenance breakdown (direct/derived/simulation counts).
   - Esc or × closes and restores camera; opening pauses cat mischief? NO — cats keep living; only camera motion pauses.
3. `src/client/ui/TaskBoard.tsx` — opens from corkboard interactable or DeskPanel: kanban columns Queued / Planning / In Progress / Testing / Review / Done / Blocked mapped from task events only (task.created→Queued, agent.delegated/planning→Planning, task.started→In Progress, test.started→Testing, review.started→Review, task.completed→Done, task.failed/blocked→Blocked). Sticky-note styling (paper bg, pin dot, agent color edge). Cards move with a 300ms CSS transition. A stage is NEVER inferred from the agent's role. Manual notes: + button creates a local-only card clearly tagged "manual" (persist localStorage, never enters telemetry).
4. `src/client/ui/Settings.tsx` — slide-over from gear button; persisted localStorage (`agenthq.settings`), validated:
   - Mode preference: auto / demo (auto = whatever server reports).
   - Ambience: day/evening/night/auto; decorative weather: none/rain (rain = canvas particle overlay, clearly decorative).
   - Cats: enabled, mischief level (calm/normal/chaos → scales cooldowns), peaceful mode (no mischief), petting on/off.
   - Performance: FPS cap 30/60, particles on/off, reduced motion, effects quality.
   - Audio: master/ambience/ui/cats sliders, mute.
   - Privacy note text (read-only summary of what the app does/doesn't collect).
   Changes dispatch `agenthq:settings` CustomEvents the scene listens to.
5. `src/client/audio/sfx.ts` — WebAudio synthesized bleeps (OscillatorNode + GainNode envelopes — NO audio files needed): soft click (UI), keyboard tick loop while a worker types (very quiet, randomized 80-140ms), coffee gurgle, meow (pitch bend), purr (low sawtooth wobble), success chime (two-note, only on REAL task.completed with provenance!=='simulation' — demo completions get a softer demo chime), printer noise. Master gate: start muted; audio context resumes on first user gesture. Sliders from settings.
6. `src/client/ui/GlobalFeed.tsx` — bottom-left collapsible drawer: chronological events across all sources with source badges (hermes/opencode/system/demo colored), kind filter chips, search. Opens from HUD button "Activity".
7. `src/client/App.tsx` — wire everything: DeskPanel when selected, WorkstationView when expanded, TaskBoard/Settings/GlobalFeed toggles, keyboard: Esc closes topmost, T opens task board, S settings, F feeds focus to selected agent, arrows pan camera (forward to scene bridge). Respect reduced motion globally (transitions off).
8. `tests/ui.logic.test.ts` — pure helpers: task column derivation from event sequences (incl. "role does not imply testing stage" case: tester agent task.started → In Progress not Testing), event feed filter fn, relative-time formatter, settings validation.

## Acceptance criteria
1. `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run build` exit 0; `npm test` all green (spec 01+02 tests still pass).
2. Manual smoke via vite: open page → click each desk chip → DeskPanel opens with that agent; Esc closes; task board shows demo task-001 moving columns as demo events arrive.
3. No console errors on load or during 60s idle.
Report: files, build+test tails, screenshots if playwright available.
