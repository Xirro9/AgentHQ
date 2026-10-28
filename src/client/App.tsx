// App shell — for now: the loader overlay. The Phaser office (OfficeScene)
// mounts into #office once the scene slice lands; HUD/panels layer above it.
export default function App() {
  return (
    <div className="hq-root">
      <div id="office" aria-label="AgentHQ office" />
      <div className="hq-loader" role="status">
        <div className="hq-loader-mark">🏢</div>
        <div className="hq-loader-text">waking the office…</div>
        <div className="hq-loader-sub">agents stretching · coffee brewing · cats pretending to sleep</div>
      </div>
    </div>
  )
}
