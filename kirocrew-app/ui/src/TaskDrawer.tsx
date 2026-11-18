import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { TaskDrawerContext, type TaskDrawerApi } from './drawer-context.ts'
import { modelLabel, safeHref, viewsClient, canSupersede, type ConflictItem, type Graph } from './views-api.ts'
import { duration, lineText, linkParts, relativeTime, sessionHref, sourceLine, taskClient, tabHasData, TASK_TABS, TASK_TAB_KEYS, TASK_TAB_PARAM, type OriginSource, type TaskDetail, type TaskLink, type TaskOrigin, type TaskTab } from './task-api.ts'
import { Tabs, TabPanel, useTabParam } from './Tabs.tsx'
import { TaskSummaryBox } from './TaskSummaryBox.tsx'
import { DEFER_TIP, RESUME_TIP, RETRY_TIP, resumeStatus } from './delivery-api.ts'
import { ItemDetails, RetryForm, SupersedeForm } from './DeliveryDetails.tsx'
import { ConflictActions, ReviewButton } from './ConflictsView.tsx'
import { DocumentReader } from './DocumentReader.tsx'
import { CitedFile } from './CitedFile.tsx'
import { HandSetReview, ReviewRuns } from './ReviewState.tsx'
import { reviewRuns } from './views-api.ts'
import { Markdown } from './Markdown.tsx'
import TaskForm from './TaskForm.tsx'
import { Authority } from './Authority.tsx'
import { Modal } from './Modal.tsx'
import { errorMessage } from './workspace-api.ts'
import { IconLabel, SectionBox, ShowMore, TipBtn, useAskChat, usePages } from './controls.tsx'
import { resultMessage, settleTargets, whyLine } from './conflicts-api.ts'
import { itemRef } from './chat-api.ts'
import { TimingFold } from './FlowView.tsx'
import { EvidenceFold } from './Evidence.tsx'
import { TaskFiles } from './TaskFiles.tsx'
import { Eye, FileText, MessageSquare, Network, Pause, Pencil, Play, Plus, RotateCcw } from './icons.ts'
import { linkHref } from './views-api.ts'
import { ManualTask, TaskLinks } from './TaskNotes.tsx'
import { ReviewTaskContext } from './NeedsYouContext.tsx'
import { TaskScmLinks } from './TaskScmLinks.tsx'
import { TaskSteps } from './TaskSteps.tsx'

// What an empty tab says (the one rule: every tab shows, an empty one is muted).
const EMPTY: Record<TaskTab, string> = {
  overview: '',
  timeline: 'Nothing recorded yet.',
  links: '',
  work: 'No delivery yet. No worker session has started.',
  review: 'No review has run on this task.',
  details: '',
}

type Mode =
  | { kind: 'task'; id: string; tab?: TaskTab }
  | { kind: 'add'; prerequisite?: string }
  | { kind: 'review'; group: ConflictItem; onReviewed?: () => void }
  | null

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
            Open spec {origin.spec} in Specs
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
  onTitle: (id: string, title: string) => void
  tab?: TaskTab
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
  // The open tab lives in the page address, so Back and a pasted link land on
  // it. A task opens on Overview unless the caller names a tab (an old
  // Timeline link).
  const [tab, pick] = useTabParam<TaskTab>(TASK_TAB_PARAM, TASK_TAB_KEYS, 'overview', 'Back to the last task tab')
  const first = useRef(true)
  useEffect(() => {
    if (!first.current) return
    first.current = false
    const want = props.tab ?? 'overview'
    if (want !== tab) pick(want)
    // Once, when the task opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
  const { onTitle } = props
  useEffect(() => {
    if (detail) onTitle(id, detail.task.title)
  }, [detail, id, onTitle])

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
  const runs = reviewRuns(delivery).length

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Authority owner={task} />
          {task.state && <Badge variant={task.state === 'needs-you' ? 'warning' : undefined}>{task.state}</Badge>}
          {detail.locked && <Badge>locked</Badge>}
          {task.planArchived && <Badge>Archived</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.onFocus && (
          <IconLabel
            icon={Network}
            tooltip="Show this task's dependency tree in the Graph: what it waits on and what waits on it"
            onClick={() => {
              props.onFocus!(task.id, task.title)
              props.onClose()
            }}
          >
            Open tree
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
          <a href={linkHref(issue)} target="_blank" rel="noopener noreferrer" className="self-center text-xs underline">
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
      {task.manual && (
        <ManualTask
          workspaceId={workspaceId}
          task={{ id: task.id, title: task.title, acceptance: task.acceptance, manualDone: task.manualDone ?? null, onGitHub: Boolean(task.onGitHub) }}
          onChanged={(text) => {
            setMessage({ ok: true, text })
            void load()
          }}
        />
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
      <Tabs id="task-tabs" label="Task details" tabs={TASK_TABS} current={tab} onPick={pick} />
      <TabPanel id="task-tabs" current={tab}>
        {tab !== 'overview' && !tabHasData(tab, detail, runs) && <p className="text-sm text-muted" data-tab-empty={tab}>{EMPTY[tab]}</p>}
        {tab === 'overview' && (
          <>
            <TaskSummaryBox workspaceId={workspaceId} id={task.id} summary={detail.summary} />
            <SectionBox id="summary" title="Status">
              <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }}>
                <Row label="State">{task.state ?? 'unknown'}</Row>
                <Row label="Spec">
                  {detail.plan ? `${detail.plan.title}${detail.plan.approved ? ' (approved)' : ` (${detail.plan.state ?? 'draft'})`}` : 'none'}
                  {task.planArchived ? ' · archived: its tasks do not start until you unarchive it' : ''}
                </Row>
                <Row label="Phase">{task.phase?.title ?? 'none'}</Row>
                <Row label="Wave">{task.wave}</Row>
                <Row label="Done when">{task.completion}</Row>
                {task.decision && <Row label="Decision">{task.decision}</Row>}
                {task.needsReview && <Row label="Review">Needs your review</Row>}
                {(delivery?.pullRequests ?? []).map((pull, i) => (
                  <Row key={i} label="Pull request">
                    {safeHref(pull.url) ? (
                      <a href={safeHref(pull.url)!} target="_blank" rel="noopener noreferrer" className="underline">
                        #{pull.number}
                        {pull.merged ? ' (merged)' : ''}
                      </a>
                    ) : (
                      `#${pull.number}`
                    )}
                  </Row>
                ))}
              </dl>
            </SectionBox>
            <SectionBox id="links" title="Edges">
              <div className="flex flex-col gap-3">
                <Links title="Waits on" links={detail.waitsOn} open={props.open} />
                <Links title="Blocks" links={detail.blocks} open={props.open} />
              </div>
            </SectionBox>
            {detail.conflicts.length > 0 && (
              <SectionBox id="conflicts" title={`Conflicts (${detail.conflicts.length})`}>
                <ul className="flex flex-col gap-3">
                  {detail.conflicts.map((item, i) => (
                    <li key={i} className="flex flex-col gap-2 rounded border p-2" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-sm font-medium">{whyLine(item)}</div>
                      {item.changedAt && (
                        <div className="text-xs text-muted">
                          Changed {relativeTime(item.changedAt)}
                          {item.changedBy ? ` by ${item.changedBy}` : ''}. See the Timeline tab for this task&apos;s history.
                        </div>
                      )}
                      <span>
                        <IconLabel icon={MessageSquare} tooltip="Start a Kiro Crew chat seeded with this item" onClick={() => void chat.ask({ items: [itemRef(item)] })}>
                          Ask in a chat
                        </IconLabel>
                      </span>
                      <ConflictActions item={item} workspaceId={workspaceId} revision={detail.revision} busy={busy} run={run} onSettled={() => undefined} />
                    </li>
                  ))}
                </ul>
              </SectionBox>
            )}
          </>
        )}
        {tab === 'timeline' && tabHasData('timeline', detail, runs) && (
          <>
            <SectionBox id="timeline" title="Timeline">
              {detail.steps?.length ? <TaskSteps steps={detail.steps} /> : null}
              {detail.timeline.length ? (
                <>
                  {detail.steps?.length ? <h4 className="mt-2 text-sm font-semibold">All records</h4> : null}
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
              ) : null}
            </SectionBox>
            <SectionBox id="timing" title="Timing">
              <TimingFold timing={detail.timing ?? null} />
            </SectionBox>
          </>
        )}
        {tab === 'links' && (
          <>
            <SectionBox id="task-links" title="Links">
              <div className="flex flex-col gap-3">
                <TaskScmLinks links={detail.links} />
                <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }} data-added-links>
                  <h4 className="text-sm font-semibold">Added links</h4>
                  <TaskLinks workspaceId={workspaceId} taskId={task.id} onGitHub={Boolean(task.onGitHub)} refresh={detail.revision} />
                </div>
              </div>
            </SectionBox>
            <SectionBox id="files" title="Files">
              <TaskFiles workspaceId={workspaceId} taskId={task.id} active />
            </SectionBox>
          </>
        )}
        {tab === 'work' && delivery && (
          <>
            <SectionBox id="delivery" title="Delivery">
              <div className="flex flex-col gap-2">
                {delivery.sessions.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {delivery.sessions.map((session) => (
                      <li key={session.slot}>
                        <a href={linkHref(sessionHref(session))} className="underline">
                          {session.role} attempt {session.attempt}
                        </a>{' '}
                        <span className="text-xs text-muted">
                          {session.status ?? 'not observed'} · {modelLabel(session) ?? 'model not named'} · started {relativeTime(session.boundAt)}
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
            </SectionBox>
            {canSupersede(delivery) && (
              <SupersedeForm
                item={delivery}
                onSupersede={async (from, create) => {
                  await views.supersede(workspaceId, from, create)
                  await load()
                }}
              />
            )}
            {delivery.sessions.length ? <p className="text-xs text-muted">Running for {duration(delivery.sessions.at(-1)!.boundAt)} in its latest attempt.</p> : null}
          </>
        )}
        {tab === 'review' && tabHasData('review', detail, runs) && (
          <>
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
            {runs > 0 && (
              <SectionBox id="review" title="Review">
                <ReviewRuns item={delivery} />
              </SectionBox>
            )}
          </>
        )}
        {tab === 'details' && (
          <>
            <SectionBox id="fields" title="Fields">
              <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }}>
                <Row label="Epic">{task.epicTitle ?? 'none'}</Row>
                {detail.origin && (
                  <Row label="Came from">
                    <Origin origin={detail.origin} issue={issue} workspaceId={workspaceId} />
                  </Row>
                )}
                <Row label="Authority">
                  <Authority owner={task} /> {task.authority}
                </Row>
                <Row label="Route">{task.route}</Row>
                <Row label="Status">{task.status ?? 'none'}</Row>
                {task.repository && <Row label="Repository">{task.repository}</Row>}
                {task.owner && <Row label="Assignee">{task.owner}</Row>}
              </dl>
            </SectionBox>
            <SectionBox id="description" title="Description">
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
                    <h4 className="text-sm font-semibold">From its spec</h4>
                    <Markdown text={task.context} />
                  </div>
                )}
              </div>
            </SectionBox>
            <SectionBox id="evidence" title="Evidence">
              <EvidenceFold workspaceId={workspaceId} taskId={task.id} />
            </SectionBox>
          </>
        )}
      </TabPanel>
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
      <p className="text-sm text-muted">
        Avoozl re-reads a spec when its file changes. A task waits here when its own section changed, or when it is new. Moving a
        spec or fixing its links does not count. Read each task, then mark them reviewed so they may start.
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
          <ul className="m-0 flex list-none flex-col p-0" data-review-tasks>
            {(group?.tasks ?? []).map((task) => (
              <ReviewTaskContext key={task.id} task={task} />
            ))}
          </ul>
          <div>{group && <ReviewButton item={group} busy={busy || !page} onConfirm={() => void markReviewed()} />}</div>
        </>
      )}
    </div>
  )
}

// The shared task details: a centered modal, full screen under 768 px. Esc,
// the close button and a click outside close it; focus moves in and returns
// to where it was; no motion under prefers-reduced-motion.
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
  const [heading, setHeading] = useState<{ id: string; title: string } | null>(null)
  // The mode as of the last render, so opening a linked task can push the
  // current one onto the Back history.
  const current = useRef<Mode>(null)
  current.current = mode
  const closing = useRef<() => void>(() => undefined)
  const api_: TaskDrawerApi = useMemo(
    () => ({
      openTask: (id, tab) => {
        const now = current.current
        if (now && (now.kind === 'review' || (now.kind === 'task' && now.id !== id))) setHistory((h) => [...h, now])
        setMode({ kind: 'task', id, tab })
      },
      addTask: (prefill) => {
        setMode({ kind: 'add', prerequisite: prefill?.prerequisite })
      },
      openReview: (group, onReviewed) => {
        setHistory([])
        setMode({ kind: 'review', group, onReviewed })
      },
      close: () => closing.current(),
    }),
    [],
  )
  const open = mode !== null
  const close = useCallback(() => {
    setMode(null)
    setHistory([])
    setHeading(null)
  }, [])
  closing.current = close

  useEffect(() => {
    if (!mode || !workspaceId) return
    views.graph(workspaceId).then(setGraph, () => setGraph(null))
  }, [open, workspaceId, views])

  const showTitle = useCallback((id: string, text: string) => setHeading({ id, title: text }), [])
  const back = () => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory(history.slice(0, -1))
    setMode(previous)
  }

  // The modal's title is the item itself: the task's title with its id small
  // beside it, the review group's title, or "Add a task".
  const titled = mode?.kind === 'task' && heading?.id === mode.id ? heading.title : null
  const title =
    mode?.kind === 'task' ? (
      <>
        {titled ?? 'Loading…'} <small className="font-normal text-muted" data-modal-title-id>{mode.id}</small>
      </>
    ) : mode?.kind === 'review' ? (
      mode.group.title
    ) : (
      'Add a task'
    )

  return (
    <TaskDrawerContext.Provider value={api_}>
      {children}
      {mode && workspaceId && (
        // The shared modal: centered, full screen on a phone. Back walks the
        // linked-task history first; Esc, the X and Close close it.
        <Modal
          id="avoozl-drawer"
          role="dialog"
          kind="drawer"
          width="56rem"
          height="52rem"
          backLabel="Close the drawer"
          dismissLabel={mode.kind === 'add' ? 'Cancel' : 'Close'}
          attrs={{ 'data-task-modal': true }}
          title={title}
          onDismiss={close}
          onBack={() => (history.length ? back() : close())}
          footer={
            <>
              {history.length > 0 && (
                <TipBtn tooltip="Go back to what you had open before" onClick={back}>
                  Back
                </TipBtn>
              )}
              <span className="grow" />
              {mode.kind === 'task' && (
                <IconLabel icon={Plus} tooltip="Add a draft task that waits on this one" onClick={() => api_.addTask({ prerequisite: mode.id })}>
                  Add task after this
                </IconLabel>
              )}
            </>
          }
        >
          {mode.kind === 'task' ? (
            <TaskPanel key={mode.id} workspaceId={workspaceId} id={mode.id} tab={mode.tab} graph={graph} open={api_.openTask} onClose={close} onFocus={onFocus} onTitle={showTitle} />
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
            <TaskForm
              workspaceId={workspaceId}
              graph={graph}
              detail={null}
              prerequisite={mode.prerequisite}
              onSaved={(id) => setMode({ kind: 'task', id })}
            />
          )}
        </Modal>
      )}
    </TaskDrawerContext.Provider>
  )
}
