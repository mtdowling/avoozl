import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi, useChatLauncher } from '@kirocrew/app-sdk'
import { Btn, EmptyState, PageHeader, SegmentedControl } from '@kirocrew/app-sdk/ui'
import Logo from './Logo'
import DashboardView, { type DashboardTarget } from './DashboardView'
import PlansView, { type PlanTarget } from './PlansView'
import GraphView from './GraphView'
import DeliveryView from './DeliveryView'
import ConflictsView from './ConflictsView'
import UntriagedView from './UntriagedView.tsx'
import FlowView from './FlowView.tsx'
import { untriagedClient } from './untriaged-api.ts'
import SettingsView, { SETTINGS_TABS, type SettingsTab } from './SettingsView'
import { SETTINGS_HOME, settingsTabOnEnter } from './settings-api.ts'
import { DRAFT_MESSAGE } from './plans-api'
import { TaskDrawerProvider } from './TaskDrawer'
import Badge from './Badge.tsx'
import { ConfirmProvider, ViewLabel } from './controls.tsx'
import { setSharedFilter } from './FilterBar.tsx'
import type { TaskFilter } from './filters.ts'
import type { Drill } from './graph-layout.ts'
import { viewsClient } from './views-api.ts'
import { APP_ATTR, NavHistoryProvider, useNav } from './NavHistory.tsx'
import { changePage } from './nav-history.ts'
import {
  errorMessage,
  pickDefault,
  readPageState,
  workspaceClient,
  writePageState,
  type WorkspaceList,
} from './workspace-api'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'plans', label: 'Plans' },
  { key: 'graph', label: 'Graph' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'flow', label: 'Flow' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'untriaged', label: 'Untriaged' },
  { key: 'settings', label: 'Settings' },
] as const

type Tab = (typeof TABS)[number]['key']

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function WorkspacePicker(props: {
  list: WorkspaceList | null
  value: string | null
  onChange: (id: string) => void
}) {
  const { list } = props
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Workspace</span>
      <select
        aria-label="Workspace"
        value={props.value ?? ''}
        disabled={!list?.items.length}
        onChange={(event) => props.onChange(event.target.value)}
        className="rounded border px-2 py-1 text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }}
      >
        {!list ? (
          <option value="">Loading…</option>
        ) : list.items.length === 0 ? (
          <option value="">None yet</option>
        ) : (
          list.items.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))
        )}
      </select>
    </label>
  )
}

const tabLabel = (key: Tab) => TABS.find((t) => t.key === key)?.label ?? key

export default function AvoozlApp() {
  return (
    <NavHistoryProvider>
      <AvoozlPage />
    </NavHistoryProvider>
  )
}

function AvoozlPage() {
  const nav = useNav()
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const { openChat } = useChatLauncher()
  const saved = useMemo(() => readPageState(storage()), [])
  // The page always opens on the Dashboard; the tab is remembered only while
  // the page stays open.
  const [tab, setTab] = useState<Tab>('dashboard')
  // Settings starts on Workspaces each visit (settingsTabOnEnter).
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(SETTINGS_HOME)
  const [focus, setFocus] = useState<string | null>(null)
  // The Graph's drill-in: one epic's sub-graph or one task's chain.
  const [drill, setDrill] = useState<Drill | null>(null)
  // Open conflicts, for the yellow count after the Conflicts tab's label.
  const [conflicts, setConflicts] = useState(0)
  // Untriaged items (§8.5): null hides the tab, as in Local only mode.
  const [untriaged, setUntriaged] = useState<number | null>(null)
  const views = useMemo(() => viewsClient(api), [api])
  const untriagedReads = useMemo(() => untriagedClient(api), [api])
  const [workspaceId, setWorkspaceId] = useState<string | null>(saved.workspaceId)
  const [list, setList] = useState<WorkspaceList | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The header's catalog. Settings > Workspaces hands over a fresh one after
  // it adds or refreshes, so a new workspace appears here too.
  const takeList = useCallback((next: WorkspaceList) => {
    setList(next)
    setWorkspaceId((current) => pickDefault(next, current))
  }, [])

  useEffect(() => {
    client.list().then(takeList, (caught: unknown) => setError(errorMessage(caught)))
  }, [client, takeList])

  useEffect(() => {
    writePageState(storage(), { workspaceId })
  }, [workspaceId])

  // Every change of tab or Settings section is a Back step that keeps
  // where the page was (changePage).
  const here = { tab, settingsTab, focus, drill }
  const apply = (place: Partial<typeof here>) => {
    if (place.focus !== undefined) setFocus(place.focus)
    if (place.drill !== undefined) setDrill(place.drill)
    if (place.settingsTab !== undefined) setSettingsTab(place.settingsTab)
    if (place.tab !== undefined) setTab(place.tab)
  }
  const go = (next: Partial<typeof here>) =>
    changePage(nav, here, next, apply, (before, newTab) => (newTab ? `Back to ${tabLabel(before.tab)}` : 'Back to the previous Settings section'))
  const openWorkspaces = () => go({ settingsTab: 'workspaces', tab: 'settings' })
  // A saved workspace counts only once the catalog confirms it still exists.
  const active = list ? workspaceId : null
  const needsWorkspace = tab !== 'settings' && !active

  const navigate = (target: DashboardTarget, taskId?: string) => go({ focus: taskId ?? null, drill: null, tab: target })
  // A Plans row's Graph or Delivery button, or a Dashboard count: set the
  // tabs' shared filter, then open the tab. The filter bar shows it, and
  // Clear undoes it.
  const scopeTo = (target: PlanTarget, filter: TaskFilter) => {
    if (active) setSharedFilter(active, filter)
    go({ focus: null, drill: null, tab: target })
  }
  // On the Graph already, a drill is the Graph's own Back step.
  const openDrill = (next: Drill) => go({ focus: null, drill: next, tab: 'graph' })
  const chooseTab = (key: Tab) =>
    go({
      focus: null,
      drill: null,
      settingsTab: settingsTabOnEnter(tab, key, settingsTab, SETTINGS_TABS.map((t) => t.key)),
      tab: key,
    })

  useEffect(() => {
    if (!active) return setConflicts(0)
    let live = true
    const read = () =>
      views.conflicts(active).then(
        (items) => live && setConflicts(items.length),
        () => undefined,
      )
    void read()
    const timer = setInterval(read, 60000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, views, tab])

  useEffect(() => {
    if (!active) return setUntriaged(null)
    let live = true
    const read = () =>
      untriagedReads.view(active).then(
        (list) => live && setUntriaged(list.enabled ? list.total : null),
        () => undefined,
      )
    void read()
    const timer = setInterval(read, 60000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, untriagedReads, tab])
  // Leaving a GitHub mode hides the tab; don't strand the page on it.
  useEffect(() => {
    if (untriaged === null && tab === 'untriaged') setTab('dashboard')
  }, [untriaged, tab])

  return (
    <div {...{ [APP_ATTR]: '' }} style={{ display: 'contents' }}>
    <ConfirmProvider>
    <TaskDrawerProvider workspaceId={active} onFocus={(id, title) => openDrill({ kind: 'focus', id, title })}>
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Logo size={28} />
            Avoozl
          </span>
        }
        subtitle="Plan work as a graph, then deliver ready tasks through Kiro Crew"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <WorkspacePicker list={list} value={workspaceId} onChange={setWorkspaceId} />
            <Btn type="button" primary onClick={() => openChat({ message: DRAFT_MESSAGE, autoSend: false })}>
              Plan a goal
            </Btn>
          </div>
        }
      />
      <div className="px-6 pb-3">
        <SegmentedControl
          layoutId="avoozl-views"
          ariaLabel="Avoozl views"
          segments={TABS.filter((t) => t.key !== 'untriaged' || untriaged !== null).map((t) => ({
            key: t.key,
            label:
              t.key === 'untriaged' && untriaged ? (
                <span className="inline-flex items-center gap-1.5" aria-label={`Untriaged, ${untriaged} items`}>
                  <ViewLabel view="untriaged">Untriaged</ViewLabel> <Badge variant="info">{untriaged}</Badge>
                </span>
              ) : t.key === 'conflicts' && conflicts > 0 ? (
                <span className="inline-flex items-center gap-1.5" aria-label={`Conflicts, ${conflicts} need you`}>
                  <ViewLabel view="conflicts">Conflicts</ViewLabel> <Badge variant="warning">{conflicts}</Badge>
                </span>
              ) : (
                <ViewLabel view={t.key}>{t.label}</ViewLabel>
              ),
          }))}
          value={tab}
          onChange={(key) => chooseTab(key as Tab)}
          wrap
        />
      </div>
      {error && (
        <p role="alert" className="px-6 pb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div
        ref={(element) => {
          nav.scroller.current = element
        }}
        data-avoozl-pane
        className="flex-1 min-h-0 overflow-y-auto px-6 pb-8"
      >
        {needsWorkspace ? (
          <EmptyState
            icon={<Logo size={40} />}
            title={!list ? 'Loading workspaces…' : list.items.length === 0 ? 'No workspace yet' : 'Pick a workspace'}
            subtitle={
              list?.items.length === 0
                ? 'Add or initialize a workspace in Settings. Every tab reads from it.'
                : 'Choose one in the header. Every tab reads from it.'
            }
            action={
              list?.items.length === 0 ? (
                <Btn type="button" onClick={openWorkspaces}>
                  Open Settings › Workspaces
                </Btn>
              ) : undefined
            }
          />
        ) : tab === 'dashboard' ? (
          <DashboardView workspaceId={active} untriaged={untriaged} onNavigate={navigate} onScope={scopeTo} onDrill={openDrill} />
        ) : tab === 'plans' ? (
          <PlansView workspaceId={active} onScope={scopeTo} onDrill={openDrill} />
        ) : tab === 'graph' ? (
          <GraphView workspaceId={active} focus={focus} drill={drill} onDrill={setDrill} />
        ) : tab === 'delivery' ? (
          <DeliveryView workspaceId={active} />
        ) : tab === 'conflicts' ? (
          <ConflictsView workspaceId={active} />
        ) : tab === 'flow' ? (
          <FlowView workspaceId={active} />
        ) : tab === 'untriaged' ? (
          <UntriagedView workspaceId={active} />
        ) : (
          <SettingsView
            workspaceId={active}
            tab={settingsTab}
            onTab={(next) => go({ settingsTab: next })}
            onSelectWorkspace={(id) => id && setWorkspaceId(id)}
            onListChange={takeList}
            onOpenPlans={() => chooseTab('plans')}
          />
        )}
      </div>
    </div>
    </TaskDrawerProvider>
    </ConfirmProvider>
    </div>
  )
}
