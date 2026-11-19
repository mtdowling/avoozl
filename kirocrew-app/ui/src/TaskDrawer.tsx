import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import Badge from './ui/Badge.tsx'
import { TaskDrawerContext, useTaskDrawer, type TaskDrawerApi } from './drawer-context.ts'
import { modelLabel, safeHref, viewsClient, canSupersede, type ConflictItem, type DeliveryItem, type Graph } from './views-api.ts'
import { duration, linkParts, relativeTime, sessionHref, sourceExcerpt, sourceLine, taskClient, visibleTabs, TASK_TAB_KEYS, TASK_TAB_PARAM, type OriginSource, type TaskDetail, type TaskLink, type TaskOrigin, type TaskTab } from './task-api.ts'
import { Tabs, TabPanel, useTabParam } from './ui/Tabs.tsx'
import { TaskSummaryBox } from './TaskSummaryBox.tsx'
import { DEFER_TIP, RESUME_TIP, RETRY_TIP, resumeStatus } from './delivery-api.ts'
import { ItemDetails, RetryForm, SupersedeForm } from './DeliveryDetails.tsx'
import { ConflictActions, ReviewButton } from './ConflictsView.tsx'
import { DocumentReader } from './DocumentReader.tsx'
import { SnippetBox } from './SnippetBox.tsx'
import { EdgeList } from './EdgeList.tsx'
import { HandSetReview, ReviewRuns } from './ReviewState.tsx'
import { reviewRuns } from './views-api.ts'
import { Markdown } from './ui/Markdown.tsx'
import TaskForm from './TaskForm.tsx'
import { Authority } from './Authority.tsx'
import { Modal } from './ui/Modal.tsx'
import { errorMessage } from './workspace-api.ts'
import { IconLabel, SectionBox, ShowMore, TipBtn, useAskChat, usePages } from './ui/controls.tsx'
import { resultMessage, settleTargets, whyLine } from './conflicts-api.ts'
import { itemRef } from './chat-api.ts'
import { TimingFold } from './FlowView.tsx'
import { EvidenceFold } from './Evidence.tsx'
import { TaskFiles } from './TaskFiles.tsx'
import { FileText, MessageSquare, Network, Pause, Pencil, Play, Plus, RotateCcw } from './icons.ts'
import { linkHref } from './views-api.ts'
import { ManualTask, TaskLinks } from './TaskNotes.tsx'
import { ReviewTaskContext } from './NeedsYouContext.tsx'
import { TaskScmLinks } from './TaskScmLinks.tsx'
import { TaskSteps } from './TaskSteps.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'
import { PlainButton, PlainLink } from './ui/Plain'

// Lines shown either side of a task's own lines.
const SNIPPET_CONTEXT = 3

type Mode =
  | { kind: 'task'; id: string; tab?: TaskTab }
  | { kind: 'add'; prerequisite?: string }
  | { kind: 'review'; group: ConflictItem; onReviewed?: () => void }
  | null

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Hint as="dt">{label}</Hint>
      <Box as="dd" minW0 breakWords>{children}</Box>
    </>
  )
}

function Links({ title, links, open }: { title: string; links: TaskLink[]; open: (id: string) => void }) {
  if (links.length === 0) return null
  const items = links.map((link) => ({
    id: link.id,
    text: link.title,
    note: `${link.id} · ${link.kind === 'sequence' ? 'runs after' : 'needs done'}${link.condition ? ` (${link.condition})` : ''} · ${link.satisfied ? 'met' : 'waiting'}`,
  }))
  return (
    <div>
      <Box as="h4" size="sm" weight="semibold">{title}</Box>
      <Box mt="1">
        <EdgeList label={title} items={items} onOpen={open} />
      </Box>
    </div>
  )
}

// The drawer's body for one task: sections and the actions the other views
// offer, all on one read (task.detail).

// One source's snippet: its own lines and 3 either side, each numbered, with
// the task's lines marked. Read from the file when first opened. The header
// (SnippetBox) shows and hides it; Open full file opens the whole file.
function SourceSnippet(props: { source: OriginSource; workspaceId: string; open: boolean; onFull: () => void }) {
  const { source } = props
  const api = useAppApi()
  const tasks = useMemo(() => taskClient(api), [api])
  const [read, setRead] = useState<{ text: string | null; error: string | null }>({ text: null, error: null })
  const [asked, setAsked] = useState(props.open)
  useEffect(() => {
    if (!asked) return
    let live = true
    tasks.document(props.workspaceId, source.document).then(
      (doc) => live && setRead({ text: doc.text, error: null }),
      (caught) => live && setRead({ text: null, error: errorMessage(caught) }),
    )
    return () => {
      live = false
    }
  }, [asked, tasks, props.workspaceId, source.document])
  const rows = read.text === null ? [] : sourceExcerpt(read.text, source, SNIPPET_CONTEXT)
  return (
    <SnippetBox
      attr="data-origin-reader"
      open={props.open}
      onToggle={(open) => open && setAsked(true)}
      title={<span data-excerpt-range>{sourceLine(source)}</span>}
      action={
        <IconLabel icon={FileText} tooltip={`Open all of ${source.document} in a reader, at the cited line`} onClick={props.onFull}>
          Open full file
        </IconLabel>
      }
    >
      {read.error ? (
        <Box role="alert" as="p" css-border-color="border" border="t" p="2" tone="danger">
          {read.error}
        </Box>
      ) : read.text === null ? (
        <Box as="p" css-border-color="border" border="t" p="2" tone="muted">
          Reading…
        </Box>
      ) : (
        <Box as="ol" css-border-color="border" m0 listNone overflow="x-auto" border="t" p="0" fontMono aria-label={`Lines from ${source.document}`} data-snippet-lines>
          {rows.map((row) => (
            <li
              key={row.number}
              data-snippet-line={row.number}
              data-hit={row.hit ? 'true' : undefined}
              className="flex gap-3 px-2 py-px"
              style={row.hit ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
            >
              <Box as="span" w8 shrink0 selectNone align="right" tone="muted">{row.number}</Box>
              <Box as="span" css-overflow-wrap="anywhere" whitespace="pre-wrap">
                {row.text || ' '}
              </Box>
            </li>
          ))}
        </Box>
      )}
    </SnippetBox>
  )
}

// Where a task came from: the sentence, and a snippet of the file lines it
// was made from. The first readable source's snippet is open at first. The
// file's path in the sentence and Open full file show the whole file in
// DocumentReader. A file the workspace no longer has says so.
function Origin(props: { origin: TaskOrigin; issue: string | null; workspaceId: string; onOpenSpec?: (spec: string) => void }) {
  const { origin } = props
  const [full, setFull] = useState<OriginSource | null>(null)
  const closeFull = useCallback(() => setFull(null), [])
  const first = origin.sources[0]
  const firstReadable = origin.sources.find((s) => s.readable) ?? null
  return (
    <Box flex flexCol gap="1.5" data-origin={origin.kind}>
      <Box as="span" weight="medium">{origin.label}</Box>
      <Hint size="xs">
        {first?.readable
          ? linkParts(origin.text, first.document).map((part, i) =>
              part.link ? (
                <PlainButton key={i} type="button" css-color="accent" css-overflow-wrap="anywhere" underline onClick={() => setFull(first)} data-origin-path>
                  {part.text}
                </PlainButton>
              ) : (
                part.text
              ),
            )
          : origin.text}
      </Hint>
      <Box flex flexWrap items="center" gap="2">
        {origin.kind === 'github-issue' && props.issue && (
          <PlainLink href={linkHref(props.issue)} target="_blank" rel="noopener noreferrer" size="xs" underline>
            Open the issue on GitHub
          </PlainLink>
        )}
        {origin.spec && props.onOpenSpec && (
          <PlainButton type="button" size="xs" underline onClick={() => props.onOpenSpec!(origin.spec!)}>
            Open spec {origin.spec} in Specs
          </PlainButton>
        )}
        {origin.sources
          .filter((source) => !source.readable)
          .map((source) => (
            <Hint key={source.document} size="xs">
              {sourceLine(source)} (no longer in this workspace)
            </Hint>
          ))}
      </Box>
      {origin.prompt && <blockquote className="border-l-2 pl-2 text-xs text-muted" style={{ borderColor: 'var(--border)' }}>{origin.prompt}</blockquote>}
      {origin.sources
        .filter((source) => source.readable)
        .map((source) => (
          <SourceSnippet key={source.document + source.lineStart} source={source} workspaceId={props.workspaceId} open={source === firstReadable} onFull={() => setFull(source)} />
        ))}
      {full && <DocumentReader workspaceId={props.workspaceId} target={full} onClose={closeFull} />}
    </Box>
  )
}

// The planner batch a task belongs to (§4.37, R108.9): its reason and every
// task in it, each opening that task's details; the leader's details stand
// for the batch's one In progress card. When the group broke a rule, why the
// task runs alone.
function BatchBox(props: { batch: NonNullable<DeliveryItem['batchGroup']>; alone: string | null; self: string }) {
  const drawer = useTaskDrawer()
  const { batch } = props
  return (
    <SectionBox id="batch" title="Batch">
      <Box flex flexCol gap="1" size="sm" data-task-batch={batch.id ?? batch.group ?? ''}>
        <Box as="p" m0>
          {batch.id ? 'Ran in batch ' : 'Planned batch '}
          {batch.leader === props.self ? <Box as="span" weight="medium">{batch.group ?? batch.id}</Box> : <PlainButton type="button" underline onClick={() => drawer.openTask(batch.leader)} data-batch-link={batch.leader}>{batch.group ?? batch.id}</PlainButton>}
          {batch.reason ? <Hint> · {batch.reason}</Hint> : null}
        </Box>
        <Box as="ul" m0 flex flexCol gap="0.5" pl="4" size="xs">
          {batch.tasks.map((id) => (
            <li key={id}>
              {id === props.self ? <span>{id} (this task)</span> : <PlainButton type="button" underline onClick={() => drawer.openTask(id)}>{id}</PlainButton>}
              {id === batch.leader ? <Hint> · leads</Hint> : null}
            </li>
          ))}
        </Box>
        {props.alone && <Hint as="p" size="xs" flush data-runs-alone>Runs alone: {props.alone}</Hint>}
      </Box>
    </SectionBox>
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
  const [picked, pick] = useTabParam<TaskTab>(TASK_TAB_PARAM, TASK_TAB_KEYS, 'overview', 'Back to the last task tab')
  const first = useRef(true)
  useEffect(() => {
    if (!first.current) return
    first.current = false
    const want = props.tab ?? 'overview'
    if (want !== picked) pick(want)
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
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!detail) return <Hint as="p" size="sm">Loading…</Hint>
  const { task, delivery } = detail
  const local = task.authority === 'local'
  const deliveryState = (delivery?.deliveries ?? []).map((d) => d.state).filter((s): s is string => typeof s === 'string').at(-1)
  const deferred = task.status === 'deferred'
  const resume = resumeStatus(props.graph)
  const done = delivery?.complete ?? task.state === 'done'
  const issue = safeHref(task.issue?.url ?? null)
  const runs = reviewRuns(delivery).length
  const shown = visibleTabs(detail, runs)
  // An address that names a tab with no data lands on Overview.
  const tab: TaskTab = shown.some((t) => t.key === picked) ? picked : 'overview'

  return (
    <Stack gap={3}>
      <div>
        <Box flex flexWrap items="center" gap="1.5" size="xs" tone="muted">
          <Authority owner={task} />
          {task.state && <Badge variant={task.state === 'needs-you' ? 'warning' : undefined}>{task.state}</Badge>}
          {detail.locked && <Badge>locked</Badge>}
          {task.planArchived && <Badge>Archived</Badge>}
        </Box>
      </div>
      <Box flex flexWrap gap="2">
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
          <PlainLink href={linkHref(issue)} target="_blank" rel="noopener noreferrer" self="center" size="xs" underline>
            Defer on the board
          </PlainLink>
        )}
      </Box>
      {chat.error && (
        <ErrorText role="alert" size="sm">
          {chat.error}
        </ErrorText>
      )}
      {message && (
        <Box role={message.ok ? 'status' : 'alert'} as="p" size="sm" tone={message.ok ? 'muted' : 'danger'}>
          {message.text}
        </Box>
      )}
      {task.manual && (
        <ManualTask
          workspaceId={workspaceId}
          task={{ id: task.id, title: task.title, acceptance: task.acceptance, manualDone: task.manualDone ?? null }}
          onChanged={(text) => {
            setMessage({ ok: true, text })
            void load()
          }}
        />
      )}
      {editing && (
        <Box css-border-color="border" rounded="base" border="all" p="3">
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
        </Box>
      )}
      <Tabs id="task-tabs" label="Task details" tabs={shown} current={tab} onPick={pick} />
      <TabPanel id="task-tabs" current={tab}>
        {tab === 'overview' && (
          <>
            <TaskSummaryBox workspaceId={workspaceId} id={task.id} summary={detail.summary} />
            <SectionBox id="summary" title="Status">
              <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1.5" size="sm">
                <Row label="State">{task.state ?? 'unknown'}</Row>
                {detail.plan && (
                  <Row label="Spec">
                    {`${detail.plan.title}${detail.plan.approved ? ' (approved)' : ` (${detail.plan.state ?? 'draft'})`}`}
                    {task.planArchived ? ' · archived: its tasks do not start until you unarchive it' : ''}
                  </Row>
                )}
                {task.phase && <Row label="Phase">{task.phase.title}</Row>}
                <Row label="Wave">{task.wave}</Row>
                <Row label="Done when">{task.completion}</Row>
                {task.decision && <Row label="Decision">{task.decision}</Row>}
                {task.needsReview && <Row label="Review">Needs your review</Row>}
                {(delivery?.pullRequests ?? []).map((pull, i) => (
                  <Row key={i} label="Pull request">
                    {safeHref(pull.url) ? (
                      <TextLink href={safeHref(pull.url)!} target="_blank" rel="noopener noreferrer">
                        #{pull.number}
                        {pull.merged ? ' (merged)' : ''}
                      </TextLink>
                    ) : (
                      `#${pull.number}`
                    )}
                  </Row>
                ))}
              </Box>
            </SectionBox>
            {(detail.waitsOn.length > 0 || detail.blocks.length > 0) && (
              <SectionBox id="links" title="Edges">
                <Stack gap={3}>
                  <Links title="Waits on" links={detail.waitsOn} open={props.open} />
                  <Links title="Blocks" links={detail.blocks} open={props.open} />
                </Stack>
              </SectionBox>
            )}
            {detail.conflicts.length > 0 && (
              <SectionBox id="conflicts" title={`Conflicts (${detail.conflicts.length})`}>
                <Stack as="ul" gap={3}>
                  {detail.conflicts.map((item, i) => (
                    <Box key={i} as="li" css-border-color="border" flex flexCol gap="2" rounded="base" border="all" p="2">
                      <Box size="sm" weight="medium">{whyLine(item)}</Box>
                      <span>
                        <IconLabel icon={MessageSquare} tooltip="Start a Kiro Crew chat seeded with this item" onClick={() => void chat.ask({ items: [itemRef(item)] })}>
                          Ask in a chat
                        </IconLabel>
                      </span>
                      <ConflictActions item={item} workspaceId={workspaceId} revision={detail.revision} busy={busy} run={run} onSettled={() => undefined} />
                    </Box>
                  ))}
                </Stack>
              </SectionBox>
            )}
          </>
        )}
        {tab === 'timeline' && (
          <>
            <SectionBox id="timeline" title="Timeline">
              {detail.steps?.length ? <TaskSteps steps={detail.steps} /> : null}
              {detail.timeline.length ? (
                <>
                  {detail.steps?.length ? <Box as="h4" mt="2" size="sm" weight="semibold">All records</Box> : null}
                  <Box as="ol" flex flexCol gap="1" size="sm">
                    {pages.take('timeline', detail.timeline).map((entry, i) => (
                      <Box key={i} as="li" flex gap="2">
                        <Tooltip text={entry.at}>
                          <Box as="span" w28 shrink0 size="xs" tone="muted">{relativeTime(entry.at)}</Box>
                        </Tooltip>
                        <span>{entry.text}</span>
                      </Box>
                    ))}
                  </Box>
                  <ShowMore {...pages.more('timeline', detail.timeline.length)} />
                </>
              ) : null}
            </SectionBox>
            {detail.timing && (
              <SectionBox id="timing" title="Timing">
                <TimingFold timing={detail.timing} />
              </SectionBox>
            )}
          </>
        )}
        {tab === 'links' && (
          <>
            <SectionBox id="task-links" title="Links">
              <Stack gap={3}>
                <TaskScmLinks links={detail.links} />
                <Box css-border-color="border" flex flexCol gap="2" border="t" pt="3" data-added-links>
                  <Box as="h4" size="sm" weight="semibold">Added links</Box>
                  <TaskLinks workspaceId={workspaceId} taskId={task.id} refresh={detail.revision} />
                </Box>
              </Stack>
            </SectionBox>
            <TaskFiles workspaceId={workspaceId} taskId={task.id} active box={{ id: 'files', title: 'Files' }} />
          </>
        )}
        {tab === 'overview' && delivery?.batchGroup && <BatchBox batch={delivery.batchGroup} alone={delivery.alone ?? null} self={task.id} />}
        {tab === 'work' && delivery && (
          <>
            <SectionBox id="delivery" title="Delivery">
              <Stack gap={2}>
                {delivery.sessions.length > 0 && (
                  <Box as="ul" flex flexCol gap="1" size="sm">
                    {delivery.sessions.map((session) => (
                      <li key={session.slot}>
                        <TextLink href={linkHref(sessionHref(session))}>
                          {session.role} attempt {session.attempt}
                        </TextLink>{' '}
                        <Hint size="xs">
                          {session.status ?? 'not observed'} · {modelLabel(session) ?? 'model not named'} · started {relativeTime(session.boundAt)}
                          {session.statusAt ? ` · last activity ${relativeTime(session.statusAt)}` : ''}
                        </Hint>
                      </li>
                    ))}
                  </Box>
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
              </Stack>
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
            {delivery.sessions.length ? <Hint as="p" size="xs">Running for {duration(delivery.sessions.at(-1)!.boundAt)} in its latest attempt.</Hint> : null}
          </>
        )}
        {tab === 'review' && (
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
              <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1.5" size="sm">
                {task.epicTitle && <Row label="Epic">{task.epicTitle}</Row>}
                {detail.origin && (
                  <Row label="Came from">
                    <Origin origin={detail.origin} issue={issue} workspaceId={workspaceId} />
                  </Row>
                )}
                <Row label="Authority">
                  <Authority owner={task} /> {task.authority}
                </Row>
                <Row label="Route">{task.route}</Row>
                {task.status && <Row label="Status">{task.status}</Row>}
                {task.repository && <Row label="Repository">{task.repository}</Row>}
                {task.owner && <Row label="Assignee">{task.owner}</Row>}
              </Box>
            </SectionBox>
            {(task.summary || task.acceptance.length > 0 || task.checks.length > 0 || task.context) && (
              <SectionBox id="description" title="Description">
                <Stack gap={3}>
                  {task.summary && <Markdown text={task.summary} />}
                  {task.acceptance.length > 0 && (
                    <div>
                      <Box as="h4" size="sm" weight="semibold">Acceptance</Box>
                      <Box as="ul" mt="1" listDisc pl="5" size="sm">
                        {task.acceptance.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </Box>
                    </div>
                  )}
                  {task.checks.length > 0 && (
                    <div>
                      <Box as="h4" size="sm" weight="semibold">Checks</Box>
                      <Box as="ul" mt="1" flex flexCol gap="1" size="sm">
                        {task.checks.map((line, i) => (
                          <li key={i}>
                            <code>{line}</code>
                          </li>
                        ))}
                      </Box>
                    </div>
                  )}
                  {task.context && (
                    <div>
                      <Box as="h4" size="sm" weight="semibold">From its spec</Box>
                      <Markdown text={task.context} />
                    </div>
                  )}
                </Stack>
              </SectionBox>
            )}
            <EvidenceFold workspaceId={workspaceId} taskId={task.id} box={{ id: 'evidence', title: 'Evidence' }} />
          </>
        )}
      </TabPanel>
    </Stack>
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
    <Stack gap={3}>
      <Hint as="p" size="sm">
        Avoozl re-reads a spec when its file changes. A task waits here when its own section changed, or when it is new. Moving a
        spec or fixing its links does not count. Read each task, then mark them reviewed so they may start.
      </Hint>
      {message && (
        <ErrorText role="alert" size="sm">
          {message}
        </ErrorText>
      )}
      {page && !group ? (
        <Hint as="p" size="sm">Nothing here needs review now.</Hint>
      ) : (
        <>
          <Box as="ul" m0 flex listNone flexCol p="0" data-review-tasks>
            {(group?.tasks ?? []).map((task) => (
              <ReviewTaskContext key={task.id} task={task} />
            ))}
          </Box>
          <div>{group && <ReviewButton item={group} busy={busy || !page} onConfirm={() => void markReviewed()} />}</div>
        </>
      )}
    </Stack>
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
        {titled ?? 'Loading…'} <Box as="small" weight="normal" tone="muted" data-modal-title-id>{mode.id}</Box>
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
              <Box as="span" grow />
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
