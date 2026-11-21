// The page's top-level views (simplify §D13). Kept free of JSX so node can
// test it directly.

// The nav row: Insights, Specs, Graph, In flight, Needs you, Activity,
// Settings. Insights is the page's home. In flight's key is 'delivery' and
// Specs' is 'plans'.
export const TABS = [
  { key: 'insights', label: 'Insights' },
  { key: 'plans', label: 'Specs' },
  { key: 'graph', label: 'Graph' },
  { key: 'delivery', label: 'In flight' },
  { key: 'waiting', label: 'Needs you' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
] as const

export type NavTab = (typeof TABS)[number]['key']
export type Tab = NavTab

// The sub-pages of a nav section that has them. Settings' own list is
// SETTINGS_TABS (SettingsView.tsx). Each is a page of its own, shown by the
// left nav, never by a tab bar in the content.
export type WaitingSection = 'decisions'
export const WAITING_SECTIONS: { key: WaitingSection; title: string; line: string }[] = [
  { key: 'decisions', title: 'Decisions', line: 'A worker handed work back, a spec or issue was edited by hand, or a task needs your choice.' },
]

export const tabLabel = (key: Tab) => TABS.find((t) => t.key === key)?.label ?? key
