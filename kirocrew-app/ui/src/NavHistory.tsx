// The page's Back history (nav-history.ts) wired to React and the window.
// One listener, in the window's capture phase, claims the mouse back button,
// Alt+Left and Cmd+[ when they come from the Avoozl page and Avoozl has a
// step to take, so Kiro Crew neither leaves the page nor switches chat. At
// the root they fall through to Kiro Crew. Esc closes the topmost layer.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { createNav, isBackButton, keyAction, recordChange, type Nav, type StepKind } from './nav-history.ts'

// Marks the page's elements, including those portaled to <body>.
export const APP_ATTR = 'data-avoozl-app'

const NavContext = createContext<Nav | null>(null)
let loose: Nav | null = null
// Outside the provider (a view rendered alone) a private history still works.
export const useNav = (): Nav => useContext(NavContext) ?? (loose ??= createNav())

const fromPage = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(`[${APP_ATTR}]`))

export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const nav = useMemo(createNav, [])
  useEffect(() => {
    // A key pressed with nothing focused belongs to where the pointer was.
    let pointerInside = false
    const inside = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target !== document.body && target !== document.documentElement) return fromPage(target)
      return pointerInside
    }
    const onPointer = (event: Event) => {
      pointerInside = fromPage(event.target)
    }
    const onKey = (event: KeyboardEvent) => {
      const action = keyAction(event, inside(event), nav.history)
      if (!action) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (action === 'escape') nav.history.escape()
      else nav.history.back()
    }
    const ours = (event: MouseEvent) => isBackButton(event) && fromPage(event.target) && nav.history.steps().length > 0
    // Cancelling the press stops Chromium's own Back; stopping it keeps it
    // from Kiro Crew's window listener.
    const hold = (event: MouseEvent) => {
      if (!ours(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const onUp = (event: MouseEvent) => {
      if (!ours(event)) return
      hold(event)
      nav.history.back()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', hold, true)
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('auxclick', hold, true)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', hold, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('auxclick', hold, true)
    }
  }, [nav])
  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>
}

// A drawer, modal or confirm: one step while `open`. Back runs `back` (the
// same as Cancel, so unsaved changes ask first); Esc runs `dismiss`, or
// `back`. Focus goes back to the control that opened it.
export function useBackStep(kind: StepKind, open: boolean, label: string, back: () => void, dismiss?: () => void): void {
  const nav = useNav()
  const latest = useRef({ back, dismiss })
  latest.current = { back, dismiss }
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const id = nav.history.push({
      kind,
      label,
      back: () => latest.current.back(),
      dismiss: () => (latest.current.dismiss ?? latest.current.back)(),
    })
    return () => {
      nav.history.release(id)
      const now = document.activeElement
      if (opener?.isConnected && (!now || now === document.body)) opener.focus()
    }
    // The label is read once; a step keeps the name it was taken with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nav, kind])
}

// State that outlives its view while Back can return to it.
export function useRemembered<T>(key: string, initial: T, keep = true): [T, Dispatch<SetStateAction<T>>] {
  const nav = useNav()
  const [value, setValue] = useState<T>(() => (keep && nav.memory.has(key) ? (nav.memory.get(key) as T) : initial))
  useEffect(() => {
    nav.memory.set(key, value)
  }, [nav, key, value])
  return [value, setValue]
}

// State whose changes are Back steps: an inner tab, or an opened plan.
// `step` records the change; `set` changes it without a step (a reset).
// With `keep`, the value and its steps outlive the view, so Back can reopen
// it as it was; without, they go when the view does (a dialog's sub-tabs).
export function useSteppedState<T>(
  key: string,
  kind: StepKind,
  label: (previous: T) => string,
  initial: T,
  keep = true,
): [T, (next: T) => void, (next: T) => void] {
  const nav = useNav()
  const [value, set] = useRemembered(key, initial, keep)
  const current = useRef(value)
  current.current = value
  useEffect(() => {
    nav.setters.set(key, set as (value: never) => void)
    return () => {
      if (nav.setters.get(key) === set) nav.setters.delete(key)
    }
  }, [nav, key, set])
  const named = useRef(label)
  named.current = label
  const taken = useRef(new Set<number>())
  useEffect(
    () => () => {
      if (!keep) taken.current.forEach((id) => nav.history.release(id))
    },
    [nav, keep],
  )
  const step = useCallback(
    (next: T) => {
      const previous = current.current
      if (Object.is(previous, next)) return
      recordChange(nav, kind, key, named.current(previous), previous, taken.current)
      set(next)
    },
    [nav, key, kind, set],
  )
  return [value, step, set]
}
