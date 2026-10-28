// src/client/ui/Settings.tsx — slide-over settings panel (spec 04 §4).
// Every change flows up as a partial patch; App pushes it through
// store.updateSettings, which validates, persists `agenthq.settings` to
// localStorage and dispatches the `agenthq:settings` CustomEvent the scene
// listens to. The privacy note is read-only and honest.

import { useEffect, useRef } from 'react'
import type { UiSettings } from './logic'

export interface SettingsProps {
  settings: UiSettings
  onChange(patch: Partial<UiSettings>): void
  onClose(): void
}

const PRIVACY_NOTE = `AgentHQ is read-only and local. It observes sanitized event summaries from your Hermes/OpenCode setup on this machine, stores them in a local SQLite database, and never contacts hosted services. It does not collect credentials, hidden reasoning, cookies, or raw tool output; file paths are safe references only, and file contents are never fetched. Nothing here sends telemetry anywhere — including your manual task-board notes, which stay in this browser's localStorage.`

export default function Settings({ settings, onChange, onClose }: SettingsProps) {
  // Focus the panel so Esc/Tab behave once it slides in.
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const setAudio = (key: keyof UiSettings['audio'], value: number): void =>
    onChange({ audio: { ...settings.audio, [key]: value } })

  return (
    <>
      <div className="hq-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        className="hq-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        ref={ref}
      >
        <header className="hq-panel-head hq-settings-head">
          <div className="hq-panel-title">
            <strong>Settings</strong>
            <span>persisted locally · agenthq.settings</span>
          </div>
          <button type="button" className="hq-icon-btn" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="hq-settings-body">
          <section className="hq-settings-group" aria-label="Mode">
            <h3 className="hq-label">Mode</h3>
            <SegmentedControl
              value={settings.mode}
              options={[
                { value: 'auto', label: 'auto' },
                { value: 'demo', label: 'demo' }
              ]}
              onChange={(mode) => onChange({ mode: mode as UiSettings['mode'] })}
            />
            <p className="hq-hint-text">
              auto shows whatever the server reports; demo pins the fixture view and filters the
              feed to demo events — the server's true mode is always named on the badge tooltip.
            </p>
          </section>

          <section className="hq-settings-group" aria-label="Ambience">
            <h3 className="hq-label">Ambience</h3>
            <SegmentedControl
              value={settings.ambience}
              options={[
                { value: 'day', label: 'day' },
                { value: 'evening', label: 'evening' },
                { value: 'night', label: 'night' },
                { value: 'auto', label: 'auto' }
              ]}
              onChange={(ambience) => onChange({ ambience: ambience as UiSettings['ambience'] })}
            />
            <div className="hq-settings-row">
              <label htmlFor="hq-weather">Decorative weather</label>
              <select
                id="hq-weather"
                value={settings.weather}
                onChange={(e) => onChange({ weather: e.target.value as UiSettings['weather'] })}
              >
                <option value="none">none</option>
                <option value="rain">rain (decorative)</option>
              </select>
            </div>
          </section>

          <section className="hq-settings-group" aria-label="Cats">
            <h3 className="hq-label">Cats</h3>
            <ToggleRow
              label="Cats in the office"
              checked={settings.catsEnabled}
              onChange={(catsEnabled) => onChange({ catsEnabled })}
            />
            <div className="hq-settings-row">
              <label htmlFor="hq-mischief">Mischief level</label>
              <select
                id="hq-mischief"
                value={settings.mischiefLevel}
                disabled={!settings.catsEnabled || settings.peacefulMode}
                onChange={(e) => onChange({ mischiefLevel: e.target.value as UiSettings['mischiefLevel'] })}
              >
                <option value="calm">calm (rare)</option>
                <option value="normal">normal</option>
                <option value="chaos">chaos (frequent)</option>
              </select>
            </div>
            <ToggleRow
              label="Peaceful mode (no mischief)"
              checked={settings.peacefulMode}
              onChange={(peacefulMode) => onChange({ peacefulMode })}
            />
            <ToggleRow
              label="Petting"
              checked={settings.pettingEnabled}
              onChange={(pettingEnabled) => onChange({ pettingEnabled })}
            />
          </section>

          <section className="hq-settings-group" aria-label="Performance">
            <h3 className="hq-label">Performance</h3>
            <div className="hq-settings-row">
              <label htmlFor="hq-fps">FPS cap</label>
              <select
                id="hq-fps"
                value={settings.fpsCap}
                onChange={(e) => onChange({ fpsCap: Number(e.target.value) === 30 ? 30 : 60 })}
              >
                <option value={60}>60</option>
                <option value={30}>30</option>
              </select>
            </div>
            <ToggleRow
              label="Particles"
              checked={settings.particles}
              onChange={(particles) => onChange({ particles })}
            />
            <ToggleRow
              label="Reduced motion"
              checked={settings.reducedMotion}
              onChange={(reducedMotion) => onChange({ reducedMotion })}
            />
            <div className="hq-settings-row">
              <label htmlFor="hq-quality">Effects quality</label>
              <select
                id="hq-quality"
                value={settings.effectsQuality}
                onChange={(e) => onChange({ effectsQuality: e.target.value as UiSettings['effectsQuality'] })}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
          </section>

          <section className="hq-settings-group" aria-label="Audio">
            <h3 className="hq-label">Audio</h3>
            <ToggleRow label="Mute all" checked={settings.muted} onChange={(muted) => onChange({ muted })} />
            <SliderRow label="Master" value={settings.audio.master} onChange={(v) => setAudio('master', v)} />
            <SliderRow label="Ambience" value={settings.audio.ambience} onChange={(v) => setAudio('ambience', v)} />
            <SliderRow label="UI" value={settings.audio.ui} onChange={(v) => setAudio('ui', v)} />
            <SliderRow label="Cats" value={settings.audio.cats} onChange={(v) => setAudio('cats', v)} />
            <p className="hq-hint-text">
              starts muted; the mixer wakes on your first click or keypress.
            </p>
          </section>

          <section className="hq-settings-group" aria-label="Privacy">
            <h3 className="hq-label">Privacy</h3>
            <p className="hq-privacy-note">{PRIVACY_NOTE}</p>
          </section>
        </div>
      </aside>
    </>
  )
}

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange(value: string): void
}) {
  return (
    <div className="hq-seg" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`hq-seg-btn${value === opt.value ? ' hq-seg-btn--active' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange(v: boolean): void
}) {
  return (
    <div className="hq-settings-row">
      <label htmlFor={`hq-toggle-${label.replace(/\W+/g, '-').toLowerCase()}`}>{label}</label>
      <button
        id={`hq-toggle-${label.replace(/\W+/g, '-').toLowerCase()}`}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`hq-switch${checked ? ' hq-switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="hq-switch-knob" />
        <span className="hq-switch-text">{checked ? 'on' : 'off'}</span>
      </button>
    </div>
  )
}

function SliderRow({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange(v: number): void
}) {
  return (
    <div className="hq-settings-row hq-slider-row">
      <label htmlFor={`hq-slider-${label.toLowerCase()}`}>{label}</label>
      <input
        id={`hq-slider-${label.toLowerCase()}`}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${value * 100}%` }}
      />
      <span className="hq-mono hq-slider-val">{Math.round(value * 100)}</span>
    </div>
  )
}
