// Demo mode on the page (design §6.11): the Demo badge and bar, the guided
// tour over the real pages, and the one Exit demo button. The sample's
// backend answers every change with a preview; this file shows it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { useAppApi as useHostApi } from '@kirocrew/app-sdk'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { DemoGuardProvider } from './host.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { LAYER } from './layers.ts'
import { TOUR, demoClient, stepTo, tourKey, type TourStep } from './demo-api.ts'
import { fixturesClient, type DemoFixtures } from './demo-fixtures.ts'
import { errorMessage } from './workspace-api.ts'

interface Demo {
  active: boolean
  starting: boolean
  error: string | null
  // The last preview: what a change would have done.
  notice: string | null
  // The tour's step, or null when the tour is closed.
  step: number | null
  // The made-up data the Radar screens show (demo-fixtures.ts), or null when
  // the demo is off or has not answered yet.
  fixtures: DemoFixtures | null
  // Which Stop the line example the page shows.
  stopExample: 'running' | 'stopped'
  setStopExample(example: 'running' | 'stopped'): void
  start(): Promise<void>
  exit(): Promise<void>
  setStep(step: number | null): void
  clearNotice(): void
}

const DemoContext = createContext<Demo>({
  active: false,
  starting: false,
  error: null,
  notice: null,
  step: null,
  fixtures: null,
  stopExample: 'running',
  setStopExample: () => undefined,
  start: async () => undefined,
  exit: async () => undefined,
  setStep: () => undefined,
  clearNotice: () => undefined,
})

export const useDemo = () => useContext(DemoContext)

// The demo's data for the Radar screens, or null outside the demo. Real
// screens keep their own reads when this is null.
export const useDemoFixtures = () => useContext(DemoContext).fixtures

export function DemoProvider(props: { children: ReactNode }) {
  const api = useHostApi()
  const client = useMemo(() => demoClient(api), [api])
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [step, setStep] = useState<number | null>(null)
  const [fixtures, setFixtures] = useState<DemoFixtures | null>(null)
  const [stopExample, setStopExample] = useState<'running' | 'stopped'>('running')
  const start = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      await client.start()
      // The fixtures are for the new screens; a failed read leaves them off.
      setFixtures(await fixturesClient(api).read().catch(() => null))
      setActive(true)
      setStep(0)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setStarting(false)
    }
  }, [client, api])
  // Exit closes the sample on the backend, then the page reads the
  // person's own workspace again. A failed close still leaves the demo.
  const exit = useCallback(async () => {
    setStep(null)
    setNotice(null)
    setActive(false)
    setFixtures(null)
    setStopExample('running')
    try {
      await client.exit()
    } catch {
      // The backend keeps the sample until the next start; nothing to undo.
    }
  }, [client])
  const guard = useMemo(() => ({ active, notice: (text: string) => setNotice(text) }), [active])
  const value = useMemo<Demo>(
    () => ({ active, starting, error, notice, step, fixtures, stopExample, setStopExample, start, exit, setStep, clearNotice: () => setNotice(null) }),
    [active, starting, error, notice, step, fixtures, stopExample, start, exit],
  )
  return (
    <DemoContext.Provider value={value}>
      <DemoGuardProvider value={guard}>{props.children}</DemoGuardProvider>
    </DemoContext.Provider>
  )
}

// The header's badge. Every page shows it while the demo is on.
export function DemoBadge() {
  const { active } = useDemo()
  if (!active) return null
  return (
    <span data-demo-badge aria-label="Demo mode is on">
      <Badge variant="warning">Demo</Badge>
    </span>
  )
}

// The button that opens the demo: in the Dashboard's empty In flight box
// (only while nothing has ever run) and on the no-workspace page. Never in
// the header.
export function StartDemoButton(props: { label?: string }) {
  const { active, starting, start } = useDemo()
  if (active) return null
  return (
    <Tooltip text="Open a made-up workspace with a guided tour. Your own work is not touched.">
      {(describedBy) => (
        <Btn type="button" data-demo-start aria-describedby={describedBy} disabled={starting} onClick={() => void start()}>
          {starting ? 'Opening the demo…' : (props.label ?? 'Start demo')}
        </Btn>
      )}
    </Tooltip>
  )
}

// The strip under the header: what the demo is, the last preview, Tour,
// and Exit demo.
export function DemoBar() {
  const demo = useDemo()
  if (!demo.active)
    return demo.error ? (
      <p role="alert" className="px-6 pb-2 text-sm text-danger">
        {demo.error}
      </p>
    ) : null
  return (
    <div
      data-demo-bar
      role="region"
      aria-label="Demo mode"
      className="mx-6 mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--warning, #c90)', background: 'var(--card, transparent)' }}
    >
      <Badge variant="warning">Demo</Badge>
      <span className="flex-1" style={{ minWidth: 200 }}>
        Made-up sample. Nothing you do here changes your work, GitHub or agents.
      </span>
      <span role="group" aria-label="Stop the line example" className="flex items-center gap-1 text-xs">
        Stop the line example
        {(['running', 'stopped'] as const).map((example) => (
          <Btn key={example} type="button" data-demo-stop-example={example} aria-pressed={demo.stopExample === example} primary={demo.stopExample === example} onClick={() => demo.setStopExample(example)}>
            {example === 'running' ? 'Running' : 'Stopped'}
          </Btn>
        ))}
      </span>
      {demo.step === null && (
        <Btn type="button" onClick={() => demo.setStep(0)}>
          Start the tour
        </Btn>
      )}
      <Btn type="button" primary data-demo-exit onClick={() => void demo.exit()}>
        Exit demo
      </Btn>
      <p role="status" aria-live="polite" className="w-full text-sm" data-demo-notice>
        {demo.notice ?? ''}
      </p>
    </div>
  )
}

// Find the part of the page a step points at: the Stop the line button,
// or the heading that starts with the step's title.
function stepTarget(step: TourStep): Element | null {
  if (step.target) {
    const found = document.querySelector(step.target)
    if (found) return found
  }
  if (step.id === 'stop-line') return document.querySelector('[data-stop-line]')
  if (step.id !== 'needs-you') return null
  return [...document.querySelectorAll('h2, h3, h4')].find((h) => h.textContent?.trim().startsWith(step.title)) ?? null
}

// The guided tour: one big caption over the real page per step, with Back,
// Next and Done, and arrow keys. Motion is off under reduced motion.
export function DemoTour(props: { onEnter(step: TourStep): void }) {
  const demo = useDemo()
  const drawer = useTaskDrawer()
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const heading = useRef<HTMLHeadingElement>(null)
  const at = demo.step
  const step = at === null ? null : TOUR[at]
  const { onEnter } = props
  useEffect(() => {
    if (!step) return
    onEnter(step)
    if (step.task) drawer.openTask(step.task)
    else drawer.close()
    // The page renders the new tab first; then point at the step's part.
    const timer = setTimeout(() => {
      const target = stepTarget(step)
      target?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
      document.querySelectorAll('[data-tour-on]').forEach((el) => el.removeAttribute('data-tour-on'))
      target?.setAttribute('data-tour-on', '')
    }, 50)
    heading.current?.focus()
    return () => clearTimeout(timer)
    // Only a new step moves the page; the drawer and onEnter stay put.
  }, [at])
  useEffect(() => {
    if (at === null) return
    const keydown = (event: KeyboardEvent) => {
      const field = event.target as HTMLElement | null
      if (field && (field.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName))) return
      const move = tourKey(event.key)
      if (!move) return
      event.preventDefault()
      if (move === 'close') demo.setStep(null)
      else demo.setStep(stepTo(at, move))
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [at, demo])
  useEffect(
    () => () => document.querySelectorAll('[data-tour-on]').forEach((el) => el.removeAttribute('data-tour-on')),
    [],
  )
  if (!demo.active || at === null || !step) return null
  const last = at === TOUR.length - 1
  return (
    <section
      data-demo-tour
      data-step={step.id}
      aria-roledescription="guided tour"
      aria-label={`Demo tour, step ${at + 1} of ${TOUR.length}: ${step.title}`}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        width: 'min(640px, calc(100vw - 24px))',
        zIndex: LAYER.popover,
        background: 'var(--card, var(--bg, #fff))',
        color: 'var(--text)',
        border: '2px solid var(--warning, #c90)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,.25)',
        boxSizing: 'border-box',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        padding: 16,
      }}
    >
      <style>{`[data-demo-caption]{animation:avoozl-tour 200ms ease}@keyframes avoozl-tour{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}[data-tour-on]{outline:3px solid var(--warning, #c90);outline-offset:3px;border-radius:6px}@media (prefers-reduced-motion: reduce){[data-demo-caption]{animation:none}}`}</style>
      <div key={at} data-demo-caption>
        <p className="text-sm text-muted">
          <Badge variant="warning">Demo</Badge> Step {at + 1} of {TOUR.length}
        </p>
        <h2 ref={heading} tabIndex={-1} className="mt-1 font-semibold" style={{ fontSize: 22, lineHeight: 1.25 }}>
          {step.title}
        </h2>
        <p aria-live="polite" className="mt-2" style={{ fontSize: 18, lineHeight: 1.45 }}>
          {step.caption}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn type="button" disabled={at === 0} onClick={() => demo.setStep(stepTo(at, 'back'))}>
          Back
        </Btn>
        {last ? (
          <Btn type="button" primary onClick={() => demo.setStep(null)}>
            Done
          </Btn>
        ) : (
          <Btn type="button" primary onClick={() => demo.setStep(stepTo(at, 'next'))}>
            Next
          </Btn>
        )}
        <Btn type="button" onClick={() => demo.setStep(null)}>
          Close the tour
        </Btn>
        <span className="text-xs text-muted">Arrow keys move. Esc closes.</span>
      </div>
    </section>
  )
}
