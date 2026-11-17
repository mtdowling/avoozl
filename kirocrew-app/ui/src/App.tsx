import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, EmptyState, SegmentedControl } from '@kirocrew/app-sdk/ui'
import Logo from './Logo'
import { BrandCard } from './BrandCard.tsx'
import { RailButton, RailList } from './TopRail.tsx'
import type { NavGroup } from './NavAccordion.tsx'
import { LeftNav, NavLine } from './LeftNav.tsx'
import { PageRefreshIcon, useHasPageRefresh } from './page-refresh.tsx'
import { usePhone } from './list-detail.ts'
import DashboardView, { type DashboardTarget } from './DashboardView'
import PlansView, { type PlanTarget } from './PlansView'
import GraphView from './GraphView'
import WaitingView from './WaitingView.tsx'
import FlowView from './FlowView.tsx'
import { TracePage } from './TraceView.tsx'
import { DASHBOARD_PAGES, FLOW_TABS, TABS, WAITING_SECTIONS, dashboardPage, dashboardTab, navTab, redirectSettings, redirectTab, tabLabel, type FlowTab, type Tab, type WaitingSection } from './nav-api.ts'
import { WorkspacePill } from './WorkspacePill.tsx'
import { NavSlotProvider } from './nav-slot.tsx'
import LanesView from './LanesView.tsx'
import { VIEW_ICONS } from './icons.ts'
import { TRACE_TARGET, parseTraceLink, type TraceTarget } from './trace-api.ts'
import ActivityView from './ActivityView.tsx'
import { StopLineButton } from './StopLine.tsx'
import { untriagedClient } from './untriaged-api.ts'
import type { NewPlanForm } from './new-plan-api.ts'
import SettingsView, { SETTINGS_TABS, type SettingsTab } from './SettingsView'
import { SETTINGS_HOME, settingsTabOnEnter } from './settings-api.ts'
import { TaskDrawerProvider } from './TaskDrawer'
import Badge from './Badge.tsx'
import { ConfirmProvider, ICON, ViewHeading } from './controls.tsx'
import { setSharedFilter } from './FilterBar.tsx'
import type { TaskFilter } from './filters.ts'
import type { Drill } from './graph-layout.ts'
import { viewsClient } from './views-api.ts'
import { APP_ATTR, NavHistoryProvider, useNav } from './NavHistory.tsx'
import { changePage } from './nav-history.ts'
import { DemoBar, DemoProvider, StartDemoButton, useDemo } from './Demo.tsx'
import { DEMO_CATALOG, DEMO_WORKSPACE_ID } from './demo-api.ts'
import {
  errorMessage,
  pickDefault,
  readPageState,
  workspaceClient,
  writePageState,
  type WorkspaceList,
} from './workspace-api'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// A nav entry's label: the view's icon, its word cut short with an ellipsis
// when the nav is narrow, then a count that always stays whole.
function NavLabel(props: { view: keyof typeof VIEW_ICONS; text: string; count?: number }) {
  const Icon = VIEW_ICONS[props.view]
  return (
    <span data-nav-label-row style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
      <Icon size={ICON} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span data-nav-text style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.text}</span>
      {props.count ? (
        <span data-nav-count style={{ flexShrink: 0, display: 'inline-flex' }}>
          <Badge variant="warning">{props.count}</Badge>
        </span>
      ) : null}
    </span>
  )
}

// A page that is planned and not built yet: its heading and one line.
function Placeholder(props: { view: keyof typeof VIEW_ICONS; title: string; line: string }) {
  return (
    <section aria-labelledby={`avoozl-${props.view}-title`} className="flex flex-col gap-3.5" data-placeholder={props.view}>
      <ViewHeading id={`avoozl-${props.view}-title`} view={props.view}>
        {props.title}
      </ViewHeading>
      <p className="text-sm text-muted">{props.line}</p>
    </section>
  )
}

export default function AvoozlApp() {
  return (
    <NavHistoryProvider>
      <DemoProvider>
        <NavSlotProvider>
          <AvoozlPage />
        </NavSlotProvider>
      </DemoProvider>
    </NavHistoryProvider>
  )
}

function AvoozlPage() {
  const nav = useNav()
  const demo = useDemo()
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const saved = useMemo(() => readPageState(storage()), [])
  // The page always opens on the Dashboard; the tab is remembered only while
  // the page stays open.
  const [tab, setTab] = useState<Tab>('dashboard')
  // Settings starts on Workspaces each visit (settingsTabOnEnter).
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(SETTINGS_HOME)
  // The sub-pages the nav shows for Flow and Needs you.
  const [flowTab, setFlowTab] = useState<FlowTab>('overview')
  const [waitingSection, setWaitingSection] = useState<WaitingSection>('decisions')
  const [focus, setFocus] = useState<string | null>(null)
  // The Graph's drill-in: one epic's sub-graph or one task's chain.
  const [drill, setDrill] = useState<Drill | null>(null)
  // Open conflicts, for the yellow count after the Conflicts tab's label.
  const [conflicts, setConflicts] = useState(0)
  // Each Plan a goal press opens the New plan drawer once.
  const [planGoal, setPlanGoal] = useState<{ n: number; seed?: Partial<NewPlanForm> }>({ n: 0 })
  // Untriaged items in Intake (§8.5): null in Local only mode with no
  // intake source, which hides the count.
  const [untriaged, setUntriaged] = useState<number | null>(null)
  const views = useMemo(() => viewsClient(api), [api])

  const untriagedReads = useMemo(() => untriagedClient(api), [api])
  const waitingCount = conflicts + (untriaged ?? 0)
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
  const here = { tab, settingsTab, flowTab, waitingSection, focus, drill }
  const apply = (place: Partial<typeof here>) => {
    if (place.focus !== undefined) setFocus(place.focus)
    if (place.drill !== undefined) setDrill(place.drill)
    if (place.settingsTab !== undefined) setSettingsTab(place.settingsTab)
    if (place.flowTab !== undefined) setFlowTab(place.flowTab)
    if (place.waitingSection !== undefined) setWaitingSection(place.waitingSection)
    if (place.tab !== undefined) setTab(place.tab)
  }
  // `open` deep-links into the new place's inner views (changePage).
  // A removed page (Delivery, Conflicts, Intake, Routing) goes to the page
  // that took over its job (redirectTab).
  const go = (next: Partial<typeof here>, open?: Record<string, unknown>) => {
    const place = next.tab === undefined ? null : redirectTab(next.tab)
    // A removed page's Needs you section is now a field of the place.
    const section = place?.open?.['waiting-section'] as WaitingSection | undefined
    const { 'waiting-section': _section, ...inner } = place?.open ?? {}
    const settings = next.settingsTab === undefined ? {} : { settingsTab: redirectSettings(next.settingsTab) as SettingsTab }
    changePage(
      nav,
      here,
      { ...next, ...settings, ...(place ? { tab: place.tab } : {}), ...(section ? { waitingSection: section } : {}) },
      apply,
      (before, newTab) => (newTab ? `Back to ${tabLabel(before.tab)}` : 'Back to the previous section'),
      { ...inner, ...open },
    )
  }
  const openWorkspaces = () => go({ settingsTab: 'workspaces', tab: 'settings' })
  // A saved workspace counts only once the catalog confirms it still exists.
  // The demo reads its own sample; the saved choice waits for Exit demo.
  const active = demo.active ? DEMO_WORKSPACE_ID : list ? workspaceId : null
  const needsWorkspace = tab !== 'settings' && !active

  const navigate = (target: DashboardTarget, taskId?: string) => go({ focus: taskId ?? null, drill: null, tab: target })
  // A Plans row's Graph button: set the shared filter, then open the plan
  // graph. The filter bar shows it, and Clear undoes it.
  const scopeTo = (target: PlanTarget, filter: TaskFilter) => {
    if (active) setSharedFilter(active, filter)
    go({ focus: null, drill: null, tab: target })
  }
  // On the Graph already, a drill is the Graph's own Back step.
  const openDrill = (next: Drill) => go({ focus: null, drill: next, tab: 'graph' })
  const openSettings = (section: string) => go({ focus: null, drill: null, tab: 'settings', settingsTab: section as SettingsTab })
  const planEpic = () => {
    // The same New plan drawer, opened on the Specs tab.
    setPlanGoal((request) => ({ n: request.n + 1 }))
    go({ focus: null, drill: null, tab: 'plans' })
  }
  const chooseTab = (key: Tab) =>
    go({
      focus: null,
      drill: null,
      settingsTab: settingsTabOnEnter(tab, key, settingsTab, SETTINGS_TABS.map((t) => t.key)),
      tab: key,
    })

  // A link with ?trace=owner/repo#52 opens that Trace as one Back step from
  // the Dashboard (RC8.2). Read once, when the page opens.
  useEffect(() => {
    const link = parseTraceLink(window.location.search)
    if (link) go({ tab: 'trace', focus: null, drill: null }, { [TRACE_TARGET]: link })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openTrace = (target: TraceTarget) => go({ tab: 'trace', focus: null, drill: null }, { [TRACE_TARGET]: target })
  // Trace's own form picks an issue while Trace is already open.
  const [, bump] = useState(0)
  const pickTrace = (target: TraceTarget) => {
    openTrace(target)
    bump((n) => n + 1)
  }

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
        (list) => {
          if (live) setUntriaged(list.enabled ? list.total : null)
        },
        () => undefined,
      )
    void read()
    const timer = setInterval(read, 60000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, untriagedReads, tab])

  const phone = usePhone()
  const hasRefresh = useHasPageRefresh()
  // The phone's top rail takes the whole page while it is open.
  const [railOpen, setRailOpen] = useState(false)
  const showRail = phone && railOpen
  // Stop the line and Refresh on a phone: icons only, in their own small
  // section at the bottom of the menu. A desktop has them on the top line.
  const lineControls = (active || hasRefresh) && (
    <NavLine>
      {active && <StopLineButton nav workspaceId={active} />}
      <PageRefreshIcon />
    </NavLine>
  )
  // Radar's nav model: Dashboards, Needs you, Flow and Settings open in the
  // nav to their sub-pages; Specs and Activity open to their filters (a
  // slot the page fills); the other pages are plain entries.
  const kids: Partial<Record<Tab, { key: string; label: string }[]>> = {
    dashboard: DASHBOARD_PAGES,
    waiting: WAITING_SECTIONS.map((x) => ({ key: x.key, label: x.title })),
    flow: FLOW_TABS,
    settings: SETTINGS_TABS.map((x) => ({ key: x.key, label: x.label })),
  }
  const groups: NavGroup[] = TABS.map((t) => ({
    key: t.key,
    text: t.label,
    children: kids[t.key],
    slot: t.key === 'plans' || t.key === 'activity',
    aria: t.key === 'waiting' && waitingCount > 0 ? `Needs you, ${waitingCount} items` : undefined,
    label: <NavLabel view={t.key} text={t.label} count={t.key === 'waiting' ? waitingCount : 0} />,
  }))
  const child = tab === 'settings' ? settingsTab : tab === 'flow' ? flowTab : tab === 'waiting' ? waitingSection : dashboardPage(tab)
  // A header or sub-page pick: the page, and its sub-page when it has one.
  const pickNav = (key: string, sub?: string) => {
    if (sub === undefined) return chooseTab(key as Tab)
    if (key === 'dashboard') go({ tab: dashboardTab(sub), focus: null, drill: null })
    else if (key === 'settings') go({ tab: 'settings', settingsTab: sub as SettingsTab, focus: null, drill: null })
    else if (key === 'flow') go({ tab: 'flow', flowTab: sub as FlowTab, focus: null, drill: null })
    else go({ tab: 'waiting', waitingSection: sub as WaitingSection, focus: null, drill: null })
  }
  // The workspace pill, first in the nav and in the phone's menu. In the demo
  // it names the sample alone (the guard's catalog), and picking does nothing.
  const pill = demo.active ? (
    <WorkspacePill list={DEMO_CATALOG} value={DEMO_WORKSPACE_ID} onChange={() => undefined} onManage={openWorkspaces} />
  ) : (
    <WorkspacePill list={list} value={workspaceId} onChange={setWorkspaceId} onManage={openWorkspaces} />
  )
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ display: 'contents' }}>
    <ConfirmProvider>
    <TaskDrawerProvider workspaceId={active} onFocus={(id, title) => openDrill({ kind: 'focus', id, title })}>
    <div className="flex h-full min-h-0 flex-col">
      {phone && (
        // A phone keeps one thin row: the menu button. The brand card and the
        // line controls are at the bottom of the menu it opens.
        <header className="flex min-w-0 items-center gap-2 px-2 py-1" data-phone-header>
          <RailButton groups={groups} value={navTab(tab)} child={child} open={railOpen} onOpenChange={setRailOpen} />
        </header>
      )}
      {showRail && (
        <RailList
          groups={groups}
          value={navTab(tab)}
          child={child}
          onPick={pickNav}
          onOpenChange={setRailOpen}
          top={pill}
          footer={
            <>
              {lineControls}
              <BrandCard boxed workspaceId={active} />
            </>
          }
        />
      )}
      {/* Desktop: the left nav, then the page. A phone has the hamburger. */}
      <div className={`flex min-h-0 flex-1 ${phone ? 'flex-col' : 'px-6 pb-2'}`} style={showRail ? { display: 'none' } : undefined} data-shell>
      {!phone && (
        <LeftNav
          groups={groups}
          value={navTab(tab)}
          child={child}
          onPick={pickNav}
          top={pill}
          brand={<BrandCard workspaceId={active} />}
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-shell-main>
      <div className={`flex flex-wrap items-center gap-3 pb-2 ${phone ? 'px-4' : 'px-2'}`} data-main-top>
        {/* The workspace is the pill at the top of the nav (Radar's switcher). */}
        <span className="flex-1" />
        {/* Plan a goal, then on a desktop Stop the line and Refresh as small
            icons as tall as it. A phone keeps them in its menu. */}
        <span className="flex items-stretch gap-1.5" data-main-actions>
          <Btn type="button" primary onClick={planEpic}>
            Plan a goal
          </Btn>
          {!phone && active && <StopLineButton square workspaceId={active} />}
          {!phone && <PageRefreshIcon look="square" />}
        </span>
      </div>
      <DemoBar />
      {error && (
        <p role="alert" className={`pb-2 text-sm text-danger ${phone ? 'px-4' : 'px-2'}`}>
          {error}
        </p>
      )}
      <div
        ref={(element) => {
          nav.scroller.current = element
        }}
        data-avoozl-pane
        className={`flex-1 min-h-0 overflow-y-auto pb-8 ${phone ? 'px-4' : 'px-2'}`}
      >
        {needsWorkspace ? (
          <EmptyState
            icon={<Logo size={40} />}
            title={!list ? 'Loading workspaces…' : list.items.length === 0 ? 'No workspace yet' : 'Pick a workspace'}
            subtitle={
              list?.items.length === 0
                ? 'Add or initialize a workspace in Settings. Every tab reads from it.'
                : 'Choose one with the workspace button at the top of the nav. Every tab reads from it.'
            }
            action={
              list?.items.length === 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Btn type="button" onClick={openWorkspaces}>
                    Open Settings › Workspaces
                  </Btn>
                  <StartDemoButton />
                </div>
              ) : (
                <StartDemoButton />
              )
            }
          />
        ) : tab === 'dashboard' ? (
          <DashboardView workspaceId={active} onNavigate={navigate} onDrill={openDrill} onTrace={openTrace} onOpenSettings={openSettings} onPlanEpic={planEpic} />
        ) : tab === 'plans' ? (
          <PlansView
            workspaceId={active}
            onScope={scopeTo}
            onDrill={openDrill}
            newPlanRequest={planGoal}
            onOpenSettings={openSettings}
          />
        ) : tab === 'trace' ? (
          <TracePage workspaceId={active} target={(nav.memory.get(TRACE_TARGET) as TraceTarget | undefined) ?? null} onPick={pickTrace} onOpenEpics={() => chooseTab('plans')} />
        ) : tab === 'graph' ? (
          <GraphView workspaceId={active} focus={focus} drill={drill} onDrill={setDrill} />
        ) : tab === 'flow' ? (
          <FlowView workspaceId={active} tab={flowTab} />
        ) : tab === 'waiting' ? (
          <WaitingView
            workspaceId={active}
            section={waitingSection}
            onOpenSources={() => go({ settingsTab: 'plugins', tab: 'settings' })}
          />
        ) : tab === 'lanes' ? (
          <LanesView workspaceId={active} />
        ) : tab === 'ci' ? (
          <Placeholder view="ci" title="CI" line="Coming later: each open pull request's checks and CI wait. Avoozl caches its one batched pull-request read, but no page reads it yet." />
        ) : tab === 'activity' ? (
          <ActivityView workspaceId={active} />
        ) : (
          <SettingsView
            workspaceId={active}
            tab={settingsTab}
            onTab={(next) => go({ settingsTab: next })}
            // The demo's catalog is the sample alone; it never replaces the
            // person's own choice.
            onSelectWorkspace={(id) => !demo.active && id && setWorkspaceId(id)}
            onListChange={(next) => !demo.active && takeList(next)}
            onOpenPlans={() => chooseTab('plans')}
          />
        )}
      </div>
      </div>
      </div>
    </div>
    </TaskDrawerProvider>
    </ConfirmProvider>
    </div>
  )
}
