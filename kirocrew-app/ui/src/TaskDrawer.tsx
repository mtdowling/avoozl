import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { TaskDrawerContext, type TaskDrawerApi } from './drawer-context.ts'
import { modelLabel, safeHref, viewsClient, canSupersede, type ConflictItem, type Graph } from './views-api.ts'
import { duration, lineText, linkParts, relativeTime, sessionHref, sourceLine, taskClient, type OriginSource, type TaskDetail, type TaskLink, type TaskOrigin } from './task-api.ts'
import { DEFER_TIP, RESUME_TIP, RETRY_TIP, resumeStatus } from './delivery-api.ts'
import { ItemDetails, RetryForm, SupersedeForm } from './DeliveryDetails.tsx'
import { ConflictActions, ReviewButton } from './ConflictsView.tsx'
import { DocumentReader } from './DocumentReader.tsx'
import { CitedFile } from './CitedFile.tsx'
import { DRAWER_DEFAULT, DRAWER_MIN, clampDrawer, readDrawerWidth, stepDrawer, writeDrawerWidth } from './drawer-width.ts'
import { HandSetReview, ReviewRuns } from './ReviewState.tsx'
import { reviewRuns } from './views-api.ts'
import { Markdown } from './Markdown.tsx'
import TaskForm from './TaskForm.tsx'
import { Authority } from './Authority.tsx'
import { errorMessage } from './workspace-api.ts'
import { Fold, IconLabel, SectionHeading, ShowMore, TipBtn, useAskChat, usePages } from './controls.tsx'
import { resultMessage, settleTargets, whyLine } from './conflicts-api.ts'
import { documentEpic } from './graph-layout.ts'
import { itemRef } from './chat-api.ts'
import { TimingFold } from './FlowView.tsx'
import { Crosshair, Eye, FileText, MessageSquare, Pause, Pencil, Play, Plus, RotateCcw, X } from './icons.ts'
import { useBackStep } from './NavHistory.tsx'
import { LAYER } from './layers.ts'
import { linkHref } from './views-api.ts'

// The drawer's sections, as collapsible <details> (the host has no
// accordion). Summary starts open; the rest open on a click.
const SECTIONS = [
  { key: 'summary', label: 'Summary' },
  { key: 'description', label: 'Description' },
  { key: 'links', label: 'Links' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'timing', label: 'Timing' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'timeline', label: 'Timeline' },
] as const

type Mode =
  | { kind: 'task'; id: string }
  | { kind: 'add'; prerequisite?: string }
  | { kind: 'review'; group: ConflictItem; onReviewed?: () => void }
  | null

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia(query)
    const change = () => setMatch(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [query])
  return match
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function Links({ title, links, open }: { title: string; links: TaskLink[]; open: (id: string) => void }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {links.length === 0 ? (
        <p className="text-sm text-muted">Nothing.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {links.map((link) => (
            <li key={`${link.id}:${link.kind}`} className="flex flex-wrap items-baseline gap-1.5">
              <button type="button" className="underline" onClick={() => open(link.id)}>
                {link.title}
              </button>
              <span className="text-xs text-muted">
                {link.id} · {link.kind === 'sequence' ? 'runs after' : 'needs done'}
                {link.condition ? ` (${link.condition})` : ''} · {link.satisfied ? 'met' : 'waiting'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The drawer's body for one task: sections and the actions the other views
// offer, all on one read (task.detail).

// Where a task came from, and the file lines it was made from, read on
// demand with document.get. The file's path in the sentence and Open full
// file show the whole file in DocumentReader; Read shows the lines here. A
// file the workspace no longer has says so.
function Origin(props: { origin: TaskOrigin; issue: string | null; workspaceId: string; onOpenSpec?: (spec: string) => void }) {
  const { origin } = props
  const api = useAppApi()
  const tasks = useMemo(() => taskClient(api), [api])
  const [reading, setReading] = useState<{ source: OriginSource; text: string | null; error: string | null } | null>(null)
  const [full, setFull] = useState<OriginSource | null>(null)
  const closeFull = useCallback(() => setFull(null), [])
  const read = async (source: OriginSource) => {
    if (reading?.source === source) return setReading(null)
    setReading({ source, text: null, error: null })
    try {
      const doc = await tasks.document(props.workspaceId, source.document)
      setReading({ source, text: doc.text, error: null })
    } catch (caught) {
      setReading({ source, text: null, error: errorMessage(caught) })
    }
  }
  const first = origin.sources[0]
  // The first readable source shows here at once: the whole file, with
  // the task's lines marked and in view.
  const firstReadable = origin.sources.find((s) => s.readable) ?? null
  useEffect(() => {
    if (firstReadable) void read(firstReadable)
    // Only when the task changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstReadable?.document, firstReadable?.lineStart])
  return (
    <div className="flex flex-col gap-1.5" data-origin={origin.kind}>
      <span className="font-medium">{origin.label}</span>
      <span className="text-xs text-muted">
        {first?.readable
          ? linkParts(origin.text, first.document).map((part, i) =>
              part.link ? (
                <button key={i} type="button" className="underline" style={{ color: 'var(--accent)', overflowWrap: 'anywhere' }} onClick={() => setFull(first)} data-origin-path>
                  {part.text}
                </button>
              ) : (
                part.text
              ),
            )
          : origin.text}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {origin.kind === 'github-issue' && props.issue && (
          <a href={linkHref(props.issue)} target="_blank" rel="noopener noreferrer" className="text-xs underline">
            Open the issue on GitHub
          </a>
        )}
        {origin.spec && props.onOpenSpec && (
          <button type="button" className="text-xs underline" onClick={() => props.onOpenSpec!(origin.spec!)}>
            Open spec {origin.spec} in Plans
          </button>
        )}
        {origin.sources.map((source) =>
          source.readable ? (
            <span key={source.document + source.lineStart} className="inline-flex flex-wrap gap-2">
              <IconLabel
                icon={FileText}
                tooltip={`Open all of ${source.document} in a reader, at the cited line`}
                onClick={() => setFull(source)}
                aria-label={`Open full file ${source.document}`}
              >
                Open full file
              </IconLabel>
              <IconLabel
                icon={Eye}
                tooltip="Show the lines this task was made from here, read from the file now"
                onClick={() => void read(source)}
                aria-label={`${reading?.source === source ? 'Hide' : 'Read'} ${sourceLine(source)}`}
              >
                {reading?.source === source ? 'Hide' : 'Read'} {sourceLine(source)}
              </IconLabel>
            </span>
          ) : (
            <span key={source.document} className="text-xs text-muted">
              {sourceLine(source)} (no longer in this workspace)
            </span>
          ),
        )}
      </div>
      {origin.prompt && <blockquote className="border-l-2 pl-2 text-xs text-muted" style={{ borderColor: 'var(--border)' }}>{origin.prompt}</blockquote>}
      {reading && (
        <div className="rounded border text-xs" style={{ borderColor: 'var(--border)' }} data-origin-reader>
          {reading.error ? (
            <p role="alert" className="p-2 text-danger">{reading.error}</p>
          ) : reading.text === null ? (
            <p className="p-2 text-muted">Reading…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                <span className="text-muted" data-excerpt-range>
                  {reading.source.document}
                  {lineText(reading.source) ? ` · ${lineText(reading.source)} marked` : ''}
                </span>
                <button type="button" className="ml-auto underline" onClick={() => setFull(reading.source)}>
                  Open full file
                </button>
              </div>
              <CitedFile
                text={reading.text}
                lineStart={reading.source.lineStart}
                lineEnd={reading.source.lineEnd}
                maxHeight={360}
                idPrefix="avoozl-origin"
                label={`Contents of ${reading.source.document}`}
              />
            </>
          )}
        </div>
      )}
      {full && <DocumentReader workspaceId={props.workspaceId} target={full} onClose={closeFull} />}
    </div>
  )
}

function TaskPanel(props: {
  workspaceId: string
  id: string
  graph: Graph | null
  open: (id: string) => void
  onClose: () => void
  onFocus?: (id: string, title: string) => void
}) {
  const { workspaceId, id } = props
  const api = useAppApi()
  const tasks = useMemo(() => taskClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const pages = usePages(props.id)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const chat = useAskChat(workspaceId)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      setDetail(await tasks.detail(workspaceId, id))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [tasks, workspaceId, id])
  useEffect(() => {
    setDetail(null)
    setEditing(false)
    setMessage(null)
    void load()
  }, [load])

  const run = (call: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(true)
    setMessage(null)
    void (async () => {
      try {
        setMessage(await call())
        await load()
      } catch (caught) {
        setMessage({ ok: false, text: errorMessage(caught) })
      } finally {
        setBusy(false)
      }
    })()
  }

  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!detail) return <p className="text-sm text-muted">Loading…</p>
  const { task, delivery } = detail
  const local = task.authority === 'local'
  const deliveryState = (delivery?.deliveries ?? []).map((d) => d.state).filter((s): s is string => typeof s === 'string').at(-1)
  const deferred = task.status === 'deferred'
  const resume = resumeStatus(props.graph)
  const done = delivery?.complete ?? task.state === 'done'
  const issue = safeHref(task.issue?.url ?? null)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <SectionHeading level={2} id="avoozl-drawer-title" title={task.title} />
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>{task.id}</span>
          <Authority owner={task} />
          {task.state && <Badge variant={task.state === 'needs-you' ? 'warning' : undefined}>{task.state}</Badge>}
          {detail.locked && <Badge>locked</Badge>}
          {task.planArchived && <Badge>Archived</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.onFocus && (
          <IconLabel
            icon={Crosshair}
            tooltip="Show only this task and the tasks it waits on and that wait on it"
            onClick={() => {
              props.onFocus!(task.id, task.title)
              props.onClose()
            }}
          >
            Focus
          </IconLabel>
        )}
        <IconLabel icon={MessageSquare} tooltip="Start a Kiro Crew chat seeded with this task's full context" onClick={() => void chat.ask({ tasks: [task.id] })}>
          Ask in a chat
        </IconLabel>
        {deliveryState === 'decision' && (
          <IconLabel
            icon={RotateCcw}
            disabled={busy}
            tooltip={RETRY_TIP}
            onClick={() =>
              run(async () => {
                await views.retry(workspaceId, task.id)
                return { ok: true, text: 'Retrying.' }
              })
            }
          >
            Retry
          </IconLabel>
        )}
        {!done && local && !deferred && (
          <IconLabel
            icon={Pause}
            disabled={busy}
            tooltip={DEFER_TIP}
            onClick={() =>
              run(async () => {
                await views.updateTask(workspaceId, task.id, { status: 'deferred' }, detail.revision)
                return { ok: true, text: 'Deferred. No new attempt starts; a running session is left alone.' }
              })
            }
          >
            Defer
          </IconLabel>
        )}
        {!done && local && deferred && resume && (
          <IconLabel
            icon={Play}
            disabled={busy}
            tooltip={RESUME_TIP}
            onClick={() =>
              run(async () => {
                await views.updateTask(workspaceId, task.id, { status: resume }, detail.revision)
                return { ok: true, text: 'Resumed.' }
              })
            }
          >
            Resume
          </IconLabel>
        )}
        <IconLabel icon={Pencil} tooltip="Edit this task. It needs your review again before it starts." onClick={() => setEditing(!editing)}>
          Edit
        </IconLabel>
        {!done && !local && issue && (
          <a href={linkHref(issue)} target="_blank" rel="noreferrer" className="self-center text-xs underline">
            Defer on the board
          </a>
        )}
      </div>
      {chat.error && (
        <p role="alert" className="text-sm text-danger">
          {chat.error}
        </p>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-muted' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
      {task.handSetReview && (
        <HandSetReview
          workspaceId={workspaceId}
          task={task}
          graph={props.graph}
          revision={detail.revision}
          onChanged={(text) => {
            setMessage({ ok: true, text })
            void load()
          }}
        />
      )}
      {reviewRuns(delivery).length > 0 && (
        <section aria-label="Review" className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold">Review</h4>
          <ReviewRuns item={delivery} />
        </section>
      )}
      {editing && (
        <div className="rounded border p-3" style={{ borderColor: 'var(--border)' }}>
          <TaskForm
            workspaceId={workspaceId}
            graph={props.graph}
            detail={detail}
            onSaved={() => {
              setMessage({ ok: true, text: 'Saved. This task needs your review again before it starts.' })
              setEditing(false)
              void load()
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
      <div className="flex flex-col" role="region" aria-label="Task sections">

        <Fold id="summary" group="task-drawer" title="Summary" open={detail.conflicts.length === 0}>
          <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }}>
            <Row label="Epic">{task.epicTitle ? documentEpic(task.epicTitle) : 'none'}</Row>
            {detail.origin && (
              <Row label="Came from">
                <Origin origin={detail.origin} issue={issue} workspaceId={workspaceId} />
              </Row>
            )}
            <Row label="Plan">
              {detail.plan ? `${detail.plan.title}${detail.plan.approved ? ' (approved)' : ` (${detail.plan.state ?? 'draft'})`}` : 'none'}
              {task.planArchived ? ' · archived: its tasks do not start until you unarchive it' : ''}
            </Row>
            <Row label="Authority">
              <Authority owner={task} /> {task.authority}
            </Row>
            <Row label="Route">{task.route}</Row>
            <Row label="Status">{task.status ?? 'none'}</Row>
            <Row label="State">{task.state ?? 'unknown'}</Row>
            <Row label="Wave">{task.wave}</Row>
            <Row label="Done when">{task.completion}</Row>
            {task.repository && <Row label="Repository">{task.repository}</Row>}
            {task.owner && <Row label="Assignee">{task.owner}</Row>}
            {task.decision && <Row label="Decision">{task.decision}</Row>}
            {task.needsReview && <Row label="Review">Needs your review</Row>}
            {(delivery?.pullRequests ?? []).map((pull, i) => (
              <Row key={i} label="Pull request">
                {safeHref(pull.url) ? (
                  <a href={safeHref(pull.url)!} target="_blank" rel="noreferrer" className="underline">
                    #{pull.number}
                    {pull.merged ? ' (merged)' : ''}
                  </a>
                ) : (
                  `#${pull.number}`
                )}
              </Row>
            ))}
          </dl>
        </Fold>
        <Fold id="description" group="task-drawer" title="Description">
          <div className="flex flex-col gap-3">
            {task.summary ? <Markdown text={task.summary} /> : <p className="text-sm text-muted">No description.</p>}
            <div>
              <h4 className="text-sm font-semibold">Acceptance</h4>
              {task.acceptance.length ? (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {task.acceptance.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None.</p>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold">Checks</h4>
              {task.checks.length ? (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {task.checks.map((line, i) => (
                    <li key={i}>
                      <code>{line}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None.</p>
              )}
            </div>
            {task.context && (
              <div>
                <h4 className="text-sm font-semibold">From its plan</h4>
                <Markdown text={task.context} />
              </div>
            )}
          </div>
        </Fold>
        <Fold id="links" group="task-drawer" title="Links">
          <div className="flex flex-col gap-3">
            <Links title="Waits on" links={detail.waitsOn} open={props.open} />
            <Links title="Blocks" links={detail.blocks} open={props.open} />
          </div>
        </Fold>
        <Fold id="delivery" group="task-drawer" title="Delivery">
          {delivery ? (
            <div className="flex flex-col gap-2">
              {delivery.sessions.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {delivery.sessions.map((session) => (
                    <li key={session.slot}>
                      <a href={linkHref(sessionHref(session))} className="underline">
                        {session.role} attempt {session.attempt}
                      </a>{' '}
                      <span className="text-xs text-muted">
                        {session.status ?? 'not observed'} · {modelLabel(session) ?? 'model not named'} · started{' '}
                        {relativeTime(session.boundAt)}
                        {session.statusAt ? ` · last activity ${relativeTime(session.statusAt)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {deliveryState === 'decision' && (
                <RetryForm
                  item={delivery}
                  busy={busy}
                  onRetry={(dismiss) =>
                    run(async () => {
                      await views.retry(workspaceId, task.id, dismiss)
                      return { ok: true, text: 'Dismissed and retrying.' }
                    })
                  }
                />
              )}
              <ItemDetails
                item={delivery}
                onSupersede={async (from, create) => {
                  await views.supersede(workspaceId, from, create)
                  await load()
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">No delivery yet.</p>
          )}
        </Fold>
        <Fold id="timing" group="task-drawer" title="Timing">
          <TimingFold timing={detail.timing ?? null} />
        </Fold>
        <Fold id="conflicts" group="task-drawer" title={detail.conflicts.length ? `Conflicts (${detail.conflicts.length})` : 'Conflicts'} open={detail.conflicts.length > 0}>
          {detail.conflicts.length ? (
            <ul className="flex flex-col gap-3">
              {detail.conflicts.map((item, i) => (
                <li key={i} className="flex flex-col gap-2 rounded border p-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-sm font-medium">{whyLine(item)}</div>
                  {item.changedAt && (
                    <div className="text-xs text-muted">
                      Changed {relativeTime(item.changedAt)}
                      {item.changedBy ? ` by ${item.changedBy}` : ''}. See Timeline for this task&apos;s history.
                    </div>
                  )}
                  <span>
                    <IconLabel icon={MessageSquare} tooltip="Start a Kiro Crew chat seeded with this item" onClick={() => void chat.ask({ items: [itemRef(item)] })}>
                      Ask in a chat
                    </IconLabel>
                  </span>
                  <ConflictActions
                    item={item}
                    workspaceId={workspaceId}
                    revision={detail.revision}
                    busy={busy}
                    run={run}
                    onSettled={() => undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No conflicts or decisions on this task.</p>
          )}
        </Fold>
        <Fold id="timeline" group="task-drawer" title="Timeline">
          {detail.timeline.length ? (
            <>
            <ol className="flex flex-col gap-1 text-sm">
              {pages.take('timeline', detail.timeline).map((entry, i) => (
                <li key={i} className="flex gap-2">
                  <Tooltip text={entry.at}>
                    <span className="w-28 shrink-0 text-xs text-muted">{relativeTime(entry.at)}</span>
                  </Tooltip>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
            <ShowMore {...pages.more('timeline', detail.timeline.length)} />
            </>
          ) : (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          )}
        </Fold>
      </div>
      {delivery && canSupersede(delivery) && (
        <SupersedeForm
          item={delivery}
          onSupersede={async (from, create) => {
            await views.supersede(workspaceId, from, create)
            await load()
          }}
        />
      )}
      {delivery?.sessions.length ? (
        <p className="text-xs text-muted">Running for {duration(delivery.sessions.at(-1)!.boundAt)} in its latest attempt.</p>
      ) : null}
    </div>
  )
}

// A review group in the drawer: why its tasks wait, each task (opening it in
// the drawer), and Mark reviewed for all of them after a confirm. The group
// and revision are read again, so a stale list is not settled.
function ReviewPanel(props: { workspaceId: string; group: ConflictItem; open: (id: string) => void; onReviewed: () => void }) {
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const tasks = useMemo(() => taskClient(api), [api])
  const [page, setPage] = useState<{ revision: number; group: ConflictItem | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    views.conflictsPage(props.workspaceId).then(
      (read) => setPage({ revision: read.revision, group: read.items.find((item) => item.kind === 'review' && item.id === props.group.id) ?? null }),
      (caught: unknown) => setMessage(errorMessage(caught)),
    )
  }, [views, props.workspaceId, props.group.id])
  const group = page ? page.group : props.group
  const markReviewed = async () => {
    if (!page || !group) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await tasks.settle(props.workspaceId, 'reviewed', settleTargets(group), page.revision)
      const shown = resultMessage('reviewed', result)
      if (shown.ok) props.onReviewed()
      else setMessage(shown.text)
    } catch (caught) {
      setMessage(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <SectionHeading level={2} id="avoozl-drawer-title" title={group?.title ?? props.group.title} />
      <p className="text-sm text-muted">
        Avoozl re-reads a plan when its file changes. A task waits here when its own section changed, or when it is new. Moving a
        plan or fixing its links does not count. Read each task, then mark them reviewed so they may start.
      </p>
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      {page && !group ? (
        <p className="text-sm text-muted">Nothing here needs review now.</p>
      ) : (
        <>
          <div>{group && <ReviewButton item={group} busy={busy || !page} onConfirm={() => void markReviewed()} />}</div>
          <ul className="flex flex-col text-sm">
            {(group?.tasks ?? []).map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline gap-2 border-t py-1.5 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <button type="button" className="text-left underline" onClick={() => props.open(task.id)}>
                  {task.title}
                </button>
                <span className="text-xs text-muted">
                  {task.id}
                  {task.status ? ` · ${task.status}` : ''}
                </span>
                <Authority owner={task} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// The shared task drawer: slides in from the right, a full-width sheet under
// 768 px. Esc, the close button and a click outside close it; focus moves in
// and returns to where it was; no motion under prefers-reduced-motion.
function pageStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// The drawer's left edge: drag it, or focus it and press Left or Right, to
// change the width; double-click puts the default back.
function DrawerHandle(props: { width: number; onResize: (width: number) => void; onDragging: (on: boolean) => void; onReset: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the task drawer"
      aria-valuenow={props.width}
      aria-valuemin={DRAWER_MIN}
      tabIndex={0}
      data-drawer-handle
      onPointerDown={(event) => {
        event.preventDefault()
        const target = event.currentTarget
        target.setPointerCapture?.(event.pointerId)
        props.onDragging(true)
        const move = (e: PointerEvent) => props.onResize(window.innerWidth - e.clientX)
        const up = () => {
          props.onDragging(false)
          target.removeEventListener('pointermove', move)
          target.removeEventListener('pointerup', up)
        }
        target.addEventListener('pointermove', move)
        target.addEventListener('pointerup', up)
      }}
      onDoubleClick={props.onReset}
      onKeyDown={(event) => {
        const next = stepDrawer(props.width, event.key)
        if (next === null) return
        event.preventDefault()
        props.onResize(next)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="absolute inset-y-0 flex items-center justify-center outline-none"
      style={{ right: props.width - 5, width: 10, cursor: 'col-resize', zIndex: LAYER.raised }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 56,
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: hover ? 'var(--accent)' : 'color-mix(in srgb, var(--muted) 80%, var(--card))',
        }}
      />
    </div>
  )
}

export function TaskDrawerProvider({
  workspaceId,
  children,
  onFocus,
}: {
  workspaceId: string | null
  children: ReactNode
  // The drawer's Focus action: show this task's chain in the Graph.
  onFocus?: (id: string, title: string) => void
}) {
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const [mode, setMode] = useState<Mode>(null)
  const [history, setHistory] = useState<NonNullable<Mode>[]>([])
  const [graph, setGraph] = useState<Graph | null>(null)
  const [shown, setShown] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const narrow = useMedia('(max-width: 767px)')
  const still = useMedia('(prefers-reduced-motion: reduce)')
  // The drawer's width, per workspace; the left-edge handle changes it.
  const [width, setWidth] = useState(DRAWER_DEFAULT)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    setWidth(workspaceId ? readDrawerWidth(pageStorage(), workspaceId) : DRAWER_DEFAULT)
  }, [workspaceId])
  const resize = useCallback(
    (next: number) => {
      const value = clampDrawer(next, window.innerWidth)
      setWidth(value)
      if (workspaceId) writeDrawerWidth(pageStorage(), workspaceId, value)
    },
    [workspaceId],
  )

  // The mode as of the last render, so opening a linked task can push the
  // current one onto the Back history.
  const current = useRef<Mode>(null)
  current.current = mode
  const api_: TaskDrawerApi = useMemo(
    () => ({
      openTask: (id) => {
        const now = current.current
        if (!now) returnTo.current = document.activeElement as HTMLElement | null
        else if (now.kind === 'review' || (now.kind === 'task' && now.id !== id)) setHistory((h) => [...h, now])
        setMode({ kind: 'task', id })
      },
      addTask: (prefill) => {
        if (!current.current) returnTo.current = document.activeElement as HTMLElement | null
        setMode({ kind: 'add', prerequisite: prefill?.prerequisite })
      },
      openReview: (group, onReviewed) => {
        if (!current.current) returnTo.current = document.activeElement as HTMLElement | null
        setHistory([])
        setMode({ kind: 'review', group, onReviewed })
      },
    }),
    [],
  )
  const open = mode !== null
  const close = useCallback(() => {
    setShown(false)
    setMode(null)
    setHistory([])
    returnTo.current?.focus?.()
  }, [])

  useEffect(() => {
    if (!mode || !workspaceId) return
    views.graph(workspaceId).then(setGraph, () => setGraph(null))
  }, [open, workspaceId, views])
  useEffect(() => {
    if (!mode) return
    const frame = requestAnimationFrame(() => {
      setShown(true)
      panel.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const back = () => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory(history.slice(0, -1))
    setMode(previous)
  }
  // One page Back step while open: Back walks the drawer's own linked-task
  // history and then closes it; Esc closes it.
  useBackStep('drawer', open && Boolean(workspaceId), 'Close the drawer', () => (history.length ? back() : close()), close)

  return (
    <TaskDrawerContext.Provider value={api_}>
      {children}
      {mode && workspaceId && (
        <div className="fixed inset-0" style={{ zIndex: LAYER.drawer, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            aria-hidden="true"
            data-drawer-backdrop
            onClick={close}
            className="absolute inset-0"
            style={{ background: 'color-mix(in srgb, var(--text) 25%, transparent)' }}
          />
          {!narrow && (
            <DrawerHandle
              width={clampDrawer(width, typeof window === 'undefined' ? width : window.innerWidth)}
              onResize={resize}
              onDragging={setDragging}
              onReset={() => resize(DRAWER_DEFAULT)}
            />
          )}
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="avoozl-drawer-title"
            tabIndex={-1}
            className="relative flex h-full flex-col overflow-y-auto border-l p-4 shadow-lg outline-none"
            style={{
              width: narrow ? '100%' : clampDrawer(width, typeof window === 'undefined' ? width : window.innerWidth),
              background: 'var(--card, var(--bg))',
              color: 'var(--text)',
              borderColor: 'var(--border)',
              transform: shown || still ? 'none' : 'translateX(100%)',
              transition: still || dragging ? 'none' : 'transform 180ms ease-out',
            }}
          >

            <div className="mb-3 flex items-center gap-2">
              {history.length > 0 && <TipBtn tooltip="Go back to what you had open before" onClick={back}>Back</TipBtn>}
              <span className="grow" />
              {mode.kind === 'task' && (
                <IconLabel icon={Plus} tooltip="Add a draft task that waits on this one" onClick={() => api_.addTask({ prerequisite: mode.id })}>
                  Add a task after this
                </IconLabel>
              )}
              <IconLabel icon={X} onClick={close} aria-label="Close task details">
                Close
              </IconLabel>
            </div>
            {mode.kind === 'task' ? (
              <TaskPanel workspaceId={workspaceId} id={mode.id} graph={graph} open={api_.openTask} onClose={close} onFocus={onFocus} />
            ) : mode.kind === 'review' ? (
              <ReviewPanel
                workspaceId={workspaceId}
                group={mode.group}
                open={api_.openTask}
                onReviewed={() => {
                  mode.onReviewed?.()
                  close()
                }}
              />
            ) : (
              <>
                <SectionHeading level={2} id="avoozl-drawer-title" title="Add a task" className="mb-2" />
                <TaskForm
                  workspaceId={workspaceId}
                  graph={graph}
                  detail={null}
                  prerequisite={mode.prerequisite}
                  onSaved={(id) => setMode({ kind: 'task', id })}
                  onCancel={close}
                />
              </>
            )}
          </div>
        </div>
      )}
    </TaskDrawerContext.Provider>
  )
}
