// The Avoozl side-panel tab (rc-8.3, design D10). One tab that changes with
// the open chat: Needs you, In flight, the release queue and recent
// merges in a normal chat; the spec check and Approve in a Spec Builder chat;
// the claim a crew is on in a crew chat; the driver view in an Avoozl chat.
// The host passes no props, so the chat comes from the page URL
// (panel-chat.ts). All data comes from one operation, `panel.view`, read when
// the Refresh countdown ends, when the window gains focus, and not while hidden
// (panel-api.ts). Every view is built from the shared parts in PanelParts.tsx.
// Local workers are retired: no worker rows here.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ConfirmProvider } from './controls.tsx'
import { railFor } from './dashboard-api.ts'
import { DRIVER_AGENT, DRIVER_START_MESSAGE, recapSince, type Away, type DriverRead } from './driver-view-api.ts'
import { useAppApi, useChatLauncher, useNavigate } from './host.ts'
import { classifyChat, currentChat, opensItself, type PanelChat } from './panel-chat.ts'
import {
  checkLabel,
  driverView,
  drivenRoot,
  panelModel,
  readPanel,
  sameRoot,
  shortAgo,
  startRefresh,
  type FlightRow,
  type PanelAction,
  type PanelRead,
  type PanelModel,
  type PanelSection as SectionName,
  type WaitingRow,
} from './panel-api.ts'
import { PanelAct, PanelChip, PanelEmpty, PanelHeader, PanelList, PanelRoot, PanelRow, PanelSection } from './PanelParts.tsx'
import { Check, CircleAlert, CircleDot, CirclePlus, ExternalLink, GitBranch, GitPullRequest, Inbox, MessageSquare, Play, Radar, RefreshCw } from './icons.ts'
import { RefreshButton } from './RefreshButton.tsx'
import { CellAct, StatusCell, StatusRow } from './StatusCells.tsx'
import { plansClient } from './plans-api.ts'
import { releaseClient } from './release-api.ts'
import { SPEC_BUILDER_SPECS } from './spec-builder-api.ts'
import { StopLineButton } from './StopLine.tsx'
import { nameFor } from './instance-api.ts'
import { useInstance } from './InstanceName.tsx'
import { relativeTime } from './task-api.ts'
import { Tooltip } from './Tooltip.tsx'
import { linkHref, viewsClient } from './views-api.ts'
import { errorMessage, readPageState, workspaceClient } from './workspace-api.ts'

const AVOOZL_PAGE = '/apps/avoozl'

// What the panel kept when the window last lost focus (driver-view-api.ts
// Away), read once on return and then removed.
const AWAY_KEY = 'avoozl.panel.away'

function takeAway(store: Storage | null): Away | null {
  try {
    const raw = store?.getItem(AWAY_KEY)
    store?.removeItem(AWAY_KEY)
    const parsed = raw ? (JSON.parse(raw) as Away) : null
    return parsed && Number.isFinite(parsed.at) && Array.isArray(parsed.waitingKeys) ? parsed : null
  } catch {
    return null
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const NOTE_UNREAD: Record<SectionName, string> = {
  waiting: 'Avoozl could not read what is waiting on you. It tries again soon.',
  inFlight: 'Avoozl could not read the crews. It tries again soon.',
  queue: 'Avoozl could not read the release queue. It tries again soon.',
  recent: 'Avoozl could not read recent merges. It tries again soon.',
}

const WAITING_ICON: Record<string, typeof CircleAlert> = { review: GitPullRequest, 'ready-to-merge': GitPullRequest, 'branch-landing': GitBranch }

const DRIVER_STATE = { running: 'Running', idle: 'Quiet', none: 'Not started', unknown: 'Unknown' } as const

// What no read has returned yet: every part null, so each section says unread.
const UNREAD: PanelRead = { conflicts: null, crews: null, remote: null, queue: null, flow: null, driver: null, specs: null, instance: null, checks: null }

function WaitingRows(props: { rows: WaitingRow[]; busy: string | null; now: number; onAct: (row: WaitingRow, action: PanelAction) => void; onOpenPage: () => void }) {
  return (
    <PanelList>
      {props.rows.map((row) => (
        <PanelRow
          key={row.key}
          data-waiting-row={row.kind}
          icon={WAITING_ICON[row.kind] ?? CircleAlert}
          title={row.title}
          chips={<PanelChip tone="warn">{row.label}</PanelChip>}
          age={row.at ? shortAgo(row.at, props.now) : null}
          ageTip={row.at ? `Changed ${relativeTime(row.at, props.now)}` : undefined}
          meta={row.detail}
          multi={row.actions.length > 1}
          actions={row.actions.map((action) =>
            action.kind === 'link' && action.href.startsWith('/apps/') ? (
              <PanelAct key={action.label} label={action.label} onClick={props.onOpenPage} />
            ) : action.kind === 'link' ? (
              <PanelAct key={action.label} label={action.label} href={linkHref(action.href)} />
            ) : (
              <PanelAct key={action.label} label={action.label} disabled={props.busy === row.key} onClick={() => props.onAct(row, action)} />
            ),
          )}
        />
      ))}
    </PanelList>
  )
}

function FlightRows({ rows, now }: { rows: FlightRow[]; now: number }) {
  return (
    <PanelList>
      {rows.map((row) => {
        const check = row.pr ? checkLabel(row.check) : null
        const meta = [row.instance ?? (row.source === 'radar' ? 'No Avoozl' : null), row.crew ?? row.who, row.source === 'radar' ? row.ref : row.who, !row.phase ? 'claim label, no claim comment' : null].filter(Boolean)
        return (
          <PanelRow
            key={row.key}
            data-flight-row={row.source}
            icon={row.pr ? GitPullRequest : row.source === 'radar' ? Radar : CircleDot}
            title={row.title}
            href={linkHref(row.issueUrl)}
            chips={
              <>
                <PanelChip tone={row.stale ? 'warn' : 'info'} tip={row.updated ? `Updated ${relativeTime(row.updated, now)}` : undefined}>
                  {row.phase ?? 'claimed'}
                </PanelChip>
                {row.stale && <PanelChip tone="warn">Stale</PanelChip>}
                {check && (
                  <PanelChip tone={check.tone} tip={check.tip} href={linkHref(row.prUrl)} data-flight-pr>
                    PR #{row.prNumber} {check.text}
                  </PanelChip>
                )}
              </>
            }
            age={shortAgo(row.claimedAt ?? row.updated, now)}
            ageTip={[row.claimedAt && `Claimed ${relativeTime(row.claimedAt, now)}`, row.updated && `updated ${relativeTime(row.updated, now)}`].filter(Boolean).join(', ') || undefined}
            meta={[...new Set(meta)].join(' · ')}
            actions={
              row.attach ? (
                <PanelAct label="Session" name="Session" narrowIcon icon={CirclePlus} href={linkHref(row.attach)} tip={row.source === 'radar' ? 'Session. Opens the crew chat, if this crew runs on this machine. Type there to steer it.' : 'Session. Opens the worker chat on its crew. Type there to steer it.'} data-flight-session />
              ) : row.noAttach ? (
                <Tooltip text={row.noAttach}>
                  <span data-pp-chip data-tone="muted">
                    No chat
                  </span>
                </Tooltip>
              ) : null
            }
          />
        )
      })}
    </PanelList>
  )
}

export default function AvoozlPanel() {
  const api = useAppApi()
  const navigate = useNavigate()
  const { openChat } = useChatLauncher()
  const [workspaceId, setWorkspaceId] = useState<string | null>(readPageState(storage()).workspaceId)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [specNames, setSpecNames] = useState<string[]>([])
  const [reads, setReads] = useState<PanelRead | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [away, setAway] = useState<Away | null>(() => takeAway(storage()))
  const instance = useInstance(workspaceId)
  const chat = useMemo(() => currentChat(window.location), [])
  const plans = useMemo(() => plansClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])
  const releases = useMemo(() => releaseClient(api), [api])
  useEffect(() => {
    if (workspaceId) workspaceClient(api).list().then((list) => setWorkspaceName(list.items.find((item) => item.id === workspaceId)?.name ?? null), () => undefined)
  }, [api, workspaceId])
  const idRef = useRef(workspaceId)
  const readsRef = useRef(reads)
  readsRef.current = reads

  // One read of everything: `panel.view`. A part that fails is null in the
  // reply, so only its own section shows unread.
  const load = useCallback(async () => {
    let id = idRef.current
    try {
      if (!id) {
        id = (await workspaceClient(api).list()).defaultWorkspace
        idRef.current = id
        setWorkspaceId(id)
      }
    } catch (caught) {
      setError(errorMessage(caught))
      return
    }
    if (!id) return
    let read: PanelRead = UNREAD
    try {
      read = await readPanel(api, id)
      // In a driver chat, read the workspace this chat drives, not the one the
      // app page last showed: a Nupp driver's panel shows Nupp.
      const root = drivenRoot(read.driver, chat)
      if (root) {
        const drives = (await workspaceClient(api).list()).items.find((item) => sameRoot(item.root, root))
        if (drives && drives.id !== id) {
          id = drives.id
          idRef.current = id
          setWorkspaceId(id)
          read = await readPanel(api, id)
        }
      }
    } catch {
      // A failed read leaves every section unread; the next one tries again.
    }
    try {
      const listed = await api.get<{ specs?: { name: string }[] }>(SPEC_BUILDER_SPECS)
      setSpecNames((listed.specs ?? []).map((spec) => spec.name))
    } catch {
      // Without the list no chat is a Spec Builder chat.
    }
    setError(null)
    setReads(read)
    setNow(Date.now())
  }, [api, chat])

  useEffect(
    () =>
      // The Refresh button counts down and reads; this adds the focus and
      // visibility reads.
      startRefresh(load, {
        intervalMs: 0,
        doc: document,
        win: window,
        setTimer: (fn, ms) => setInterval(fn, ms),
        clearTimer: (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
      }),
    [load],
  )

  const model: PanelModel = useMemo(() => panelModel(reads ?? {}), [reads])
  const driver: DriverRead | null = reads?.driver ?? null
  const specs = reads?.specs ?? []
  const kind: PanelChat = classifyChat(chat, { specs: specNames, driver: driver?.slot ?? null })
  const spec = kind.kind === 'spec-builder' ? specs.find((item) => item.name === kind.spec) : undefined

  // "Since you left": remember what was waiting when the window lost focus
  // or went hidden, and take it back when the person returns.
  const modelRef = useRef(model)
  modelRef.current = model
  useEffect(() => {
    const leave = () => {
      if (!readsRef.current) return
      try {
        const left: Away = { at: Date.now(), waitingKeys: modelRef.current.waiting.map((row) => row.key) }
        storage()?.setItem(AWAY_KEY, JSON.stringify(left))
      } catch {
        // No storage: no recap.
      }
    }
    const back = () => {
      if (document.visibilityState === 'hidden') return leave()
      const taken = takeAway(storage())
      if (taken) setAway(taken)
    }
    window.addEventListener('blur', leave)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [])
  const recap = useMemo(() => recapSince(model, away, now), [model, away, now])

  const act = async (row: WaitingRow, action: PanelAction) => {
    if (!workspaceId || action.kind === 'link') return
    setBusy(row.key)
    try {
      if (action.kind === 'resolve') await views.resolveConflict(workspaceId, action.taskId, action.field, action.choice)
      else await releases.land(workspaceId, action.repository, action.branch, action.head)
      setNote(null)
      await load()
    } catch (caught) {
      setNote(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }
  const approve = async () => {
    if (!workspaceId || !spec?.plan || !spec.hash) return
    try {
      await plans.approve(workspaceId, spec.plan.id, spec.hash)
      setNote('Approved this revision for Avoozl.')
      await load()
    } catch (caught) {
      setNote(errorMessage(caught))
    }
  }
  const store = async () => {
    if (!workspaceId || !spec) return
    try {
      await plans.store(workspaceId, spec.name)
      setNote('Stored as a draft. Review it in Specs, then approve.')
      await load()
    } catch (caught) {
      setNote(errorMessage(caught))
    }
  }

  const unread = (section: SectionName) => model.unread.includes(section)
  const loading = reads === null
  const stopped = model.stops.length > 0
  const headerName = nameFor(instance, 'header') ?? reads?.instance?.name ?? null

  // One section: its rows, or why it has none.
  const unreadOr = (section: SectionName, empty: string, rows: number, render: () => ReactNode) =>
    unread(section) ? <PanelEmpty>{loading ? 'Loading…' : NOTE_UNREAD[section]}</PanelEmpty> : rows === 0 ? <PanelEmpty>{empty}</PanelEmpty> : render()

  const waiting = (
    <PanelSection id="waiting" title="Needs you" count={model.waiting.length} tone="warn" open>
      {unreadOr('waiting', 'Nothing is waiting on you.', model.waiting.length, () => (
        <WaitingRows rows={model.waiting.slice(0, 5)} busy={busy} now={now} onAct={(row, action) => void act(row, action)} onOpenPage={() => navigate(AVOOZL_PAGE)} />
      ))}
      {model.waiting.length > 5 && (
        <PanelEmpty>
          <PanelAct label={`Show all ${model.waiting.length}`} onClick={() => navigate(AVOOZL_PAGE)} />
        </PanelEmpty>
      )}
    </PanelSection>
  )
  const inFlight = (
    <PanelSection id="in-flight" title="In flight" count={model.inFlight.length} summary={reads?.crews && reads.crews.stale > 0 ? `${reads.crews.stale} stale` : undefined} open>
      {unreadOr('inFlight', 'No crew has a claim right now.', model.inFlight.length, () => (
        <FlightRows rows={model.inFlight} now={now} />
      ))}
    </PanelSection>
  )
  const queue = (
    <PanelSection id="queue" title="Release queue" count={model.queue?.head.length} summary={model.queue ? queueSummary(model.queue) : undefined}>
      {unreadOr('queue', model.queue?.held ? `Nothing is next. ${model.queue.held} held.` : 'Nothing is next in the queue.', model.queue?.head.length ?? 0, () => (
        <PanelList>
          {model.queue!.head.map((entry) => (
            <PanelRow key={entry.taskId} data-queue-head icon={Inbox} title={entry.title} chips={<PanelChip tone="info">Next</PanelChip>} age={entry.taskId} meta={`${entry.repository} · ${entry.reason}`} />
          ))}
        </PanelList>
      ))}
    </PanelSection>
  )
  const recent = (
    <PanelSection id="recent" title="Recent merges" count={model.recent.length} summary={model.recent[0] ? `last ${shortAgo(model.recent[0].at, now)}` : undefined}>
      {unreadOr('recent', 'Nothing finished lately.', model.recent.length, () => (
        <PanelList>
          {model.recent.map((entry) => (
            <PanelRow key={entry.taskId} data-recent-row icon={Check} title={entry.title} age={shortAgo(entry.at, now)} ageTip={relativeTime(entry.at, now)} meta={[entry.repository, entry.taskId].filter(Boolean).join(' · ')} />
          ))}
        </PanelList>
      ))}
    </PanelSection>
  )

  // The top: one thin line. "Avoozl · <instance>" (Avoozl opens the app page),
  // Refresh, fold all, and the line's pause button at the end.
  const header = (
    <PanelHeader
      name="Avoozl"
      onName={() => navigate(AVOOZL_PAGE)}
      nameTip="Open Avoozl"
      instance={headerName}
      tip={[headerName ? `Avoozl · ${headerName}` : 'Avoozl', workspaceName ? `Workspace: ${workspaceName}` : ''].filter(Boolean).join('. ')}
      tools={<RefreshButton bare workspaceId={workspaceId} onRefresh={() => void load()} />}
      end={
        <span data-panel-line data-stopped={stopped ? '' : undefined} style={{ display: 'inline-flex' }}>
          <ConfirmProvider>
            <StopLineButton bare workspaceId={workspaceId} />
          </ConfirmProvider>
        </span>
      }
    />
  )

  // A driver read that failed is unknown, never none: it may be running.
  const view = driverView(reads && !reads.driver ? { state: 'unknown', slot: null, href: null, openedAt: null, lastSeenAt: null } : reads?.driver)
  const crewCount = reads?.crews ? (reads.crews.groups?.length ?? 0) : null
  const driverCells = loading ? null : (
    <div data-pp-cells>
      <StatusRow>
        <StatusCell
          data-panel-driver={view.state}
          tone={view.state === 'running' ? 'ok' : view.state === 'unknown' ? 'warn' : 'muted'}
          title={`Driver: ${DRIVER_STATE[view.state].toLowerCase()}`}
          tip={[
            'One long-running chat that releases ready work in graph order and hands you the decisions. It releases work only while the chat is open.',
            view.note,
            driver?.lastSeenAt && view.state !== 'none' ? `Last seen ${relativeTime(driver.lastSeenAt, now)}.` : '',
            view.workspace ? `Workspace: ${view.workspace}.` : '',
            view.elsewhere ? view.elsewhere.text : '',
          ]
            .filter(Boolean)
            .join(' ')}
          actions={
            <>
              {view.link && <CellAct label="Open driver session" icon={<MessageSquare size={13} aria-hidden="true" />} primary={!view.start} href={linkHref(view.link)} data-driver-open />}
              {view.start && (
                <CellAct
                  label={view.link ? 'Start a new driver session' : 'Start a driver session'}
                  icon={<Play size={13} aria-hidden="true" />}
                  primary={!view.link}
                  tip={view.link ? 'Start a new driver session.' : 'Start a driver session. Opens a new chat on the avoozl-driver agent.'}
                  onClick={() => openChat({ agent: DRIVER_AGENT, message: DRIVER_START_MESSAGE, autoSend: true })}
                  data-driver-start
                />
              )}
              {view.elsewhere && <CellAct label={`Open ${view.elsewhere.workspace}'s driver`} icon={<ExternalLink size={13} aria-hidden="true" />} href={linkHref(view.elsewhere.href)} tip={view.elsewhere.text} data-driver-elsewhere />}
              <CellAct label="Recheck" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={() => void load()} data-driver-recheck />
            </>
          }
        />
        <StatusCell
          data-panel-crew
          tone={crewCount ? 'ok' : 'warn'}
          title={crewCount === null ? 'Radar crew: unknown' : crewCount ? `Radar crews: ${crewCount}` : 'Radar crew: none'}
          tip="Issue Radar crews code the issues Avoozl releases. Create a crew in Radar, Crews."
          actions={<CellAct label="Open Radar" icon={<ExternalLink size={13} aria-hidden="true" />} href="/issue-radar" tip="Open Radar, Crews." />}
        />
      </StatusRow>
    </div>
  )
  const lineSection = (
    <PanelSection id="line" title="Line and driver" summary={stopped ? 'stopped' : undefined} open>
      <PanelList>
        {model.stops.map((text) => (
          <PanelRow key={text} icon={CircleAlert} title={text} />
        ))}
      </PanelList>
      {driverCells}
    </PanelSection>
  )

  const sinceBox = recap && (
    <div data-since-recap>
      <PanelSection id="since" title="Since you left" summary={recap.since} open>
        {recap.finished.length > 0 && (
          <div data-since-finished>
            <PanelList>
              {recap.finished.slice(0, 5).map((row) => (
                <PanelRow key={row.taskId} icon={Check} title={row.title} chips={<PanelChip tone="ok">Finished</PanelChip>} />
              ))}
            </PanelList>
          </div>
        )}
        {recap.needsYou.length > 0 && (
          <div data-since-needs-you>
            <PanelList>
              {recap.needsYou.slice(0, 5).map((row) => (
                <PanelRow key={row.key} icon={CircleAlert} title={row.title} chips={<PanelChip tone="warn">{row.label}</PanelChip>} />
              ))}
            </PanelList>
          </div>
        )}
        <PanelEmpty>
          <PanelAct label="Got it" onClick={() => setAway(null)} />
        </PanelEmpty>
      </PanelSection>
    </div>
  )

  const crewRow = kind.kind === 'crew' ? reads?.crews?.rows.find((item) => item.crewId === kind.crew) : undefined
  const specQueue = spec ? (reads?.queue?.repositories ?? []).flatMap((repo) => repo.rows.filter((row) => row.spec === spec.name || row.planId === spec.plan?.id)) : []

  return (
    <PanelRoot kind={kind.kind}>
      {header}
      {error && <PanelEmpty role="alert">Avoozl can't read this workspace: {error}</PanelEmpty>}
      {note && <PanelEmpty role="status">{note}</PanelEmpty>}
      {kind.kind === 'spec-builder' && (
        <>
          <div data-panel-spec>
            <PanelSection id="spec" title={`Spec check: ${kind.spec}`} open>
              {!spec ? (
                <PanelEmpty>{loading ? 'Loading…' : 'Avoozl has not read this spec folder yet.'}</PanelEmpty>
              ) : (
                <>
                  <PanelList>
                    <PanelRow icon={Inbox} title={`Files: ${spec.files.join(', ') || 'none'}`} />
                    <PanelRow icon={Inbox} title={`Tasks: ${spec.taskCount}`} />
                    <PanelRow
                      icon={spec.counts.error > 0 ? CircleAlert : Check}
                      title={`Problems: ${spec.counts.error} errors, ${spec.counts.warning} warnings`}
                      chips={<PanelChip tone={spec.counts.error > 0 ? 'danger' : spec.counts.warning > 0 ? 'warn' : 'ok'}>{spec.counts.error > 0 ? 'Fix first' : spec.counts.warning > 0 ? 'Warnings' : 'Clean'}</PanelChip>}
                    />
                    <PanelRow
                      icon={spec.plan?.approved ? Check : CircleDot}
                      title={spec.plan?.approved ? 'Approved for Avoozl.' : 'Not approved for Avoozl.'}
                      meta={
                        opensItself(kind, { files: spec.files, approved: Boolean(spec.plan?.approved) })
                          ? 'tasks.md is written and not approved yet.'
                          : spec.plan?.approved
                            ? "Do not press Execute in Spec Builder. Avoozl's gate replaces it."
                            : null
                      }
                      actions={
                        !spec.plan ? (
                          <PanelAct label="Store this spec" onClick={() => void store()} />
                        ) : !spec.plan.approved ? (
                          <PanelAct label="Approve for Avoozl" primary disabled={spec.counts.error > 0 || !spec.hash} onClick={() => void approve()} />
                        ) : null
                      }
                    />
                  </PanelList>
                </>
              )}
            </PanelSection>
          </div>
          {spec?.plan?.approved && (
            <PanelSection id="spec-queue" title="This spec in the queue" count={specQueue.length} open>
              {specQueue.length === 0 ? (
                <PanelEmpty>Nothing from this spec is in the queue yet.</PanelEmpty>
              ) : (
                <PanelList>
                  {specQueue.slice(0, 6).map((row) => (
                    <PanelRow key={row.taskId} data-spec-queue-row={row.state} icon={Inbox} title={row.title} chips={<PanelChip tone="info">{row.state}</PanelChip>} meta={row.reason} />
                  ))}
                </PanelList>
              )}
            </PanelSection>
          )}
          {lineSection}
        </>
      )}
      {kind.kind === 'crew' && (
        <>
          <div data-panel-crew>
            <PanelSection id="crew" title={`Crew ${kind.crew}`} open>
              {!crewRow ? (
                <PanelEmpty>{loading ? 'Loading…' : unread('inFlight') ? NOTE_UNREAD.inFlight : "No live claim from this crew in Avoozl's repositories."}</PanelEmpty>
              ) : (
                <PanelList>
                  <PanelRow
                    icon={crewRow.pr ? GitPullRequest : Radar}
                    title={`${crewRow.repository}#${crewRow.number} ${crewRow.title}: ${crewRow.phase ?? 'no phase'}${crewRow.pr ? `, PR #${crewRow.pr}` : ''}${crewRow.stale ? ' (stale)' : ''}`}
                    href={linkHref(crewRow.url)}
                    age={crewRow.updated ? shortAgo(crewRow.updated, now) : null}
                    ageTip={crewRow.updated ? `Updated ${relativeTime(crewRow.updated, now)}` : undefined}
                    meta={crewRow.updated ? `Updated ${relativeTime(crewRow.updated, now)}` : null}
                    actions={
                      <>
                        {crewRow.prUrl && <PanelAct label={`PR #${crewRow.pr}`} href={linkHref(crewRow.prUrl)} />}
                        {crewRow.commentUrl && <PanelAct label="Crew comment" href={linkHref(crewRow.commentUrl)} />}
                      </>
                    }
                    multi
                  />
                  <li data-pp-row style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                    <Tooltip text={railFor(crewRow).map((step) => `${step.label}: ${step.state}`).join(', ')}>
                      <span data-rail role="img" aria-label={railFor(crewRow).map((step) => `${step.label} ${step.state}`).join(', ')} style={{ display: 'inline-flex', gap: 3 }}>
                        {railFor(crewRow).map((step) => (
                          <i key={step.label} data-rail-step={step.state} style={{ display: 'block', width: 16, height: 8, borderRadius: 3, background: step.state === 'done' ? 'var(--ok)' : step.state === 'now' ? 'var(--accent)' : 'var(--border)' }} />
                        ))}
                      </span>
                    </Tooltip>
                  </li>
                </PanelList>
              )}
              <PanelEmpty>Avoozl cannot message this chat. It shows what the claim on GitHub says.</PanelEmpty>
            </PanelSection>
          </div>
          {lineSection}
        </>
      )}
      {kind.kind === 'avoozl' && (
        <>
          {sinceBox}
          {waiting}
          {inFlight}
          {queue}
          {recent}
          {lineSection}
        </>
      )}
      {kind.kind === 'other' && (
        <div data-panel-recap>
          {sinceBox}
          {waiting}
          {inFlight}
          {queue}
          {recent}
          {lineSection}
        </div>
      )}
    </PanelRoot>
  )
}

// "2 next · 1 held", what the queue chip and its section header say.
function queueSummary(queue: NonNullable<PanelModel['queue']>): string {
  const parts = [queue.claimed ? `${queue.claimed} claimed` : '', `${queue.next} next`, queue.held ? `${queue.held} held` : ''].filter(Boolean)
  return parts.join(' · ')
}
