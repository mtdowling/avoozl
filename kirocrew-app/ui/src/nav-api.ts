// The page's top-level views. Kept free of JSX so node can test it directly.

// The nav row: Dashboards, Specs, Needs you, GitHub, Flow, Retros,
// Activity, Settings. Dashboards' key is 'dashboard' (its Home).
export const TABS = [
  { key: 'dashboard', label: 'Dashboards' },
  { key: 'plans', label: 'Specs' },
  { key: 'waiting', label: 'Needs you' },
  { key: 'github', label: 'GitHub' },
  { key: 'flow', label: 'Flow' },
  { key: 'retros', label: 'Retros' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
] as const

export type NavTab = (typeof TABS)[number]['key']

// The sub-pages of a nav section that has them. Settings' own list is
// SETTINGS_TABS (SettingsView.tsx). Each is a page of its own, shown by the
// left nav, never by a tab bar in the content.
export type RetrosPage = 'retros' | 'proposals'
export const RETROS_PAGES: { key: RetrosPage; label: string }[] = [
  { key: 'retros', label: 'Retros' },
  { key: 'proposals', label: 'Proposals' },
]
// GitHub's pages (triage-agent TA6, TA8): Issues, Pull requests and the
// Triage agent.
export type GitHubPage = 'issues' | 'pulls' | 'agent'
export const GITHUB_PAGES: { key: GitHubPage; label: string }[] = [
  { key: 'issues', label: 'Issues' },
  { key: 'pulls', label: 'Pull requests' },
  { key: 'agent', label: 'Triage agent' },
]
export type WaitingSection = 'decisions' | 'agent' | 'triage' | 'radar'
export const WAITING_SECTIONS: { key: WaitingSection; title: string; line: string }[] = [
  { key: 'decisions', title: 'Decisions', line: 'A crew handed work back, a spec or issue was edited by hand, or a task needs your choice.' },
  { key: 'agent', title: 'From the agent', line: 'Issues and pull requests the triage agent handed to you, each with its reason.' },
  { key: 'triage', title: 'Triage', line: 'New issues and pull requests nothing covers yet. You choose which become work.' },
  { key: 'radar', title: 'Issue Radar', line: 'Issues you sent to an Issue Radar crew, or that one is holding.' },
]
// Dashboards' pages. Home is the 'dashboard' tab itself; Graph, Delivery and
// Landing queue are pages of their own that light Dashboards in the nav.
export type DashboardPage = 'home' | 'graph' | 'delivery' | 'landing'
export const DASHBOARD_PAGES: { key: DashboardPage; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'graph', label: 'Graph' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'landing', label: 'Landing queue' },
]
export type Tab = NavTab | 'graph' | 'delivery' | 'landing'
const PAGES: string[] = ['graph', 'delivery', 'landing']
export const dashboardTab = (page: string): Tab => (PAGES.includes(page) ? (page as Tab) : 'dashboard')
export const dashboardPage = (tab: Tab): DashboardPage | null => (tab === 'dashboard' ? 'home' : PAGES.includes(tab) ? (tab as DashboardPage) : null)

const PAGE_LABEL: Record<string, string> = { graph: 'Graph', delivery: 'Delivery', landing: 'Landing queue', dashboard: 'Home' }
export const tabLabel = (key: Tab) => PAGE_LABEL[key] ?? TABS.find((t) => t.key === key)?.label ?? key
// The nav entry that is lit for a page.
export const navTab = (key: Tab): NavTab => (dashboardPage(key) ? 'dashboard' : (key as NavTab))
