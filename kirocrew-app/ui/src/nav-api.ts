// The page's top-level views and where an old place now goes. Kept free of
// JSX so node can test it directly.

// The nav row: Home, Epics, Waiting on you, Trace, Flow, Activity, Settings.
export const TABS = [
  { key: 'dashboard', label: 'Home' },
  { key: 'plans', label: 'Epics' },
  { key: 'waiting', label: 'Waiting on you' },
  { key: 'trace', label: 'Trace' },
  { key: 'flow', label: 'Flow' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
] as const

export type NavTab = (typeof TABS)[number]['key']
// Graph is a page inside Epics, not a nav entry: it keeps the plan drill-in.
export type Tab = NavTab | 'graph'

export const tabLabel = (key: Tab) => (key === 'graph' ? 'Epics' : (TABS.find((t) => t.key === key)?.label ?? key))
// The nav entry that is lit for a page.
export const navTab = (key: Tab): NavTab => (key === 'graph' ? 'plans' : key)

// Where a page name from an older link, a saved Back step or the demo tour
// goes now. Removed pages land on the page that took over their job.
export interface Place {
  tab: Tab
  // An inner view to open there (a Waiting on you section).
  open?: Record<string, unknown>
}

export function redirectTab(key: string): Place {
  switch (key) {
    case 'delivery':
      return { tab: 'dashboard' }
    case 'conflicts':
      return { tab: 'waiting', open: { 'waiting-section': 'decisions' } }
    case 'untriaged':
      return { tab: 'waiting', open: { 'waiting-section': 'intake' } }
    case 'routing':
      return { tab: 'settings' }
    default:
      return { tab: TABS.some((t) => t.key === key) || key === 'graph' ? (key as Tab) : 'dashboard' }
  }
}

// A Settings section that no longer exists lands on the section that took
// over: Routing's job (crews and placement) is gone with local workers.
export function redirectSettings(key: string): string {
  return key === 'routing' ? 'repositories' : key
}

// A repository still set to the retired Avoozl worker. In a mode that has a
// default coder, a blank coder is that default.
export const RETIRED_LINE = 'Local workers are retired. Switch to Issue Radar.'

export function retiredCoders(repositories: { name: string; coder: string }[], defaultCoder: string): string[] {
  return repositories.filter((r) => (r.coder || defaultCoder) === 'worker').map((r) => r.name)
}
