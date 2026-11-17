// The page's top-level views and where an old place now goes. Kept free of
// JSX so node can test it directly.

// The nav row: Dashboards, Specs, Needs you,
// Flow, Activity, Settings. Dashboards' key stays 'dashboard' (its Home), so
// an older link or Back step to Home still lands there.
export const TABS = [
  { key: 'dashboard', label: 'Dashboards' },
  { key: 'plans', label: 'Specs' },
  { key: 'waiting', label: 'Needs you' },
  { key: 'flow', label: 'Flow' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
] as const

export type NavTab = (typeof TABS)[number]['key']

// The sub-pages of a nav section that has them. Settings' own list is
// SETTINGS_TABS (SettingsView.tsx). Each is a page of its own, shown by the
// left nav, never by a tab bar in the content.
export type FlowTab = 'overview' | 'retros' | 'proposals'
export const FLOW_TABS: { key: FlowTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'retros', label: 'Retros' },
  { key: 'proposals', label: 'Proposals' },
]
export type WaitingSection = 'decisions' | 'intake'
export const WAITING_SECTIONS: { key: WaitingSection; title: string; line: string }[] = [
  { key: 'decisions', title: 'Decisions and conflicts', line: 'A crew handed work back, a spec or issue was edited by hand, or a task needs your choice.' },
  { key: 'intake', title: 'Planning and intake', line: 'Issues labeled for planning and new issues. You choose which become work.' },
]
// Dashboards' pages. Home is the 'dashboard' tab itself; Graph, Delivery, Lanes and CI
// are pages of their own that light Dashboards in the nav.
export type DashboardPage = 'home' | 'graph' | 'delivery' | 'lanes' | 'ci'
export const DASHBOARD_PAGES: { key: DashboardPage; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'graph', label: 'Graph' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'lanes', label: 'Lanes' },
  { key: 'ci', label: 'CI' },
]
export type Tab = NavTab | 'graph' | 'delivery' | 'lanes' | 'ci'
export const dashboardTab = (page: string): Tab => (['graph', 'delivery', 'lanes', 'ci'].includes(page) ? (page as Tab) : 'dashboard')
export const dashboardPage = (tab: Tab): DashboardPage | null =>
  tab === 'dashboard' ? 'home' : tab === 'graph' || tab === 'delivery' || tab === 'lanes' || tab === 'ci' ? tab : null

const PAGE_LABEL: Record<string, string> = { graph: 'Graph', delivery: 'Delivery', lanes: 'Lanes', ci: 'CI', dashboard: 'Home' }
export const tabLabel = (key: Tab) => PAGE_LABEL[key] ?? TABS.find((t) => t.key === key)?.label ?? key
// The nav entry that is lit for a page.
export const navTab = (key: Tab): NavTab => (dashboardPage(key) ? 'dashboard' : (key as NavTab))

// Where a page name from an older link, or a saved Back step
// goes now. Removed pages land on the page that took over their job.
export interface Place {
  tab: Tab
  // An inner view to open there (a Needs you section).
  open?: Record<string, unknown>
}

// `waiting-section` in a Place's `open` is the Needs you section; App turns
// it into its own place field (waitingSection).
export function redirectTab(key: string): Place {
  switch (key) {
    case 'conflicts':
      return { tab: 'waiting', open: { 'waiting-section': 'decisions' } }
    case 'untriaged':
      return { tab: 'waiting', open: { 'waiting-section': 'intake' } }
    case 'routing':
      return { tab: 'settings' }
    // Trace is gone (R106): its steps are the Timeline box in task details.
    case 'trace':
      return { tab: 'delivery' }
    default:
      return { tab: TABS.some((t) => t.key === key) || dashboardPage(key as Tab) ? (key as Tab) : 'dashboard' }
  }
}

// A Settings section that no longer exists lands on the section that took
// over: Routing's job (crews and placement) is gone with local workers, and
// the instance name is edited from the nav footer, and Where tasks live is a
// role per repository in Repository setup (R105.6).
export function redirectSettings(key: string): string {
  return key === 'routing' || key === 'github' ? 'repositories' : key === 'instance' ? 'workspaces' : key
}

// A repository still set to the retired Avoozl worker. In a mode that has a
// default coder, a blank coder is that default.
export const RETIRED_LINE = 'Local workers are retired. Switch to Issue Radar.'

export function retiredCoders(repositories: { name: string; coder: string }[], defaultCoder: string): string[] {
  return repositories.filter((r) => (r.coder || defaultCoder) === 'worker').map((r) => r.name)
}

// An old `?trace=owner/repo#52` link: the issue it names. Anything else is no
// link. The page opens the details of the task that owns that issue (R106.8).
export function parseTraceLink(search: string): { repository: string; number: number } | null {
  const value = new URLSearchParams(search).get('trace'),
    match = /^([^/\s#]+\/[^/\s#]+)#([1-9]\d*)$/.exec(value ?? '')
  return match ? { repository: match[1], number: Number(match[2]) } : null
}

// The task that owns the issue an old trace link names, from the stored graph.
export const taskForIssue = <T extends { issue: { number: number | null; repository: string | null } | null; repository: string | null }>(graph: { tasks: T[] }, link: { repository: string; number: number }) =>
  graph.tasks.find((task) => task.issue?.number === link.number && (task.issue.repository ?? task.repository) === link.repository)
