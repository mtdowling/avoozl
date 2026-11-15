// The page's Refresh, drawn in the left nav. A page (Home) runs
// its own countdown and publishes it here; the left nav draws the icon. A
// small store, so the countdown's tick re-renders only that icon.
import { useEffect, useSyncExternalStore } from 'react'
import { BareRefresh, type RefreshState } from './RefreshButton.tsx'

let current: RefreshState | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listen) => listen())
const subscribe = (listen: () => void) => {
  listeners.add(listen)
  return () => listeners.delete(listen)
}

// A page calls this with its countdown; it is withdrawn when the page goes.
export function usePublishRefresh(state: RefreshState) {
  useEffect(() => {
    current = state
    emit()
  })
  useEffect(
    () => () => {
      current = null
      emit()
    },
    [],
  )
}

// Whether the open page has a Refresh to put in a menu.
export function useHasPageRefresh() {
  return useSyncExternalStore(subscribe, () => current !== null)
}

// The nav's Refresh: the aging icon alone, or nothing when the page has none.
export function PageRefreshIcon() {
  const state = useSyncExternalStore(subscribe, () => current)
  return state ? <BareRefresh nav state={state} /> : null
}
