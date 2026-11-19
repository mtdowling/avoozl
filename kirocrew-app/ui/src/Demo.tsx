// Demo mode on the page (design §6.11): the Demo badge and bar, and the one
// Exit demo button. The sample's
// backend answers every change with a preview; this file shows it.
import { usePhone } from './list-detail.ts'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Btn } from './ui/Btn'
import { useAppApi as useHostApi } from '@kirocrew/app-sdk'
import Badge from './ui/Badge.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { DemoGuardProvider } from './host.ts'
import { demoClient } from './demo-api.ts'
import { Pause, Play } from './icons.ts'
import { fixturesClient, type DemoFixtures } from './demo-fixtures.ts'
import { errorMessage } from './workspace-api.ts'
import { TAGLINE } from '../../../src/work-split.mjs'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

interface Demo {
  active: boolean
  starting: boolean
  error: string | null
  // The last preview: what a change would have done.
  notice: string | null
  // The made-up data the Radar screens show (demo-fixtures.ts), or null when
  // the demo is off or has not answered yet.
  fixtures: DemoFixtures | null
  // Which Stop the line example the page shows.
  stopExample: 'running' | 'stopped'
  setStopExample(example: 'running' | 'stopped'): void
  start(): Promise<void>
  exit(): Promise<void>
  clearNotice(): void
}

const DemoContext = createContext<Demo>({
  active: false,
  starting: false,
  error: null,
  notice: null,
  fixtures: null,
  stopExample: 'running',
  setStopExample: () => undefined,
  start: async () => undefined,
  exit: async () => undefined,
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
  const [fixtures, setFixtures] = useState<DemoFixtures | null>(null)
  const [stopExample, setStopExample] = useState<'running' | 'stopped'>('running')
  const start = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      await client.start()
      // The fixtures are for the new screens; a failed read leaves them off.
      setFixtures(
        await fixturesClient(api)
          .read()
          .catch(() => null),
      )
      setActive(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setStarting(false)
    }
  }, [client, api])
  // Exit closes the sample on the backend, then the page reads the
  // person's own workspace again. A failed close still leaves the demo.
  const exit = useCallback(async () => {
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
    () => ({ active, starting, error, notice, fixtures, stopExample, setStopExample, start, exit, clearNotice: () => setNotice(null) }),
    [active, starting, error, notice, fixtures, stopExample, start, exit],
  )
  return (
    <DemoContext.Provider value={value}>
      <DemoGuardProvider value={guard}>{props.children}</DemoGuardProvider>
    </DemoContext.Provider>
  )
}

// The badge at the top of the page. Every page shows it while the demo is on.
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
    <Tooltip text="Open a made-up workspace to look around. Your own work is not touched.">
      {(describedBy) => (
        <Btn type="button" data-demo-start aria-describedby={describedBy} disabled={starting} onClick={() => void start()}>
          {starting ? 'Opening the demo…' : (props.label ?? 'Start demo')}
        </Btn>
      )}
    </Tooltip>
  )
}

// The Stop the line example, in the demo bar: one icon that flips the page
// between running and stopped. Its words live only in its tooltip and name,
// never as visible text.
export function DemoControls() {
  const demo = useDemo()
  const stopped = demo.stopExample === 'stopped'
  const Icon = stopped ? Play : Pause
  const label = stopped ? 'Stop the line example: show the line running again' : 'Stop the line example: show the line stopped'
  return (
    <Tooltip text={label}>
      {(describedBy) => (
        <Btn
          type="button"
          data-demo-stop-example={demo.stopExample}
          aria-label={label}
          aria-describedby={describedBy}
          aria-pressed={stopped}
          onClick={() => demo.setStopExample(stopped ? 'running' : 'stopped')}
          css-display="inline-flex"
          css-align-items="center"
          css-justify-content="center"
          css-width="28"
          css-height="28"
          css-padding="0"
          css-color={stopped ? 'ok-inherit' : 'danger-inherit'}
        >
          <Icon size={14} aria-hidden="true" />
        </Btn>
      )}
    </Tooltip>
  )
}

// What Avoozl is, and what the demo is. This is the one place the page says it.
const DEMO_INTRO = TAGLINE + ' This is a made-up sample so you can look around. Nothing you do here changes your work, GitHub or agents.'

export function DemoBar() {
  const demo = useDemo()
  const phone = usePhone()
  if (!demo.active)
    return demo.error ? (
      <Box role="alert" as="p" px="6" pb="2" size="sm" tone="danger">
        {demo.error}
      </Box>
    ) : null
  const notice = (
    <p role="status" aria-live="polite" className={phone ? 'sr-only' : 'w-full text-sm'} data-demo-notice>
      {demo.notice ?? ''}
    </p>
  )
  // A phone gets a compact box: the badge, the intro, the controls and Exit.
  if (phone)
    return (
      <Box
        data-demo-bar
        role="region"
        aria-label="Demo mode"
        css-min-height="32"
        css-border-color="warning-c90"
        css-background="card-transparent"
        mx="4"
        mb="2"
        flex
        flexWrap
        items="center"
        gap="2"
        rounded="md"
        border="all"
        px="2"
        py="1.5"
        size="xs"
      >
        <DemoBadge />
        <Box as="span" css-min-width="160" minW0 flex1 tone="muted" data-demo-intro>
          {DEMO_INTRO}
        </Box>
        <DemoControls />
        <PlainButton
          type="button"
          data-demo-exit
          onClick={() => void demo.exit()}
          css-background="none"
          css-border="0"
          css-color="accent"
          css-cursor="pointer"
          css-padding="2px-4px"
          size="xs"
          weight="semibold"
        >
          Exit demo
        </PlainButton>
        {notice}
      </Box>
    )
  return (
    <Box
      data-demo-bar
      role="region"
      aria-label="Demo mode"
      css-border-color="warning-c90"
      css-background="card-transparent"
      mx="2"
      mb="3"
      flex
      flexWrap
      items="center"
      gap="3"
      rounded="lg"
      border="all"
      px="3"
      py="2"
      size="sm"
    >
      <DemoBadge />
      <Box as="span" css-min-width="200" flex1 data-demo-intro>
        {DEMO_INTRO}
      </Box>
      <DemoControls />
      <Btn type="button" primary data-demo-exit onClick={() => void demo.exit()}>
        Exit demo
      </Btn>
      {notice}
    </Box>
  )
}
