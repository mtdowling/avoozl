// The app page's one Back history. Each step is something Back undoes: a
// tab or inner tab change, an opened plan, a Graph drill-in level, or an
// open drawer, modal or confirm. Kiro Crew gives an app no history of its
// own (its route is /apps/:name, and history.pushState would move the host
// page), so Avoozl keeps this list itself and claims the mouse back button,
// Alt+Left and Cmd+[ only while it has a step to take. Kept free of JSX and
// the DOM so node can test it.

import { isBackButton, isBackKey } from './graph-layout.ts'

export type StepKind = 'tab' | 'inner' | 'select' | 'graph' | 'drawer' | 'modal' | 'confirm'

export interface Step {
  id: number
  kind: StepKind
  label: string
  // Back: undo this step. A layer may ask first (unsaved changes) and stay.
  back: () => void
  // Esc on a layer; defaults to back. The drawer's Back walks its own
  // linked-task history, while Esc closes it.
  dismiss?: () => void
}

const LAYERS: ReadonlySet<StepKind> = new Set(['drawer', 'modal', 'confirm'])
export const isLayer = (kind: StepKind) => LAYERS.has(kind)

export interface NavHistory {
  steps(): readonly Step[]
  push(step: Omit<Step, 'id'>): number
  // Drop a step: its owner closed it, or Back took it.
  release(id: number): void
  // Take the newest step. False when there is none, so the host keeps it.
  back(): boolean
  // Esc: close the topmost layer. False when no layer is open.
  escape(): boolean
  // Steps of `kind` taken since the last tab step, so a view can keep its
  // own stack (the Graph's drill levels) and this list in step.
  count(kind: StepKind): number
  sync(kind: StepKind, length: number, make: () => Omit<Step, 'id' | 'kind'>): void
}

// Array#findLast is ES2023; the page targets ES2022.
function lastOf<T>(list: readonly T[], test: (item: T) => boolean): T | undefined {
  for (let at = list.length - 1; at >= 0; at--) if (test(list[at])) return list[at]
  return undefined
}

export function createNavHistory(): NavHistory {
  let list: Step[] = []
  let next = 1
  const sinceTab = () => {
    const tab = lastOf(list, (step) => step.kind === 'tab')
    return tab ? list.slice(list.indexOf(tab) + 1) : list
  }
  const history: NavHistory = {
    steps: () => list,
    push(step) {
      const id = next++
      list = [...list, { ...step, id }]
      return id
    },
    release(id) {
      if (!list.some((step) => step.id === id)) return
      list = list.filter((step) => step.id !== id)
    },
    back() {
      const top = list.at(-1)
      if (!top) return false
      top.back()
      return true
    },
    escape() {
      const top = lastOf(list, (step) => isLayer(step.kind))
      if (!top) return false
      ;(top.dismiss ?? top.back)()
      return true
    },
    count: (kind) => sinceTab().filter((step) => step.kind === kind).length,
    sync(kind, length, make) {
      let have = history.count(kind)
      while (have < length) {
        history.push({ ...make(), kind })
        have++
      }
      while (have > length) {
        const last = lastOf(sinceTab(), (step) => step.kind === kind)
        if (!last) break
        history.release(last.id)
        have--
      }
    },
  }
  return history
}

// The mouse back button (button 3), Alt+Left and Cmd+[, as the Graph had them.
export { isBackButton, isBackKey }

interface Target {
  tagName?: string
  isContentEditable?: boolean
}
// Alt+Left moves the caret a word in a text field; leave it to the field.
export function typing(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as Target
  return Boolean(element.isContentEditable) || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName ?? '')
}

// What a key press means here: 'back', 'escape', or null to let the host
// have it. `inside` is whether it came from the Avoozl page.
export function keyAction(
  event: { key: string; altKey?: boolean; metaKey?: boolean; isComposing?: boolean; target?: unknown },
  inside: boolean,
  history: NavHistory,
): 'back' | 'escape' | null {
  if (event.isComposing) return null
  const steps = history.steps()
  if (event.key === 'Escape') return steps.some((step) => isLayer(step.kind)) ? 'escape' : null
  if (!inside || !steps.length || !isBackKey(event)) return null
  if (event.key === 'ArrowLeft' && typing(event.target)) return null
  return 'back'
}

// Put a scroll position back once the restored view is tall enough; the
// view may still be loading, so try for a few frames. Instant, so it needs
// nothing for reduced motion.
export function settleScroll(
  element: { scrollTop: number } | null,
  top: number,
  frame: (step: () => void) => unknown,
  tries = 60,
): void {
  if (!element) return
  const step = (left: number) => {
    element.scrollTop = top
    if (Math.abs(element.scrollTop - top) >= 2 && left > 0) frame(() => step(left - 1))
  }
  step(tries)
}

type Frame = (step: () => void) => unknown

// The history with what Back needs to put a view back as it was.
export interface Nav {
  history: NavHistory
  // View state kept while a view is closed, so Back can reopen it as it was.
  memory: Map<string, unknown>
  takeMemory(): Map<string, unknown>
  putMemory(saved: Map<string, unknown>): void
  // The pane that scrolls the views.
  scroller: { current: { scrollTop: number } | null }
  scrollTop(): number
  restoreScroll(top: number): void
  // A view's own Back, for steps it keeps (the Graph's drill levels).
  handlers: Map<string, () => void>
  // The mounted setter of each stepped value.
  setters: Map<string, (value: never) => void>
}

const nextFrame: Frame = (step) => (typeof requestAnimationFrame === 'undefined' ? setTimeout(step, 16) : requestAnimationFrame(step))

export function createNav(frame: Frame = nextFrame): Nav {
  const memory = new Map<string, unknown>()
  const scroller: Nav['scroller'] = { current: null }
  return {
    history: createNavHistory(),
    memory,
    takeMemory() {
      const saved = new Map(memory)
      memory.clear()
      return saved
    },
    putMemory(saved) {
      memory.clear()
      saved.forEach((value, key) => memory.set(key, value))
    },
    scroller,
    scrollTop: () => scroller.current?.scrollTop ?? 0,
    // After the restored view renders, and again while it loads.
    restoreScroll: (top) => void frame(() => settleScroll(scroller.current, top, frame)),
    handlers: new Map(),
    setters: new Map(),
  }
}

// A stepped value changed (an inner tab, an opened plan): Back puts
// `previous` back, in memory and in the mounted view, with the scroll.
export function recordChange<T>(nav: Nav, kind: StepKind, key: string, label: string, previous: T, taken?: Set<number>): number {
  const top = nav.scrollTop()
  const id = nav.history.push({
    kind,
    label,
    back: () => {
      nav.history.release(id)
      taken?.delete(id)
      nav.memory.set(key, previous)
      ;(nav.setters.get(key) as ((value: T) => void) | undefined)?.(previous)
      nav.restoreScroll(top)
    },
  })
  taken?.add(id)
  return id
}

// Where the page is: the tab, the Settings section, and the Graph's focus
// and drill-in.
export interface Place<Tab extends string = string, Section extends string = string, Drill = unknown> {
  tab: Tab
  settingsTab: Section
  focus: string | null
  drill: Drill | null
}

// Change the page. A new tab or Settings section is a Back step that
// keeps `here`, the views' remembered state (a new tab starts fresh) and
// the scroll position. `apply` sets the fields it is given. `open` deep-links
// into the new place's inner views ({ 'untriaged-show': 'ideas' }): it is
// written after the old tab's memory is taken, so the fresh view starts on it.
export function changePage<P extends Place>(
  nav: Nav,
  here: P,
  next: Partial<P>,
  apply: (place: Partial<P>) => void,
  label: (here: P, newTab: boolean) => string,
  open: Record<string, unknown> = {},
): void {
  const newTab = next.tab !== undefined && next.tab !== here.tab
  const newSection = next.settingsTab !== undefined && next.settingsTab !== here.settingsTab
  if (newTab || newSection) {
    const top = nav.scrollTop()
    const saved = newTab ? nav.takeMemory() : null
    const id = nav.history.push({
      kind: newTab ? 'tab' : 'inner',
      label: label(here, newTab),
      back: () => {
        nav.history.release(id)
        if (saved) nav.putMemory(saved)
        apply(here)
        nav.restoreScroll(top)
      },
    })
  }
  for (const [key, value] of Object.entries(open)) {
    nav.memory.set(key, value)
    // On the same tab the view is mounted and reads memory only once.
    if (!newTab) (nav.setters.get(key) as ((value: unknown) => void) | undefined)?.(value)
  }
  apply(next)
}
