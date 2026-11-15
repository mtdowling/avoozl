// The page's Refresh, drawn in the header's More menu. A page (Home) runs
// its own countdown and publishes it here; the menu draws the button while
// open. A small store, so the countdown's tick re-renders only the menu item.
import { useEffect, useSyncExternalStore } from 'react'
import { RefreshControl, type RefreshState } from './RefreshButton.tsx'

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

// The menu's Refresh, or nothing when the page has none.
export function PageRefreshItem() {
  const state = useSyncExternalStore(subscribe, () => current)
  return state ? (
    <span className="inline-flex items-center gap-2 text-sm" data-page-refresh>
      <RefreshControl state={state} />
      <span className="text-xs text-muted">Refresh</span>
    </span>
  ) : null
}
