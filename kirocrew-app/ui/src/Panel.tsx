// The Avoozl side-panel tab (rc-8.3, design D10). One tab that changes with
// the open chat: Waiting on you, In flight, the release queue and recent
// merges in a normal chat; the spec check and Approve in a Spec Builder chat;
// the claim a crew is on in a crew chat; the driver view in an Avoozl chat.
// The host passes no props, so the chat comes from the page URL
// (panel-chat.ts). It reads again every PANEL_REFRESH_MS and when the window
// gains focus, and not while hidden (panel-api.ts). Local workers are
// retired: no worker rows here.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { ConfirmProvider } from './controls.tsx'
import { railFor } from './dashboard-api.ts'
import { flowClient, type FlowViewModel } from './flow-api.ts'
import { DRIVER_AGENT, DRIVER_START_MESSAGE, readDriverSession, recapSince, type Away, type DriverRead } from './driver-view-api.ts'
import { useAppApi, useChatLauncher, useNavigate } from './host.ts'
import { classifyChat, currentChat, opensItself, type PanelChat } from './panel-chat.ts'
import {
  PANEL_REFRESH_MS,
  driverView,
  panelModel,
  startRefresh,
  type FlightRow,
  type PanelAction,
  type PanelInput,
  type PanelModel,
  type PanelSection,
  type WaitingRow,
} from './panel-api.ts'
import { plansClient, type SpecSummary } from './plans-api.ts'
import { releaseClient, type ReleaseQueue } from './release-api.ts'
import { SPEC_BUILDER_SPECS } from './spec-builder-api.ts'
import { StopLineButton } from './StopLine.tsx'
import { relativeTime } from './task-api.ts'
import { Tooltip } from './Tooltip.tsx'
import { linkHref, viewsClient, type RadarCrews } from './views-api.ts'
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

const NOTE_UNREAD: Record<PanelSection, string> = {
  waiting: 'Avoozl could not read what is waiting on you. It tries again soon.',
  inFlight: 'Avoozl could not read the crews. It tries again soon.',
  queue: 'Avoozl could not read the release queue. It tries again soon.',
  recent: 'Avoozl could not read recent merges. It tries again soon.',
}

const link = (href: string, label: string, tip?: string) => {
  const anchor = (
    <a key={label + href} href={linkHref(href)} target="_blank" rel="noreferrer" className="text-sm underline">
      {label}
    </a>
  )
  return tip ? (
    <Tooltip key={label + href} text={tip}>
      {anchor}
    </Tooltip>
  ) : (
    anchor
  )
}

function Fold(props: { id: string; title: string; count?: number; warn?: boolean; open?: boolean; children: ReactNode }) {
  return (
    <details data-panel-fold={props.id} open={props.open} className="rounded-md border" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', padding: '8px 12px' }}>
        {props.count !== undefined && props.count > 0 && <Badge variant={props.warn ? 'warning' : 'info'}>{props.count}</Badge>}
        {props.title}
      </summary>
      <div className="px-3 pb-3" style={{ padding: '0 12px 12px' }}>
        {props.children}
      </div>
    </details>
  )
}

const Muted = (props: { children: ReactNode; role?: string }) => (
  <p className="m-0 text-muted" role={props.role} style={{ margin: 0 }}>
    {props.children}
  </p>
)

function WaitingList(props: { rows: WaitingRow[]; busy: string | null; onAct: (row: WaitingRow, action: PanelAction) => void; onOpenPage: () => void }) {
  return (
    <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {props.rows.map((row) => (
        <li key={row.key} data-waiting-row={row.kind}>
          <Badge variant="warning">{row.label}</Badge> <span className="font-medium">{row.title}</span>
          <span className="block text-xs text-muted" style={{ display: 'block' }}>
            {row.detail}
          </span>
          <span className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {row.actions.map((action) =>
              action.kind === 'link' && action.href.startsWith('/apps/') ? (
                <Btn key={action.label} type="button" onClick={props.onOpenPage}>
                  {action.label}
                </Btn>
              ) : action.kind === 'link' ? (
                link(action.href, action.label)
              ) : (
                <Btn key={action.label} type="button" disabled={props.busy === row.key} onClick={() => props.onAct(row, action)}>
                  {action.label}
                </Btn>
              ),
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function FlightList({ rows, now }: { rows: FlightRow[]; now: number }) {
  return (
    <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row) => (
        <li key={row.key} data-flight-row={row.source}>
          <Badge>{row.source === 'radar' ? 'Issue Radar' : 'Remote coder'}</Badge> <span className="font-medium">{row.title}</span> <span className="text-xs text-muted">{row.ref}</span>
          {row.stale && (
            <>
              {' '}
              <Badge variant="warning">Stale</Badge>
            </>
          )}
          <span className="block text-xs text-muted" style={{ display: 'block' }}>
            {row.who} · {row.phase ?? 'claim label, no claim comment'}
            {row.updated ? ` · updated ${relativeTime(row.updated, now)}` : ''}
          </span>
          <span className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {row.attach && link(row.attach, 'Attach / steer', row.source === 'radar' ? 'Opens the crew chat, if this crew runs on this machine. Type there to steer it.' : 'Opens the worker chat on its crew. Type there to steer it.')}
            {row.issueUrl && link(row.issueUrl, 'Issue')}
            {row.prUrl && link(row.prUrl, `PR #${row.prNumber}`)}
            {!row.attach && row.noAttach && <span className="text-xs text-muted">{row.noAttach}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function AvoozlPanel() {
  const api = useAppApi()
  const navigate = useNavigate()
  const { openChat } = useChatLauncher()
  const [workspaceId, setWorkspaceId] = useState<string | null>(readPageState(storage()).workspaceId)
  const [specNames, setSpecNames] = useState<string[]>([])
  const [specs, setSpecs] = useState<SpecSummary[]>([])
  const [reads, setReads] = useState<PanelInput>({})
  const [crews, setCrews] = useState<RadarCrews | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [driver, setDriver] = useState<DriverRead | null>(null)
  const [away, setAway] = useState<Away | null>(() => takeAway(storage()))
  const chat = useMemo(() => currentChat(window.location), [])
  const plans = useMemo(() => plansClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])
  const releases = useMemo(() => releaseClient(api), [api])
  const flows = useMemo(() => flowClient(api), [api])
  const idRef = useRef(workspaceId)
  const readsRef = useRef(reads)
  readsRef.current = reads

  // One read of everything. A read that fails leaves only its own section
  // unread; the others still show.
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
    const ok = <T,>(read: Promise<T>) => read.then((value) => value, () => null)
    const [conflicts, crewRead, remote, queue, flow, listed, stored, driverRead] = await Promise.all([
      ok(views.conflicts(id)),
      ok(views.radarCrews(id)),
      ok(views.remote(id).then((r) => r.workers)),
      ok<ReleaseQueue>(releases.queue(id)),
      ok<FlowViewModel>(flows.view(id, { window: '10' })),
      api.get<{ specs?: { name: string }[] }>(SPEC_BUILDER_SPECS).catch(() => ({ specs: [] })),
      ok(plans.specs(id)),
      readDriverSession(api, id),
    ])
    setError(null)
    setReads({ conflicts, crews: crewRead, remote, queue, flow })
    setCrews(crewRead)
    setSpecNames((listed.specs ?? []).map((spec) => spec.name))
    if (stored) setSpecs(stored.items)
    setDriver(driverRead)
    setNow(Date.now())
  }, [api, flows, plans, releases, views])

  useEffect(
    () =>
      startRefresh(load, {
        intervalMs: PANEL_REFRESH_MS,
        doc: document,
        win: window,
        setTimer: (fn, ms) => setInterval(fn, ms),
        clearTimer: (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
      }),
    [load],
  )

  const model: PanelModel = useMemo(() => panelModel(reads), [reads])
  const kind: PanelChat = classifyChat(chat, { specs: specNames, driver: driver?.slot ?? null })
  const spec = kind.kind === 'spec-builder' ? specs.find((item) => item.name === kind.spec) : undefined

  // "Since you left": remember what was waiting when the window lost focus
  // or went hidden, and take it back when the person returns.
  const modelRef = useRef(model)
  modelRef.current = model
  useEffect(() => {
    const leave = () => {
      if (Object.keys(readsRef.current).length === 0) return
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

  const unread = (section: PanelSection) => model.unread.includes(section)
  const loading = Object.keys(reads).length === 0
  const stopped = model.stops.length > 0

  const waiting = (
    <Fold id="waiting" title="Waiting on you" count={model.waiting.length} warn open>
      {unread('waiting') ? (
        <Muted>{loading ? 'Loading…' : NOTE_UNREAD.waiting}</Muted>
      ) : model.waiting.length === 0 ? (
        <Muted>Nothing is waiting on you.</Muted>
      ) : (
        <WaitingList rows={model.waiting.slice(0, 5)} busy={busy} onAct={(row, action) => void act(row, action)} onOpenPage={() => navigate(AVOOZL_PAGE)} />
      )}
      {model.waiting.length > 5 && (
        <Btn type="button" onClick={() => navigate(AVOOZL_PAGE)}>
          Show all {model.waiting.length}
        </Btn>
      )}
    </Fold>
  )
  const inFlight = (
    <Fold id="in-flight" title="In flight" count={model.inFlight.length} open>
      {unread('inFlight') ? (
        <Muted>{loading ? 'Loading…' : NOTE_UNREAD.inFlight}</Muted>
      ) : model.inFlight.length === 0 ? (
        <Muted>No crew has a claim right now.</Muted>
      ) : (
        <FlightList rows={model.inFlight} now={now} />
      )}
      {crews && crews.stale > 0 && <Muted>{crews.stale} stale claim{crews.stale === 1 ? '' : 's'}.</Muted>}
    </Fold>
  )
  const queue = (
    <Fold id="queue" title="Release queue" count={model.queue?.head.length}>
      {unread('queue') || !model.queue ? (
        <Muted>{loading ? 'Loading…' : NOTE_UNREAD.queue}</Muted>
      ) : model.queue.head.length === 0 ? (
        <Muted>{model.queue.held ? `Nothing is next. ${model.queue.held} held.` : 'Nothing is next in the queue.'}</Muted>
      ) : (
        <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {model.queue.head.map((entry) => (
            <li key={entry.taskId} data-queue-head>
              <span className="font-medium">{entry.title}</span> <span className="text-xs text-muted">{entry.taskId}</span>
              <span className="block text-xs text-muted" style={{ display: 'block' }}>
                {entry.repository} · {entry.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  )
  const recent = (
    <Fold id="recent" title="Recent merges" count={model.recent.length}>
      {unread('recent') ? (
        <Muted>{loading ? 'Loading…' : NOTE_UNREAD.recent}</Muted>
      ) : model.recent.length === 0 ? (
        <Muted>Nothing finished lately.</Muted>
      ) : (
        <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {model.recent.map((entry) => (
            <li key={entry.taskId} data-recent-row>
              <span className="font-medium">{entry.title}</span> <span className="text-xs text-muted">{relativeTime(entry.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  )
  const line = (
    <div data-panel-line data-stopped={stopped ? '' : undefined} className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stopped ? <Badge variant="danger">Line stopped</Badge> : <Badge variant="success">Line running</Badge>}
      {model.stops.map((text) => (
        <Muted key={text}>{text}</Muted>
      ))}
      <ConfirmProvider>
        <StopLineButton workspaceId={workspaceId} />
      </ConfirmProvider>
    </div>
  )
  const view = driverView(driver)
  const driverBox = (
    <section data-panel-driver={view.state} className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 className="m-0 font-semibold" style={{ margin: 0 }}>
        Driver session <Badge variant={view.state === 'running' ? 'success' : undefined}>{{ running: 'Running', idle: 'Quiet', none: 'Not started', unknown: 'Unknown' }[view.state]}</Badge>
      </h3>
      <Muted>
        {view.note}
        {driver?.lastSeenAt && view.state !== 'none' ? ` Last seen ${relativeTime(driver.lastSeenAt, now)}.` : ''}
      </Muted>
      <span className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {view.link && link(view.link, 'Open driver session')}
        {view.start && (
          <Tooltip text="Opens a new chat on the avoozl-driver agent and sends its first message. It releases work only while the chat is open.">
            <Btn type="button" primary={!view.link} onClick={() => openChat({ agent: DRIVER_AGENT, message: DRIVER_START_MESSAGE, autoSend: true })} data-driver-start>
              {view.link ? 'Start a new driver session' : 'Start a driver session'}
            </Btn>
          </Tooltip>
        )}
      </span>
    </section>
  )
  const sinceBox = recap && (
    <section data-since-recap className="flex flex-col gap-2 rounded-md border p-3" style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <h3 className="m-0 font-semibold" style={{ margin: 0 }}>
        Since you left <span className="text-xs font-normal text-muted">{recap.since}</span>
      </h3>
      {recap.finished.length > 0 && (
        <div data-since-finished>
          <span className="text-xs text-muted">Finished</span>
          <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {recap.finished.slice(0, 5).map((row) => (
              <li key={row.taskId}>{row.title}</li>
            ))}
          </ul>
        </div>
      )}
      {recap.needsYou.length > 0 && (
        <div data-since-needs-you>
          <span className="text-xs text-muted">New for you</span>
          <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {recap.needsYou.slice(0, 5).map((row) => (
              <li key={row.key}>
                <Badge variant="warning">{row.label}</Badge> {row.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Btn type="button" onClick={() => setAway(null)}>
        Got it
      </Btn>
    </section>
  )
  const toPage = (
    <Btn type="button" onClick={() => navigate(AVOOZL_PAGE)}>
      Open the Avoozl page
    </Btn>
  )

  const crewRow = kind.kind === 'crew' ? crews?.rows.find((item) => item.crewId === kind.crew) : undefined
  const specQueue = spec ? (reads.queue?.repositories ?? []).flatMap((repo) => repo.rows.filter((row) => row.spec === spec.name || row.planId === spec.plan?.id)) : []

  return (
    <div className="flex flex-col gap-3 p-3 text-sm" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }} data-panel-kind={kind.kind}>
      {error && <p role="alert">Avoozl can't read this workspace: {error}</p>}
      {note && <p role="status">{note}</p>}
      {kind.kind === 'spec-builder' && (
        <>
          <section data-panel-spec>
            <h3 className="font-semibold">Spec check: {kind.spec}</h3>
            {!spec && <p className="text-muted">Avoozl has not read this spec folder yet.</p>}
            {spec && (
              <>
                <ul>
                  <li>Files: {spec.files.join(', ') || 'none'}</li>
                  <li>Tasks: {spec.taskCount}</li>
                  <li>
                    Problems: {spec.counts.error} errors, {spec.counts.warning} warnings
                  </li>
                  <li>{spec.plan?.approved ? 'Approved for Avoozl.' : 'Not approved for Avoozl.'}</li>
                </ul>
                {opensItself(kind, { files: spec.files, approved: Boolean(spec.plan?.approved) }) && <p className="text-muted">tasks.md is written and not approved yet.</p>}
                {spec.plan?.approved && <p className="text-muted">Do not press Execute in Spec Builder. Avoozl's gate replaces it.</p>}
                {!spec.plan && <Btn onClick={() => void store()}>Store this spec</Btn>}
                {spec.plan && !spec.plan.approved && (
                  <Btn primary disabled={spec.counts.error > 0 || !spec.hash} onClick={() => void approve()}>
                    Approve for Avoozl
                  </Btn>
                )}
              </>
            )}
          </section>
          {spec?.plan?.approved && (
            <Fold id="spec-queue" title="This spec in the queue" count={specQueue.length} open>
              {specQueue.length === 0 ? (
                <Muted>Nothing from this spec is in the queue yet.</Muted>
              ) : (
                <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {specQueue.slice(0, 6).map((row) => (
                    <li key={row.taskId} data-spec-queue-row={row.state}>
                      <Badge>{row.state}</Badge> {row.title} <span className="text-xs text-muted">{row.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Fold>
          )}
          {line}
          {toPage}
        </>
      )}
      {kind.kind === 'crew' && (
        <>
          <section data-panel-crew className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 className="font-semibold">Crew {kind.crew}</h3>
            {!crewRow ? (
              <Muted>{loading ? 'Loading…' : unread('inFlight') ? NOTE_UNREAD.inFlight : "No live claim from this crew in Avoozl's repositories."}</Muted>
            ) : (
              <>
                <p>
                  {crewRow.repository}#{crewRow.number} {crewRow.title}: {crewRow.phase ?? 'no phase'}
                  {crewRow.pr ? `, PR #${crewRow.pr}` : ''}
                  {crewRow.stale ? ' (stale)' : ''}
                </p>
                <span data-rail className="inline-flex items-center gap-0.5" role="img" aria-label={railFor(crewRow).map((step) => `${step.label} ${step.state}`).join(', ')} style={{ display: 'inline-flex', gap: 3 }}>
                  {railFor(crewRow).map((step) => (
                    <i key={step.label} data-rail-step={step.state} title={step.label} style={{ display: 'block', width: 16, height: 8, borderRadius: 3, background: step.state === 'done' ? 'var(--ok)' : step.state === 'now' ? 'var(--accent)' : 'var(--border)' }} />
                  ))}
                </span>
                {crewRow.updated && <Muted>Updated {relativeTime(crewRow.updated, now)}</Muted>}
                <span className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {crewRow.url && link(crewRow.url, 'Issue')}
                  {crewRow.prUrl && link(crewRow.prUrl, `PR #${crewRow.pr}`)}
                  {crewRow.commentUrl && link(crewRow.commentUrl, 'Crew comment')}
                </span>
              </>
            )}
            <Muted>Avoozl cannot message this chat. It shows what the claim on GitHub says.</Muted>
          </section>
          {line}
          {toPage}
        </>
      )}
      {kind.kind === 'avoozl' && (
        <>
          {sinceBox}
          {driverBox}
          {waiting}
          {inFlight}
          {queue}
          {line}
          {toPage}
        </>
      )}
      {kind.kind === 'other' && (
        <section data-panel-recap className="flex flex-col gap-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="m-0 font-semibold" style={{ margin: 0 }}>
            Recap
          </h3>
          <p className="m-0" data-recap-line style={{ margin: 0 }}>
            {loading
              ? 'Loading…'
              : `${model.waiting.length} waiting on you · ${model.inFlight.length} in flight · ${stopped ? 'line stopped' : 'line running'}`}
          </p>
          {sinceBox}
          {waiting}
          {inFlight}
          {queue}
          {recent}
          {line}
          {driverBox}
          {toPage}
        </section>
      )}
    </div>
  )
}
