<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8A2BE2,50:5B21B6,100:00CED1&height=220&section=header&text=AgentHQ&fontSize=78&fontColor=ffffff&animation=twinkling&desc=the%20living%20office%20for%20your%20AI%20team&descSize=18&descAlignY=72" width="100%" />

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono:wght@600&size=20&duration=2800&pause=900&color=8A2BE2&center=true&vCenter=true&width=640&lines=%F0%9F%8F%A2+a+living+pixel-art+office;%F0%9F%90%B1+two+cats.+seven+agents.+zero+cloud.;%F0%9F%93%A1+real+telemetry.+never+fabricated." alt="agents typing" width="640" />

![status](https://img.shields.io/badge/status-design_phase-blueviolet?style=for-the-badge&logo=github)
![local-first](https://img.shields.io/badge/local--first-100%25-teal?style=for-the-badge&logo=homeassistant&logoColor=white)
![cloud](https://img.shields.io/badge/cloud_required-zero-black?style=for-the-badge&logo=cloudflare&logoColor=white)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)

<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Xirro9/AgentHQ/snake-output/github-contribution-grid-snake-dark.svg" />
  <img src="https://raw.githubusercontent.com/Xirro9/AgentHQ/snake-output/github-contribution-grid-snake.svg" alt="contribution snake" width="100%" />
</picture>

</div>

## 🏢 What is AgentHQ?

> **AgentHQ** is a cozy pixel-art office where your local AI team actually works.
> Hermes runs the floor, six OpenCode specialists man their desks — and two cats
> cause absolutely no production incidents. Click any desk to inspect that agent's
> *real* work: live sessions, tool calls, tests, files, timelines.

Three things make it more than a toy:

- 🏢 **A little world worth keeping open** — isometric pixel art, warm lamps, day/night ambience, idle animations
- 🖥️ **Serious observability in a game costume** — every desk opens a live, sanitized view of actual agent activity
- 📡 **Truthful by design** — only observed events, provenance on everything, zero fabricated activity

*In active design. The office is still blueprints — the build phases are tracked below.* 📐

<details>
<summary><b>🕹️ retro edition (click)</b></summary>

```text
▄▀█ █▀▀ █▄▄ █▄▄ ▀█▀ █░█ █▀█
█▀█ █▄▄ █▄█ █░█ ░█░ █▄█ █▄▀
```

</details>

---

## ✨ Highlights

| | Feature | |
|--|---------|--|
| 🖱️ | **Click-to-inspect workstations** | sessions, tool calls, tests, diffs, replayable timelines |
| 🐱 | **Pixel & Biscuit** | a tuxedo chaos goblin and a very round office supervisor |
| 🌇 | **Living ambience** | day / evening / night lighting, weather vibes, ambient sound |
| 📋 | **Task corkboard** | sticky notes move as real tasks progress |
| 🏷️ | **Honest status badges** | LIVE / DEMO / REPLAY / STALE / DISCONNECTED — never faked |
| 🔒 | **Read-only by design** | telemetry is sanitized and passive; agents never feel it |

---

## 🤖 The Cast

**The team** *(identities bound to real agent IDs from the live runtime)*

| | Character | Role | Vibe |
|-|-----------|------|------|
| 🧭 | Hermes | Manager | calm, quick, keeps the board honest |
| 📐 | architect | Planner | thoughtful and meticulous |
| 🔨 | implementation | Builder | energetic, keyboard-forward |
| 🎨 | frontend | Designer | artistic perfectionist |
| 🧪 | tester | QA | patient, suspicious, organized |
| 🔍 | debugger | Detective | tireless, fueled by coffee |
| 🛡️ | security | Guardian | steady, watchful, slightly ominous |

**The cats** *(working names — fully configurable)*

| | Cat | Personality |
|-|-----|-------------|
| 🐈‍⬛ | **Pixel** — small tuxedo | zoomies, paper batting, printer standoffs; entirely innocent in its own mind |
| 🐈 | **Biscuit** — very round | sleeps ~75% of the day, wins every standoff by doing absolutely nothing |

---

## 🧰 Stack

<div align="center">

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Phaser 3](https://img.shields.io/badge/Phaser_3-F7B32B?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri_(later)-FFC131?style=for-the-badge&logo=tauri&logoColor=black)

</div>

React + TypeScript UI over a Phaser 3 pixel-art world, a local Node.js backend with
SQLite event persistence, WebSocket live stream — everything bound to loopback.

---

## 📜 House Rules

1. 🚫 **No fabricated live data** — the feed shows only observed events; unknowns say *Unknown*
2. 👀 **Observers are passive** — HQ never slows, blocks, or injects into Hermes / OpenCode
3. 🏠 **Local-first** — no cloud LLMs, paid APIs, or hosted telemetry; runtime works offline
4. 🐱 **Cats are cosmetic** — mischief never touches real files, terminals, or agent sessions
5. 🏷️ **Honest labels** — live, demo, and replay are always unmistakably separated
6. 🔒 **Privacy by default** — secrets, raw diffs, and reasoning traces stay redacted unless explicitly enabled

---

## 🗺️ Roadmap

| Phase | Deliverable | State |
|-------|-------------|-------|
| 🏗️ 0 | Foundation & environment recon | ⬜ |
| 🏢 1 | The beautiful living office | ⬜ |
| 🐱 2 | Full cat personality system | ⬜ |
| 📡 3 | Read-only telemetry backend | ⬜ |
| 🔌 4 | Live office connection | ⬜ |
| 🔍 5 | Serious workstation explorer | ⬜ |
| ✨ 6 | Visual & sonic polish | ⬜ |
| 📦 7 | Desktop packaging (Tauri) | ⬜ |

*Progress will be tracked here and in `docs/PROGRESS.md` once the build begins.*

---

## ❓ FAQ

<details>
<summary><b>When can I play it?</b></summary>
<br/>
The build hasn't started yet — this repo currently holds the master design brief.
Watch the roadmap above.
</details>

<details>
<summary><b>Do the cats touch real code?</b></summary>
<br/>
Never. Pixel and Biscuit are strictly cosmetic — no incident can modify production
files, terminals, or live agent sessions. They knock over decorative mugs only.
</details>

<details>
<summary><b>What if live telemetry isn't available?</b></summary>
<br/>
The office stays useful: a clearly-labeled <b>DEMO</b> mode tours the whole team,
and every status badge is honest about its source. Disconnected means disconnected.
</details>

---

<div align="center">

**⭐ star the repo to feed the agents ⭐**

*they run on validation*

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00CED1,50:5B21B6,100:8A2BE2&height=110&section=footer" width="100%" />

</div>
