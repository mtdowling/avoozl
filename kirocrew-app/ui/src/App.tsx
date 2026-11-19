import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi, useNavigate } from './host.ts'
import { SpecLinkContext } from './spec-link.ts'
import { specTabLink } from './review-view.ts'
import { urlBase } from './focus-tree.ts'
import { Btn } from './ui/Btn'
import { EmptyState } from './ui/EmptyState'
import { SegmentedControl } from './ui/SegmentedControl'
import Logo from './Logo'
import { BrandCard } from './BrandCard.tsx'
import { RailButton, RailList } from './TopRail.tsx'
import type { NavGroup } from './NavAccordion.tsx'
import { LeftNav, NavLine } from './LeftNav.tsx'
import { PageRefreshIcon, useHasPageRefresh } from './page-refresh.tsx'
import { usePhone } from './list-detail.ts'
import DashboardView, { type DashboardTarget } from './DashboardView'
import PlansView, { type PlanTarget } from './PlansView'
import GraphPage from './FocusTree.tsx'
import { parseGraphLink } from './focus-tree.ts'
import { parseReviewLink, parseSpecTab } from './review-view.ts'
import WaitingView from './WaitingView.tsx'
import FlowView, { LineBanner } from './FlowView.tsx'
import { RetrosView, type RetroTarget } from './RetrosView.tsx'
import {
  DASHBOARD_PAGES,
  GITHUB_PAGES,
  RETROS_PAGES,
  TABS,
  WAITING_SECTIONS,
  dashboardPage,
  dashboardTab,
  navTab,
  tabLabel,
  type GitHubPage,
  type RetrosPage,
  type Tab,
  type WaitingSection,
} from './nav-api.ts'
import GitHubItemsView from './GitHubItemsView.tsx'
import TriageAgentView from './TriageAgentView.tsx'
import { itemsClient } from './github-items-api.ts'
import { WorkspacePill } from './WorkspacePill.tsx'
import { NavSlotProvider } from './nav-slot.tsx'
import LandingQueueView from './LandingQueueView.tsx'
import DeliveryView from './DeliveryView.tsx'
import { VIEW_ICONS } from './icons.ts'
import ActivityView from './ActivityView.tsx'
import { useOpenStops } from './StopLine.tsx'
import { untriagedClient } from './untriaged-api.ts'
import type { NewPlanForm } from './new-plan-api.ts'
import SettingsView, { GITHUB_TABS, SETTINGS_TABS, type SettingsTab } from './SettingsView'
import { readTab } from './tabs.ts'
import { SETTINGS_HOME, settingsTabOnEnter } from './settings-api.ts'
import { TaskDrawerProvider } from './TaskDrawer'
import Badge from './ui/Badge.tsx'
import { ConfirmProvider, ICON } from './ui/controls.tsx'
import { setSharedFilter } from './FilterBar.tsx'
import type { TaskFilter } from './filters.ts'
import type { Drill } from './graph-layout.ts'
import { viewsClient } from './views-api.ts'
import { APP_ATTR, NavHistoryProvider, useNav } from './NavHistory.tsx'
import { changePage } from './nav-history.ts'
import { DemoBar, DemoProvider, StartDemoButton, useDemo } from './Demo.tsx'
import { DEMO_CATALOG, DEMO_WORKSPACE_ID } from './demo-api.ts'
import { errorMessage, pickDefault, readPageState, workspaceClient, writePageState, type WorkspaceList } from './workspace-api'
import { Box } from './ui/Box'
import { Glyph } from './ui/Glyph'

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
    <Box data-nav-label-row as="span" css-display="flex" css-align-items="center" css-gap="6" css-min-width="0" css-max-width="100%">
      <Glyph icon={Icon} size={ICON} aria-hidden="true" css-flex-shrink="0" />
      <Box data-nav-text as="span" css-min-width="0" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">
        {props.text}
      </Box>
      {props.count ? (
        <Box data-nav-count as="span" css-flex-shrink="0" css-display="inline-flex">
          <Badge variant="warning">{props.count}</Badge>
        </Box>
      ) : null}
    </Box>
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
  const [retrosPage, setRetrosPage] = useState<RetrosPage>('retros')
  // A retro or proposal another page linked to: scrolled to and marked.
  const [retroTarget, setRetroTarget] = useState<RetroTarget | null>(null)
  const [waitingSection, setWaitingSection] = useState<WaitingSection>('decisions')
  const [githubPage, setGithubPage] = useState<GitHubPage>('issues')
  // The triage agent's owner queue, one count on Needs you (TA5.2).
  const [agentCount, setAgentCount] = useState(0)
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
  const [radarCount, setRadarCount] = useState(0)
  const views = useMemo(() => viewsClient(api), [api])

  const untriagedReads = useMemo(() => untriagedClient(api), [api])
  const waitingCount = conflicts + (untriaged ?? 0) + agentCount
  const items = useMemo(() => itemsClient(api), [api])
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
  const here = { tab, settingsTab, retrosPage, waitingSection, githubPage, focus, drill }
  const apply = (place: Partial<typeof here>) => {
    if (place.focus !== undefined) setFocus(place.focus)
    if (place.drill !== undefined) setDrill(place.drill)
    if (place.settingsTab !== undefined) setSettingsTab(place.settingsTab)
    if (place.retrosPage !== undefined) setRetrosPage(place.retrosPage)
    if (place.waitingSection !== undefined) setWaitingSection(place.waitingSection)
    if (place.githubPage !== undefined) setGithubPage(place.githubPage)
    if (place.tab !== undefined) setTab(place.tab)
  }
  // `open` deep-links into the new place's inner views (changePage).
  const go = (next: Partial<typeof here>, open?: Record<string, unknown>) =>
    changePage(nav, here, next, apply, (before, newTab) => (newTab ? `Back to ${tabLabel(before.tab)}` : 'Back to the previous section'), open)
  const openWorkspaces = () => go({ settingsTab: 'workspaces', tab: 'settings' })
  // A saved workspace counts only once the catalog confirms it still exists.
  // The demo reads its own sample; the saved choice waits for Exit demo.
  const active = demo.active ? DEMO_WORKSPACE_ID : list ? workspaceId : null
  const needsWorkspace = tab !== 'settings' && !active

  // A Needs you item's spec link: put the spec in the address, then open Specs,
  // which reads it as it opens (PlansView readAddress).
  const hostNavigate = useNavigate()
  const openSpec = (planId: string) => {
    const base = urlBase(window.location.pathname)
    if (base) {
      try {
        hostNavigate(base + specTabLink(planId, 'overview'))
      } catch {
        // The address is a convenience; Specs still opens.
      }
    }
    go({ focus: null, drill: null, tab: 'plans' })
  }
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
      settingsTab: settingsTabOnEnter(
        tab,
        key,
        settingsTab,
        SETTINGS_TABS.map((t) => t.key),
      ),
      tab: key,
    })

  // Read once, when the page opens.
  useEffect(() => {
    // ?tree=task:<id> or ?graph=frontier opens the Graph there (FocusTree.tsx).
    if (parseGraphLink(window.location.search)) go({ tab: 'graph', focus: null, drill: null })
    // ?view=review&plan=P and ?plan=P&tab=T open the Specs page on that spec's tab.
    else if (parseReviewLink(window.location.search) || parseSpecTab(window.location.search)) go({ tab: 'plans', focus: null, drill: null })
    // ?github=<tab> opens Settings › GitHub, which opens that tab.
    else if (
      readTab(
        window.location.search,
        'github',
        GITHUB_TABS.map((t) => t.key),
      )
    )
      go({ tab: 'settings', settingsTab: 'github', focus: null, drill: null })
    // ?settings=<tab> opens Settings on that tab, so a message can link to it.
    else if (
      readTab(
        window.location.search,
        'settings',
        SETTINGS_TABS.map((t) => t.key),
      )
    )
      go({
        tab: 'settings',
        settingsTab: readTab(
          window.location.search,
          'settings',
          SETTINGS_TABS.map((t) => t.key),
        ) as SettingsTab,
        focus: null,
        drill: null,
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (!active) {
      setRadarCount(0)
      return setUntriaged(null)
    }
    let live = true
    const read = () =>
      untriagedReads.view(active).then(
        (list) => {
          if (!live) return
          setUntriaged(list.enabled ? list.total : null)
          setRadarCount(list.enabled ? (list.withRadar?.length ?? 0) : 0)
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

  useEffect(() => {
    if (!active) return setAgentCount(0)
    let live = true
    const read = () =>
      items.view(active).then(
        (view) => live && setAgentCount(view.ownerQueue),
        () => undefined,
      )
    void read()
    const timer = setInterval(read, 60000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, items, tab])

  const phone = usePhone()
  const hasRefresh = useHasPageRefresh()
  // The phone's top rail takes the whole page while it is open.
  const [railOpen, setRailOpen] = useState(false)
  const showRail = phone && railOpen
  // Refresh on a phone: an icon in its own small section at the bottom of
  // the menu. A desktop has it on the top line. Stop the line is on
  // Dashboards › Delivery.
  const lineControls = hasRefresh && (
    <NavLine>
      <PageRefreshIcon />
    </NavLine>
  )
  // A stopped line shows its banner on every page: Home and Flow draw their
  // own, the shell draws it everywhere else.
  const stops = useOpenStops(active)
  const ownBanner = tab === 'dashboard' || tab === 'flow'
  // Radar's nav model: Dashboards, Needs you, Flow and Settings open in the
  // nav to their sub-pages; Specs, Activity and Dashboards › Delivery open
  // to their filters (a slot the page fills); the other pages are plain entries.
  const kids: Partial<Record<Tab, { key: string; label: string }[]>> = {
    dashboard: DASHBOARD_PAGES,
    waiting: WAITING_SECTIONS.map((x) => ({
      key: x.key,
      label: x.title,
      count: x.key === 'decisions' ? conflicts : x.key === 'agent' ? agentCount : x.key === 'triage' ? (untriaged ?? 0) : radarCount,
    })),
    github: GITHUB_PAGES,
    retros: RETROS_PAGES,
    settings: SETTINGS_TABS.map((x) => ({ key: x.key, label: x.label })),
  }
  const groups: NavGroup[] = TABS.map((t) => ({
    key: t.key,
    text: t.label,
    children: kids[t.key],
    slot: t.key === 'plans' || t.key === 'activity' || t.key === 'dashboard' || t.key === 'flow',
    aria: t.key === 'waiting' && waitingCount > 0 ? `Needs you, ${waitingCount} items` : undefined,
    label: <NavLabel view={t.key} text={t.label} count={t.key === 'waiting' ? waitingCount : 0} />,
  }))
  const child = tab === 'settings' ? settingsTab : tab === 'retros' ? retrosPage : tab === 'waiting' ? waitingSection : tab === 'github' ? githubPage : dashboardPage(tab)
  // A header or sub-page pick: the page, and its sub-page when it has one.
  const pickNav = (key: string, sub?: string) => {
    if (sub === undefined) return chooseTab(key as Tab)
    if (key === 'dashboard') go({ tab: dashboardTab(sub), focus: null, drill: null })
    else if (key === 'settings') go({ tab: 'settings', settingsTab: sub as SettingsTab, focus: null, drill: null })
    else if (key === 'retros') go({ tab: 'retros', retrosPage: sub as RetrosPage, focus: null, drill: null })
    else if (key === 'github') go({ tab: 'github', githubPage: sub as GitHubPage, focus: null, drill: null })
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
    <Box {...{ [APP_ATTR]: '' }} css-display="contents">
      <ConfirmProvider>
        <SpecLinkContext.Provider value={openSpec}>
          <TaskDrawerProvider workspaceId={active} onFocus={(id, title) => openDrill({ kind: 'focus', id, title })}>
            <Box flex hFull minH0 flexCol>
              {phone && (
                // A phone keeps one thin row: the menu button. The brand card and the
                // line controls are at the bottom of the menu it opens.
                <Box as="header" flex minW0 items="center" gap="2" px="2" py="1" data-phone-header>
                  <RailButton groups={groups} value={navTab(tab)} child={child} open={railOpen} onOpenChange={setRailOpen} />
                </Box>
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
              <Box css-display={showRail ? 'none' : undefined} flex minH0 flex1 flexCol={phone} px={phone ? undefined : '6'} data-shell>
                {!phone && <LeftNav groups={groups} value={navTab(tab)} child={child} onPick={pickNav} top={pill} brand={<BrandCard workspaceId={active} />} />}
                <Box flex minH0 minW0 flex1 flexCol pb={phone ? undefined : '2'} data-shell-main>
                  <Box flex flexWrap items="center" gap="3" pb="2" px={phone ? '4' : '2'} data-main-top>
                    {/* The workspace is the pill at the top of the nav (Radar's switcher). */}
                    <Box as="span" flex1 />
                    {/* On a desktop, Refresh as a small icon. A phone keeps it in its menu. */}
                    <Box as="span" flex items="stretch" gap="1.5" data-main-actions>
                      {!phone && <PageRefreshIcon />}
                    </Box>
                  </Box>
                  <DemoBar />
                  {!ownBanner && !needsWorkspace && stops.length > 0 && (
                    <Box pb="2" px={phone ? '4' : '2'} data-shell-line-banner>
                      <LineBanner stops={stops} workspaceId={active} />
                    </Box>
                  )}
                  {error && (
                    <Box role="alert" as="p" pb="2" size="sm" tone="danger" px={phone ? '4' : '2'}>
                      {error}
                    </Box>
                  )}
                  <Box
                    ref={(element) => {
                      nav.scroller.current = element
                    }}
                    data-avoozl-pane
                    flex1
                    minH0
                    overflow="y-auto"
                    pb="8"
                    px={phone ? '4' : '2'}
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
                            <Box flex flexWrap items="center" justify="center" gap="2">
                              <Btn type="button" onClick={openWorkspaces}>
                                Open Settings › Workspaces
                              </Btn>
                              <StartDemoButton />
                            </Box>
                          ) : (
                            <StartDemoButton />
                          )
                        }
                      />
                    ) : tab === 'dashboard' ? (
                      <DashboardView workspaceId={active} onNavigate={navigate} onDrill={openDrill} onOpenSettings={openSettings} onPlanEpic={planEpic} />
                    ) : tab === 'plans' ? (
                      <PlansView workspaceId={active} onScope={scopeTo} onDrill={openDrill} newPlanRequest={planGoal} onOpenSettings={openSettings} />
                    ) : tab === 'graph' ? (
                      <GraphPage
                        workspaceId={active}
                        workspaceName={(demo.active ? DEMO_CATALOG : list)?.items.find((w) => w.id === active)?.name ?? null}
                        focus={focus}
                        drill={drill}
                        onDrill={setDrill}
                        onOpenSpecs={() => chooseTab('plans')}
                      />
                    ) : tab === 'flow' ? (
                      <FlowView workspaceId={active} />
                    ) : tab === 'retros' ? (
                      <RetrosView
                        workspaceId={active}
                        page={retrosPage}
                        target={retroTarget}
                        onOpen={(target) => {
                          setRetroTarget(target)
                          if (target) go({ tab: 'retros', retrosPage: target.page, focus: null, drill: null })
                        }}
                      />
                    ) : tab === 'waiting' ? (
                      <WaitingView workspaceId={active} section={waitingSection} onOpenSources={() => go({ settingsTab: 'plugins', tab: 'settings' })} />
                    ) : tab === 'github' ? (
                      githubPage === 'agent' ? (
                        <TriageAgentView workspaceId={active} />
                      ) : (
                        <GitHubItemsView key={githubPage} workspaceId={active} kind={githubPage === 'pulls' ? 'pr' : 'issue'} />
                      )
                    ) : tab === 'delivery' ? (
                      <DeliveryView workspaceId={active} />
                    ) : tab === 'landing' ? (
                      <LandingQueueView workspaceId={active} />
                    ) : tab === 'activity' ? (
                      <ActivityView workspaceId={active} />
                    ) : (
                      <SettingsView
                        workspaceId={active}
                        workspaceName={list?.items.find((w) => w.id === active)?.name}
                        tab={settingsTab}
                        onTab={(next) => go({ settingsTab: next })}
                        // The demo's catalog is the sample alone; it never replaces the
                        // person's own choice.
                        onSelectWorkspace={(id) => !demo.active && id && setWorkspaceId(id)}
                        onListChange={(next) => !demo.active && takeList(next)}
                        onOpenPlans={() => chooseTab('plans')}
                      />
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          </TaskDrawerProvider>
        </SpecLinkContext.Provider>
      </ConfirmProvider>
    </Box>
  )
}
