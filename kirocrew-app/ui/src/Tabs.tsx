// The one tab bar for a page's groups (WAI-ARIA tabs): the bar takes the
// full width and scrolls sideways on a narrow screen, arrow keys, Home and
// End move between tabs, and a tab with unsaved changes shows a dot. Pages
// that want tabs use this, not their own bar: Settings › GitHub, and the
// spec page and Review view through DocTabs (ReviewView.tsx).
//
// useTabParam keeps the open tab in the page address (?<param>=<key>) on
// Kiro Crew's /apps/<name> route, so the browser's Back and a pasted link
// land on it, and each change is also a step in the page's own Back history
// (NavHistory.tsx), so Alt+Left and the mouse back button walk it too.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from './host.ts'
import { useNav } from './NavHistory.tsx'
import { urlBase } from './focus-tree.ts'
import { readTab, tabKey, tabLink } from './tabs.ts'

const ACCENT = 'color-mix(in srgb, var(--aim) 72%, var(--text-strong, var(--text)))'

export interface TabItem<T extends string = string> {
  key: T
  label: string
  // Unsaved changes on this tab: a dot after the label.
  dirty?: boolean
  // Anything else after the label, such as a count.
  badge?: ReactNode
}

// `id` prefixes the ids: <id>-<key> for a tab, <id>-panel for its panel.
export const tabId = (id: string, key: string) => `${id}-${key.replace(/\W/g, '-')}`
export const panelId = (id: string) => `${id}-panel`

export function Tabs<T extends string>(props: {
  id: string
  label: string
  tabs: readonly TabItem<T>[]
  current: T
  onPick: (key: T) => void
  // Extra data attributes: one on the bar, and one per tab set to its key.
  barAttr?: string
  tabAttr?: string
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const bar = useRef<HTMLDivElement>(null)
  // Keep the open tab in view, moving only the bar, never the page.
  useEffect(() => {
    const el = refs.current.get(props.current),
      box = bar.current
    if (!el || !box) return
    if (el.offsetLeft < box.scrollLeft) box.scrollLeft = el.offsetLeft
    else if (el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft + el.offsetWidth - box.clientWidth
  }, [props.current])
  const keys = props.tabs.map((tab) => tab.key)
  const key = (event: KeyboardEvent) => {
    const next = tabKey(event.key, keys, props.current) as T | null
    if (!next) return
    event.preventDefault()
    props.onPick(next)
    refs.current.get(next)?.focus()
  }
  // flex: none: in a column that scrolls (the Review side column) a bar
  // that scrolls sideways would otherwise shrink to nothing.
  return (
    <div
      ref={bar}
      role="tablist"
      aria-label={props.label}
      data-tabs={props.id}
      {...(props.barAttr ? { [props.barAttr]: '' } : {})}
      onKeyDown={key}
      style={{ display: 'flex', flex: 'none', width: '100%', gap: 2, borderBottom: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'thin', minWidth: 0 }}
    >
      {props.tabs.map((tab) => {
        const on = tab.key === props.current
        return (
          <button
            key={tab.key}
            ref={(el) => {
              if (el) refs.current.set(tab.key, el)
              else refs.current.delete(tab.key)
            }}
            type="button"
            role="tab"
            id={tabId(props.id, tab.key)}
            aria-selected={on}
            aria-controls={panelId(props.id)}
            tabIndex={on ? 0 : -1}
            data-tab={tab.key}
            {...(props.tabAttr ? { [props.tabAttr]: tab.key } : {})}
            data-dirty={tab.dirty ? 'true' : undefined}
            onClick={() => props.onPick(tab.key)}
            style={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              marginBottom: -1,
              border: 0,
              borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`,
              borderRadius: 0,
              background: 'transparent',
              color: on ? 'var(--text-strong, var(--text))' : 'var(--muted)',
              fontSize: 13,
              fontWeight: on ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.dirty && (
              <span data-tab-dot aria-label="unsaved changes" role="img" style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT, flexShrink: 0 }} />
            )}
            {tab.badge}
          </button>
        )
      })}
    </div>
  )
}

// The open tab's content, named by its tab.
export function TabPanel(props: { id: string; current: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(props.id)} aria-labelledby={tabId(props.id, props.current)} data-tab-panel={props.current} className="flex min-w-0 flex-col gap-3.5">
      {props.children}
    </div>
  )
}

// The open tab, kept in the address under `param` (see the file comment).
// A pasted ?<param>=<key> opens that tab; an address without it opens
// `fallback`.
export function useTabParam<T extends string>(param: string, keys: readonly T[], fallback: T, label: string): [T, (next: T) => void] {
  const nav = useNav()
  const navigate = useNavigate()
  const [value, setValue] = useState<T>(() => readTab(window.location.search, param, keys) ?? fallback)
  const current = useRef(value)
  current.current = value
  // This bar's own steps in the page's Back history, newest last, and
  // whether each one pushed a browser entry.
  const steps = useRef<{ id: number; url: boolean }[]>([])
  const pick = useCallback(
    (next: T) => {
      const previous = current.current
      if (next === previous) return
      const base = urlBase(window.location.pathname)
      let url = false
      if (base) {
        const link = tabLink(param, next)
        try {
          navigate(base + link)
          url = window.location.search === link
        } catch {
          // The address is a convenience; the tab still changes.
        }
      }
      const id = nav.history.push({
        kind: 'inner',
        label,
        back: () => {
          nav.history.release(id)
          steps.current = steps.current.filter((step) => step.id !== id)
          if (url) window.history.back()
          else setValue(previous)
        },
      })
      steps.current.push({ id, url })
      setValue(next)
    },
    [nav, navigate, param, label],
  )
  // The browser's Back and Forward: the address says which tab. A browser
  // Back takes this bar's newest step with it, so Alt+Left stays in step.
  useEffect(() => {
    const onPop = () => {
      const at = readTab(window.location.search, param, keys) ?? fallback
      if (at === current.current) return
      const top = steps.current.at(-1)
      if (top?.url) {
        nav.history.release(top.id)
        steps.current.pop()
      }
      setValue(at)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [nav, param, keys, fallback])
  // Steps go with the bar.
  useEffect(
    () => () => {
      for (const step of steps.current) nav.history.release(step.id)
      steps.current = []
    },
    [nav],
  )
  return [value, pick]
}
