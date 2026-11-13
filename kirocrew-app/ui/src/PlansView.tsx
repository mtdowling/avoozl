import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi, useChatLauncher } from '@kirocrew/app-sdk'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Markdown } from './Markdown.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './TaskDrawer.tsx'
import { errorMessage } from './workspace-api'
import { relativeTime } from './task-api.ts'
import { Authority } from './Authority.tsx'
import NewPlanDrawer from './NewPlanDrawer.tsx'
import { IconBtn, IconLabel, SectionHeading, ShowMore, TipBtn, ViewHeading, dangerStyle, useAskChat, usePages } from './controls.tsx'
import { Archive, ArchiveRestore, ArrowLeft, ChevronRight, ClipboardCheck, DetailsIcon, Download, FolderOpen, LayoutGrid, MessagesSquare, Network, Pencil, Plus, RefreshCw, Trash2, X } from './icons.ts'
import { FilterPanel } from './FilterPanel.tsx'
import { STATES, documentEpic, nodeState, type Drill, type NodeState } from './graph-layout.ts'
import { rowPlanKey, type TaskFilter } from './filters.ts'
import { outline } from './markdown.ts'
import { registerLanguages } from './highlight.ts'
import { scrollParent, stickyHeight } from './sticky-column.ts'
import { viewsClient, type Graph } from './views-api.ts'
import { useBackStep, useSteppedState } from './NavHistory.tsx'
import {
  UNCATEGORIZED,
  approveBlocker,
  changeMessage,
  describeWrite,
  discussSeed,
  documentTabs,
  filterRows,
  groupByCategory,
  location,
  plansClient,
  deleteLines,
  ARCHIVE_LINES,
  planEventLine,
  type DeletePreview,
  type PlansClient,
  progressPercent,
  rowActions,
  rowChoices,
  shortHash,
  writesByRepository,
  type PlanListFilter,
  type PlanRow,
  type PlanTable,
  type Preview,
  type ProjectionPreview,
  type SpecDocuments,
  type SpecPlan,
  type SpecSummary,
} from './plans-api'

// Where a row's Graph or Delivery button goes; the filter is the tabs'
// shared one, set to this plan.
export type PlanTarget = 'graph' | 'delivery'

// Plan prose stays at a readable line length (about 80 characters); tables
// and code blocks may use the column's full width.
export const PROSE_MEASURE = '80ch'

// The plan view's left column width, and the width under which it stacks.
const ASIDE_WIDTH = '17rem'
const STACK = '(max-width: 1023px)'

// The left column sticks to the top of whatever scrolls the page (in Kiro
// Crew, the app's own content pane, not the window) and is never taller
// than the part of it on screen, so it scrolls on its own. The callback ref
// measures when the column mounts, which is after the plan opens, and again
// whenever that pane changes size.
function useStickyHeight(on: boolean) {
  const [height, setHeight] = useState<number | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const ref = useCallback(
    (node: HTMLElement | null) => {
      stop.current?.()
      stop.current = null
      if (!node || !on) return
      const parent = scrollParent(node)
      const measure = () => setHeight(stickyHeight(parent, window.innerHeight))
      measure()
      const observer = parent && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
      if (parent) observer?.observe(parent)
      window.addEventListener('resize', measure)
      stop.current = () => {
        observer?.disconnect()
        window.removeEventListener('resize', measure)
      }
    },
    [on],
  )
  useEffect(() => () => stop.current?.(), [])
  return [ref, height] as const
}

const docPrefix = (file: string) => `avoozl-doc-${file.replace(/\.md$/, '')}`
const jump = (id: string) => document.getElementById(id)?.scrollIntoView?.({ block: 'start' })

// A spec folder's documents one after another, each heading an anchor for
// the outline in the left column.
function Documents({ docs, error }: { docs: SpecDocuments | null; error: string | null }) {
  const tabs = documentTabs(docs)
  return (
    <Card>
      <SectionHeading title="Documents" className="mb-2" />
      {error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : !docs ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : !tabs.length ? (
        <p className="mt-2 text-sm text-muted">This folder has no requirements, design or tasks file yet.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-6">
          {tabs.map((tab) => (
            <section key={tab.file} aria-label={tab.label} id={`avoozl-doc-${tab.file}`} style={{ scrollMarginTop: 12 }}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 border-b pb-1" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-base font-semibold">{tab.label}</h3>
                <span className="min-w-0 text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
                  {docs.folder}
                  {tab.file}
                </span>
              </div>
              <Markdown text={tab.text} idPrefix={docPrefix(tab.file)} measure={PROSE_MEASURE} />
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}

// What projecting the approved plan would write to GitHub. Nothing is written.
function GitHubPreview(props: { projection: ProjectionPreview | null; busy: boolean; onPreview: () => void }) {
  const { projection, busy } = props
  return (
    <Card>
      <SectionHeading
        title="GitHub preview"
        blurb="Lists every write a projection would make. Nothing is written."
        actions={
          <TipBtn tooltip="List every GitHub write this plan would make. Makes none." onClick={props.onPreview} disabled={busy}>
            {projection ? 'Preview again' : 'Preview GitHub writes'}
          </TipBtn>
        }
      />
      {projection && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {projection.previewOnly.length > 0 && (
            <p>
              <Badge>preview only</Badge> Another machine writes {projection.previewOnly.join(', ')}.
            </p>
          )}
          {projection.writes.length === 0 ? (
            <p className="text-muted">GitHub already matches this revision.</p>
          ) : (
            writesByRepository(projection.writes).map(([repository, writes]) => (
              <div key={repository}>
                <p className="font-medium">
                  {repository} · {writes.length} writes
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {writes.map((write, index) => (
                    <li key={index}>{describeWrite(write)}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {projection.conflicts.map((conflict) => (
            <p key={`${conflict.taskId}:${conflict.field}`}>
              <Badge variant="danger">conflict</Badge> <code>{conflict.taskId}</code> {conflict.reason}
            </p>
          ))}
          {[...projection.notes, ...(projection.project.problems ?? [])].map((note) => (
            <p key={note} className="text-muted">
              {note}
            </p>
          ))}
          {projection.project.status === 'unavailable' && (
            <p className="text-muted">
              Project fields not previewed: {projection.project.reason} Fix: <code>{projection.project.fix}</code>
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function SpecDetail(props: {
  docs: SpecDocuments | null
  docsError: string | null
  spec: SpecSummary
  plan: SpecPlan | null
  preview: Preview | null
  projection: ProjectionPreview | null
  busy: boolean
  onStore: () => void
  onReload: () => void
  onApprove: () => void
  onProjection: () => void
}) {
  const { spec, plan, preview, busy } = props
  const blocker = approveBlocker(plan)
  const critique = plan?.disk.critique ?? spec.critique
  const diagnostics = plan?.quality.diagnostics ?? []
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <Card>
        <SectionHeading title={plan ? `Revision ${plan.revision}` : 'Not imported'} className="mb-2" />
        <p className="mt-1 text-sm text-muted">
          {spec.folder} · {spec.files.join(', ') || 'no files'}
        </p>
        {plan ? (
          <p className="mt-1 text-sm">
            <code>{shortHash(plan.hash)}</code> · {plan.state}
          </p>
        ) : (
          <p className="mt-1 text-sm">Import stores this folder as a draft plan, so you can check and approve it. It approves nothing and starts nothing.</p>
        )}
        <p className="mt-1 text-xs text-muted">
          Avoozl delivers this spec. Do not use Spec Builder&apos;s Approve tasks or Kiro&apos;s Run all Tasks on it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!plan && (
            <IconLabel icon={Download} tooltip="Store this folder as a draft plan. Approves and starts nothing." onClick={props.onStore} disabled={busy}>
              Import
            </IconLabel>
          )}
          {plan?.disk.changed && (
            <IconLabel icon={RefreshCw} tooltip="Store the changed files as a new revision to approve" onClick={props.onReload} disabled={busy}>
              Reload from disk
            </IconLabel>
          )}
          {plan && (
            <IconLabel icon={ClipboardCheck} onClick={props.onApprove} disabled={busy || blocker !== null} tooltip={blocker ?? "Approve this exact revision. Its ready tasks may then start."}>
              Approve revision {shortHash(plan.hash)}
            </IconLabel>
          )}
        </div>
        {plan && blocker && <p className="mt-2 text-sm text-muted">{blocker}</p>}
      </Card>

      <Documents key={spec.name} docs={props.docs} error={props.docsError} />

      <Card>
        <SectionHeading title="Diagnostics" className="mb-2" />
        {!plan ? (
          <p className="mt-2 text-sm text-muted">
            {spec.counts.error} errors, {spec.counts.warning} warnings in the folder on disk.
          </p>
        ) : diagnostics.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No diagnostics.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {diagnostics.map((d) => (
              <li key={d.id}>
                <Badge variant={d.severity === 'error' ? 'danger' : undefined}>{d.severity}</Badge> <code>{location(d)}</code>{' '}
                {d.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading title="Critique" className="mb-2" />
        {!critique ? (
          <p className="mt-2 text-sm text-muted">No avoozl/critique.md yet.</p>
        ) : (
          <>
            <p className="mt-2 text-sm">
              {critique.current ? 'Reviews this revision.' : `Reviews ${shortHash(critique.reviewedHash)}, not this revision.`}
            </p>
            {critique.findings.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No findings.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {critique.findings.map((f) => (
                  <li key={f.line}>
                    <Badge>{f.kind}</Badge> {f.task && <code>{f.task}</code>} {f.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      {preview && (
        <Card>
          <SectionHeading title="Manifest" className="mb-2" />
          {preview.baseline?.text && <p className="mt-1 text-sm text-muted">{preview.baseline.text}.</p>}
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {preview.tasks.map((task) => {
              const requires = preview.dependencies.filter((edge) => edge.to === task.taskId && edge.kind === 'requires').map((edge) => edge.from)
              return (
                <li key={task.taskId}>
                  <code>{task.taskId}</code> {task.title} <Authority owner={task} />
                  {preview.baseline?.taskIds.includes(task.taskId) && <Badge>done</Badge>}
                  {requires.length > 0 && <span className="text-muted"> · requires {requires.join(', ')}</span>}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {plan?.state === 'approved' && <GitHubPreview projection={props.projection} busy={busy} onPreview={props.onProjection} />}

      {plan && plan.approvals.length > 0 && (
        <Card>
          <SectionHeading title="Approvals" className="mb-2" />
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {plan.approvals.map((approval) => (
              <li key={approval.id}>
                <code>{shortHash(approval.hash)}</code> · {approval.at}
                {approval.approvedBy ? ` · ${approval.approvedBy}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

// A green bar with its percent above it. Theme variables only, so it reads
// in light and dark. The fill grows in when the table opens and is still
// under prefers-reduced-motion.
export function ProgressBar({ tasks }: { tasks: { total: number; done: number } }) {
  const percent = progressPercent(tasks)
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const [shown, setShown] = useState(still ? (percent ?? 0) : 0)
  useEffect(() => {
    if (percent === null) return
    if (still) {
      setShown(percent)
      return
    }
    const frame = requestAnimationFrame(() => setShown(percent))
    return () => cancelAnimationFrame(frame)
  }, [percent, still])
  if (percent === null) return <span className="text-xs text-muted">no tasks</span>
  const fill: CSSProperties = {
    width: `${shown}%`,
    height: '100%',
    borderRadius: 999,
    background: 'linear-gradient(90deg, color-mix(in srgb, var(--ok) 70%, var(--card)), var(--ok))',
    transition: still ? 'none' : 'width 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  }
  return (
    <div style={{ minWidth: 112 }}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold tabular-nums" style={{ color: 'var(--ok-text, var(--ok))' }}>
          {percent}%
        </span>
        <span className="tabular-nums text-muted">
          {tasks.done}/{tasks.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${percent}% of tasks done`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1"
        style={{
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'color-mix(in srgb, var(--border) 75%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)',
        }}
      >
        <div style={fill} />
      </div>
    </div>
  )
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'danger' | undefined> = {
  done: 'success',
  approved: 'info',
  changed: 'warning',
  draft: undefined,
  'not imported': undefined,
}

// Plain labels for the plan statuses plan.table sends.
export const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  approved: 'Approved',
  changed: 'Changed on disk',
  draft: 'Draft',
  'not imported': 'Not imported',
}

function Now({ now }: { now: PlanRow['now'] }) {
  const parts = [
    now.needsYou ? (
      <Badge key="you" variant="warning">
        {now.needsYou} need you
      </Badge>
    ) : null,
    now.running ? (
      <Badge key="run" variant="info">
        {now.running} running
      </Badge>
    ) : null,
    now.ready ? <Badge key="ready">{now.ready} ready</Badge> : null,
  ].filter(Boolean)
  return parts.length ? <span className="inline-flex flex-wrap gap-1">{parts}</span> : <span className="text-xs text-muted">—</span>
}

const cell: CSSProperties = { padding: '8px 10px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }
const head: CSSProperties = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }

// The Plans list's filters: search, category, status, kind and "has", in
// the shared filter panel. The count line sits under them in the same box.
function PlanFilters(props: { filter: PlanListFilter; rows: PlanRow[]; onChange: (filter: PlanListFilter) => void; children?: ReactNode }) {
  const { filter } = props
  const choices = rowChoices(props.rows)
  const set = (change: Partial<PlanListFilter>) => {
    const next: Record<string, unknown> = { ...filter, ...change }
    for (const key of Object.keys(next)) if (!next[key]) delete next[key]
    props.onChange(next as PlanListFilter)
  }
  return (
    <FilterPanel
      id="avoozl-plans"
      label="Filter plans"
      active={Object.keys(filter).length > 0}
      onClear={() => props.onChange({})}
      fields={[
        { kind: 'search', key: 'q', label: 'Search', value: filter.q ?? '', placeholder: 'Plan name or folder', onChange: (q) => set({ q }) },
        {
          kind: 'select',
          key: 'category',
          label: 'Category',
          value: filter.category ?? '',
          options: choices.categories.map((value) => ({ value, label: value })),
          onChange: (category) => set({ category }),
        },
        {
          kind: 'select',
          key: 'status',
          label: 'Status',
          value: filter.status ?? '',
          options: choices.statuses.map((value) => ({ value, label: STATUS_LABEL[value] ?? value })),
          onChange: (status) => set({ status }),
        },
        {
          kind: 'select',
          key: 'kind',
          label: 'Kind',
          value: filter.kind ?? '',
          options: [
            { value: 'spec', label: 'Spec folder' },
            { value: 'old-style', label: 'Old-style plan' },
          ],
          onChange: (kind) => set({ kind: (kind || undefined) as PlanListFilter['kind'] }),
        },
        {
          kind: 'select',
          key: 'has',
          label: 'Has',
          value: filter.has ?? '',
          options: [
            { value: 'ready', label: 'Ready tasks' },
            { value: 'running', label: 'Running tasks' },
            { value: 'needs-you', label: 'Tasks that need you' },
          ],
          onChange: (has) => set({ has: (has || undefined) as PlanListFilter['has'] }),
        },
        { kind: 'check', key: 'archived', label: 'Show archived', checked: Boolean(filter.archived), onChange: (archived) => set({ archived }) },
      ]}
    >
      {props.children}
    </FilterPanel>
  )
}

const ARCHIVE_TIP = 'Archive this plan: its tasks stop starting and it is hidden. You can undo it.'
const UNARCHIVE_TIP = 'Unarchive this plan: its tasks may start again and it shows everywhere.'

// The Plans heading buttons, in the owner's order: New plan, New task, then
// Refresh last. Refresh re-reads plan.table (the spec folders on disk and
// the stored plans); it imports nothing.
export const REFRESH_PLANS_TIP = 'Reload plans from disk. Imports nothing.'
function PlansActions(props: { onNewPlan: () => void; onNewTask: () => void; onRefresh: () => void; busy: boolean }) {
  return (
    <>
      <IconLabel icon={Plus} primary tooltip="Describe a plan idea. Spec Builder drafts its spec folder; nothing is approved." onClick={props.onNewPlan}>
        New plan
      </IconLabel>
      <IconLabel icon={Plus} tooltip="Add a draft task. It waits for your review." onClick={props.onNewTask}>
        New task
      </IconLabel>
      <IconBtn icon={RefreshCw} label="Refresh plans" tooltip={REFRESH_PLANS_TIP} onClick={props.onRefresh} disabled={props.busy} />
    </>
  )
}

// The row's icon buttons, shared by the table and the plan view's header.
function RowButtons(props: {
  row: PlanRow
  onOpen?: () => void
  onScope: (target: PlanTarget) => void
  onReview?: () => void
  onChange?: () => void
  onImport?: () => void
  onDelete?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  busy?: boolean
}) {
  const { row } = props
  const actions = rowActions(row)
  return (
    <span className="flex justify-end gap-1.5">
      {actions.importable && props.onImport && (
        <IconBtn icon={Download} label={`Import ${row.name}`} tooltip="Store this folder as a draft plan. Approves and starts nothing." disabled={props.busy} onClick={props.onImport} />
      )}
      {props.onOpen && <IconBtn icon={DetailsIcon} label={`Open docs for ${row.name}`} tooltip="Open this plan's documents and tasks" onClick={props.onOpen} />}
      {actions.scoped && <IconBtn icon={Network} label={`Graph of ${row.name}`} tooltip="Show this plan's tasks in the Graph" onClick={() => props.onScope('graph')} />}
      {actions.scoped && <IconBtn icon={LayoutGrid} label={`Delivery of ${row.name}`} tooltip="Show this plan's tasks in Delivery" onClick={() => props.onScope('delivery')} />}
      {actions.review && props.onReview && <IconBtn icon={ClipboardCheck} label={`Review ${row.name}`} tooltip="Open this plan to check and approve it" onClick={props.onReview} />}
      {props.onChange && <IconBtn icon={Pencil} label={`Plan a change to ${row.name}`} tooltip="Start a planner chat to change this plan" onClick={props.onChange} />}
      {props.onArchive && actions.archivable && (
        <IconBtn icon={Archive} label={`Archive ${row.name}`} tooltip={ARCHIVE_TIP} disabled={props.busy} onClick={props.onArchive} />
      )}
      {props.onUnarchive && actions.unarchivable && (
        <IconBtn icon={ArchiveRestore} label={`Unarchive ${row.name}`} tooltip={UNARCHIVE_TIP} disabled={props.busy} onClick={props.onUnarchive} />
      )}
      {props.onDelete && actions.deletable && (
        <IconBtn icon={Trash2} label={`Delete ${row.name}`} tooltip="Delete this plan. You confirm first; it stays in history." disabled={props.busy} onClick={props.onDelete} style={dangerStyle} />
      )}
    </span>
  )
}

// The Plans table: one row per plan, grouped by category (Uncategorized
// last) in groups that fold. No pages: a group over PAGE rows shows that
// many and a Show more button. A click on a row or its name opens the
// plan; the buttons do their own thing and never open it as well.
export function PlansTable(props: {
  rows: PlanRow[]
  busy?: boolean
  onOpen: (row: PlanRow) => void
  onScope: (target: PlanTarget, row: PlanRow) => void
  onChange: (row: PlanRow) => void
  onImport: (row: PlanRow) => void
  onDelete?: (row: PlanRow) => void
  onArchive?: (row: PlanRow) => void
  onUnarchive?: (row: PlanRow) => void
  // A filter change: every group starts over at its first page.
  reset?: string
}) {
  const groups = groupByCategory(props.rows)
  const [shut, setShut] = useState<Set<string>>(new Set())
  const pages = usePages(props.reset ?? '')
  const stop = (action: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    action()
  }
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  const header = (
    <thead>
      <tr className="text-xs text-muted">
        <th style={head}>Plan</th>
        <th style={head}>Status</th>
        <th style={head}>Progress</th>
        <th style={head}>Now</th>
        <th style={{ ...head, textAlign: 'right' }}>Epics</th>
        <th style={head}>Last change</th>
        <th style={head}>
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  )
  // Each category is its own boxed section with its own table; its heading
  // carries the name, an icon, the plan count and the category's progress.
  return (
    <div className="flex flex-col gap-4" data-plan-groups>
      {groups.map((group) => {
        const open = !shut.has(group.category)
        const shown = pages.take(group.category, group.rows)
        const tasks = group.rows.reduce((sum, row) => ({ total: sum.total + row.tasks.total, done: sum.done + row.tasks.done }), { total: 0, done: 0 })
        const id = `avoozl-plan-group-${group.category.replace(/[^\w-]/g, '-')}`
        return (
          <section
            key={group.category}
            aria-labelledby={id}
            data-plan-group={group.category}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <h2 id={id} className="m-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setShut(toggle(shut, group.category))}
                className="flex w-full flex-wrap items-center gap-2 text-left text-lg font-semibold"
              >
                <span aria-hidden="true" style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
                  <ChevronRight size={16} />
                </span>
                <FolderOpen size={18} aria-hidden="true" style={{ color: 'var(--muted)' }} />
                <span>{group.category}</span>
                <span className="text-sm font-normal text-muted">
                  {group.rows.length} {group.rows.length === 1 ? 'plan' : 'plans'}
                </span>
                <span className="ml-auto text-sm font-normal" style={{ width: 'min(14rem, 40%)', minWidth: 120 }}>
                  <ProgressBar tasks={tasks} />
                </span>
              </button>
            </h2>
            {open && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm" style={{ color: 'var(--text)' }}>
                  {header}
                  <tbody>
                    {shown.map((row) => (
                      <tr key={row.key} data-plan-row={row.key} onClick={() => props.onOpen(row)} className="hover:bg-accent/10" style={{ cursor: 'pointer' }}>
                        <td style={cell}>
                          <button type="button" className="text-left font-medium hover:underline" onClick={stop(() => props.onOpen(row))}>
                            {row.name}
                          </button>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                            <Badge>{row.kind === 'spec' ? (row.type ?? 'spec') : 'old-style'}</Badge>
                            {row.spec ? <code>{row.spec}</code> : row.planId ? <code>{row.planId}</code> : null}
                            {row.errors > 0 && <Badge variant="danger">{row.errors} errors</Badge>}
                            {row.archived && <Badge>Archived</Badge>}
                          </span>
                        </td>
                        <td style={cell} className="whitespace-nowrap">
                          <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                        </td>
                        <td style={{ ...cell, width: 150 }}>
                          <ProgressBar tasks={row.tasks} />
                        </td>
                        <td style={cell}>
                          <Now now={row.now} />
                        </td>
                        <td style={{ ...cell, textAlign: 'right' }} className="tabular-nums">
                          {row.epics}
                        </td>
                        <td style={cell} className="whitespace-nowrap text-xs text-muted">
                          <Tooltip text={row.lastChange}>
                            <span>{row.lastChange ? relativeTime(row.lastChange) : '—'}</span>
                          </Tooltip>
                        </td>
                        <td style={cell} className="whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                          <RowButtons
                            row={row}
                            busy={props.busy}
                            onOpen={() => props.onOpen(row)}
                            onScope={(target) => props.onScope(target, row)}
                            onReview={() => props.onOpen(row)}
                            onChange={() => props.onChange(row)}
                            onImport={() => props.onImport(row)}
                            onDelete={props.onDelete ? () => props.onDelete!(row) : undefined}
                            onArchive={props.onArchive ? () => props.onArchive!(row) : undefined}
                            onUnarchive={props.onUnarchive ? () => props.onUnarchive!(row) : undefined}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {group.rows.length > shown.length && <ShowMore {...pages.more(group.category, group.rows.length)} />}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// The plan view's left column: what you act with and what the plan holds.
function PlanAside(props: {
  row: PlanRow
  graph: Graph | null
  docs: SpecDocuments | null
  onEdit: () => void
  onDiscuss: () => void
  onDelete?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDrill: (drill: Drill) => void
  onOpenTask: (id: string) => void
}) {
  const { row, graph, docs } = props
  const leaves = (graph?.tasks ?? []).filter((t) => t.kind === 'leaf')
  const counts = Object.fromEntries(STATES.map((s) => [s.id, 0])) as Record<NodeState, number>
  for (const task of leaves) counts[nodeState(task)] += 1
  const epicTitles = new Map((graph?.epics ?? []).map((e) => [e.id, e.title]))
  const epics = new Map<string, { title: string; done: number; total: number }>()
  for (const task of leaves) {
    if (!task.epic) continue
    const title = epicTitles.get(task.epic)
    const entry = epics.get(task.epic) ?? { title: title && title !== task.epic ? title : documentEpic(task.epic), done: 0, total: 0 }
    entry.total += 1
    if (nodeState(task) === 'done') entry.done += 1
    epics.set(task.epic, entry)
  }
  const decisions = (graph?.tasks ?? []).filter((t) => t.decision)
  const tabs = documentTabs(docs)
  const heading = (text: string) => <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{text}</h4>
  return (
    <div className="flex flex-col gap-4 text-sm" data-plan-aside>
      <div className="flex flex-wrap gap-2">
        <IconLabel icon={Pencil} primary tooltip="Start a planner chat that drafts a change to the spec files" onClick={props.onEdit}>
          Edit plan
        </IconLabel>
        <IconLabel icon={MessagesSquare} tooltip="Start a chat about this plan. It makes no edits." onClick={props.onDiscuss}>
          Discuss plan
        </IconLabel>
        {(props.onDelete || props.onArchive || props.onUnarchive) && (
          <span className="ml-auto flex gap-1.5">
            {props.onArchive && <IconBtn icon={Archive} label={`Archive ${row.name}`} tooltip={ARCHIVE_TIP} onClick={props.onArchive} />}
            {props.onUnarchive && <IconBtn icon={ArchiveRestore} label={`Unarchive ${row.name}`} tooltip={UNARCHIVE_TIP} onClick={props.onUnarchive} />}
            {props.onDelete && (
              <IconBtn icon={Trash2} label={`Delete ${row.name}`} tooltip="Delete this plan. You confirm first; it stays in history." onClick={props.onDelete} style={dangerStyle} />
            )}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
          {row.type && <Badge>{row.type}</Badge>}
          {row.archived && <Badge>Archived</Badge>}
        </span>
        <ProgressBar tasks={row.tasks} />
      </div>
      <div>
        {heading('Category')}
        <p className="mt-1">{row.category ?? <span className="text-muted">None in its front-matter</span>}</p>
      </div>
      <div>
        {heading('Tasks by state')}
        <dl className="mt-1 grid gap-x-3 gap-y-0.5" style={{ gridTemplateColumns: '1fr auto' }}>
          {STATES.map((state) => (
            <div key={state.id} className="contents">
              <dt className="text-muted">{state.label}</dt>
              <dd className="text-right tabular-nums">{graph ? counts[state.id] : '…'}</dd>
            </div>
          ))}
        </dl>
      </div>
      {epics.size > 0 && (
        <div>
          {heading('Epics')}
          <ul className="mt-1 flex flex-col gap-1">
            {[...epics].map(([id, epic]) => {
              const percent = epic.total ? Math.round((epic.done / epic.total) * 100) : 0
              return (
                <li key={id}>
                  <Tooltip text={`Show only ${epic.title} in the Graph`} display="block">
                  <button
                    type="button"
                    className="w-full rounded px-1 py-0.5 text-left hover:bg-accent/10"
                    onClick={() => props.onDrill({ kind: 'epic', id, title: epic.title })}
                  >
                    <span className="flex justify-between gap-2">
                      <span className="truncate">{epic.title}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {epic.done}/{epic.total}
                      </span>
                    </span>
                    <span className="mt-0.5 block h-1 overflow-hidden rounded" style={{ background: 'var(--border)' }}>
                      <span className="block h-full" style={{ width: `${percent}%`, background: 'var(--ok)' }} />
                    </span>
                  </button>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {tabs.length > 0 && (
        <nav aria-label="Plan outline">
          {heading('Outline')}
          <ul className="mt-1 flex flex-col gap-1">
            {tabs.map((tab) => (
              <li key={tab.file}>
                <button type="button" className="font-medium hover:underline" onClick={() => jump(`avoozl-doc-${tab.file}`)}>
                  {tab.label}
                </button>
                <ul className="flex flex-col">
                  {outline(tab.text, docPrefix(tab.file), 2)
                    .filter((h) => h.level === 2)
                    .map((h) => (
                      <li key={h.id} className="truncate pl-3">
                        <button type="button" className="text-left text-xs text-muted hover:underline" onClick={() => jump(h.id)}>
                          {h.text}
                        </button>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div>
        {heading('Last change')}
        <p className="mt-1">
          <Tooltip text={row.lastChange}>
            <span>{row.lastChange ? relativeTime(row.lastChange) : <span className="text-muted">Unknown</span>}</span>
          </Tooltip>
        </p>
      </div>
      {(row.timeline ?? []).length > 0 && (
        <div data-plan-timeline>
          {heading('Timeline')}
          <ol className="mt-1 flex flex-col gap-0.5">
            {row.timeline!.map((entry, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{planEventLine(entry)}</span>
                <Tooltip text={entry.at}>
                  <span className="shrink-0 text-xs text-muted">{relativeTime(entry.at)}</span>
                </Tooltip>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div>
        {heading(`Open decisions (${decisions.length})`)}
        {decisions.length === 0 ? (
          <p className="mt-1 text-muted">None.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {decisions.map((task) => (
              <li key={task.id}>
                <button type="button" className="text-left underline" onClick={() => props.onOpenTask(task.id)}>
                  {task.title}
                </button>
                <span className="block text-xs text-muted">{task.decision}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}


// Archive plan: a plain confirm, not red, because Unarchive undoes it.
function ArchivePlanDialog(props: { workspaceId: string; row: PlanRow; client: PlansClient; onDone: (text: string | null) => void }) {
  const { row, client, workspaceId } = props
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  useBackStep('modal', true, 'Cancel', () => props.onDone(null))
  useEffect(() => {
    cancel.current?.focus()
  }, [])
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const done = await client.archive(workspaceId, row.planId!)
      props.onDone(
        `Archived ${row.name}. ${done.held} tasks held, ${done.running} running chats left alone, ${done.decisions} decisions opened. Show archived on Plans brings it back.`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0" style={{ zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div aria-hidden="true" className="absolute inset-0" onClick={() => props.onDone(null)} style={{ background: 'color-mix(in srgb, var(--text) 30%, transparent)' }} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="avoozl-archive-plan-title"
        data-archive-plan
        className="relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg"
        style={{ width: 'min(32rem, 94vw)', background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)' }}
      >
        <h3 id="avoozl-archive-plan-title" className="text-base font-semibold">
          Archive the plan {row.name}?
        </h3>
        <ul className="flex flex-col gap-1 pl-5 text-sm" style={{ listStyle: 'disc' }}>
          {ARCHIVE_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn ref={cancel} type="button" onClick={() => props.onDone(null)}>
            Cancel
          </Btn>
          <Btn type="button" primary data-archive-confirm disabled={busy} onClick={() => void run()}>
            Archive plan
          </Btn>
        </div>
      </div>
    </div>
  )
}

// The banner an archived plan's page shows, with its Unarchive button.
function ArchivedBanner(props: { row: PlanRow; busy: boolean; onUnarchive: () => void }) {
  const { archived } = props.row
  if (!archived) return null
  return (
    <div
      role="status"
      data-archived-banner
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--muted) 10%, var(--card, transparent))' }}
    >
      <Archive size={18} aria-hidden="true" style={{ color: 'var(--muted)' }} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">This plan is archived.</span>{' '}
        <span className="text-muted">
          {archived.by ? `${archived.by} archived it` : 'Archived'} <Tooltip text={archived.at}><span>{relativeTime(archived.at)}</span></Tooltip>. Its tasks
          do not start, and it is hidden unless Show archived is on.
        </span>
      </span>
      <IconLabel icon={ArchiveRestore} primary disabled={props.busy} tooltip={UNARCHIVE_TIP} onClick={props.onUnarchive}>
        Unarchive
      </IconLabel>
    </div>
  )
}

// Delete plan: the confirm names the plan, counts its tasks and says what
// happens to each. The spec folder checkbox is off by default and removes
// the folder from the working tree only, never committing or pushing.
function DeletePlanDialog(props: { workspaceId: string; row: PlanRow; client: PlansClient; onDone: (text: string | null) => void }) {
  const { row, client, workspaceId } = props
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [folder, setFolder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    client.deletePreview(workspaceId, row.planId!).then(setPreview, (caught) => setError(errorMessage(caught)))
  }, [client, workspaceId, row.planId])
  useBackStep('modal', true, 'Cancel', () => props.onDone(null))
  useEffect(() => {
    cancel.current?.focus()
  }, [])
  const run = async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const done = await client.remove(workspaceId, preview.id, { retire: preview.retire, deleteSpecFolder: folder })
      props.onDone(
        `Deleted ${preview.title}. ${done.retired ? `Archived ${done.archived}, ${done.archiveWhenEnded} when their chats end, ${done.decisions} decisions opened. ` : ''}${
          done.removedFolder ? `Removed ${done.removedFolder} from the working tree; nothing was committed.` : ''
        }`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const blocked = Boolean(folder && preview?.folder?.dirty)
  return (
    <div className="fixed inset-0" style={{ zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div aria-hidden="true" className="absolute inset-0" onClick={() => props.onDone(null)} style={{ background: 'color-mix(in srgb, var(--text) 30%, transparent)' }} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="avoozl-delete-plan-title"
        data-delete-plan={preview?.retire ? 'retire' : 'draft'}
        className="relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg"
        style={{ width: 'min(32rem, 94vw)', background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)' }}
      >
        <h3 id="avoozl-delete-plan-title" className="text-base font-semibold">
          Delete the plan {preview?.title ?? row.name}?
        </h3>
        {!preview && !error && <p className="text-sm text-muted">Counting its tasks…</p>}
        {preview && (
          <ul className="flex flex-col gap-1 pl-5 text-sm" style={{ listStyle: 'disc' }}>
            {deleteLines(preview).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {preview?.folder?.exists && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={folder} onChange={(event) => setFolder(event.target.checked)} />
              Also delete the spec folder (.kiro/specs/{preview.spec}/) from the repo.
            </span>
            <code className="pl-6 text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>{preview.folder.path}</code>
            <span className="pl-6 text-xs text-muted">Only the working tree. Avoozl never commits or pushes this.</span>
            {folder && preview.folder.dirty && <span role="alert" className="pl-6 text-xs text-danger">{preview.folder.reason}</span>}
          </label>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn ref={cancel} type="button" onClick={() => props.onDone(null)}>
            Cancel
          </Btn>
          <Btn type="button" data-danger disabled={!preview || busy || blocked} onClick={() => void run()} style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}>
            Delete plan
          </Btn>
        </div>
      </div>
    </div>
  )
}

export default function PlansView(props: {
  workspaceId: string | null
  onScope?: (target: PlanTarget, filter: TaskFilter) => void
  onDrill?: (drill: Drill) => void
  // Bumped by the header's Plan a goal: open the New plan drawer.
  newPlanRequest?: number
}) {
  const workspace = props.workspaceId
  const api = useAppApi()
  const { openChat } = useChatLauncher()
  const plans = useMemo(() => plansClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])
  const drawer = useTaskDrawer()
  const chat = useAskChat(workspace)
  const stack = useMedia(STACK)
  const [asideRef, asideHeight] = useStickyHeight(!stack)
  const [deleting, setDeleting] = useState<PlanRow | null>(null)
  const [archiving, setArchiving] = useState<PlanRow | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (props.newPlanRequest) setCreating(true)
  }, [props.newPlanRequest])
  const [notice, setNotice] = useState<string | null>(null)
  const [table, setTable] = useState<PlanTable | null>(null)
  // Opening a plan is a Back step; Back from another tab reopens it.
  const [selected, openPlan, setSelected] = useSteppedState<string | null>(
    'plans-selected',
    'select',
    (previous) => (previous ? 'Back to the plan' : 'Back to all plans'),
    null,
  )
  const shownWorkspace = useRef(workspace)
  const [filter, setFilter] = useState<PlanListFilter>({})
  const [plan, setPlan] = useState<SpecPlan | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [projection, setProjection] = useState<ProjectionPreview | null>(null)
  const [docs, setDocs] = useState<SpecDocuments | null>(null)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [planGraph, setPlanGraph] = useState<Graph | null>(null)
  const [text, setText] = useState<{ text: string | null; error: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped once the workspace's extra grammars load, so code redraws.
  const [, setGrammars] = useState(0)
  const detailTop = useRef<HTMLDivElement>(null)

  const attempt = useCallback(async (call: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await call()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  const load = useCallback((workspaceId: string) => attempt(async () => setTable(await plans.table(workspaceId))), [attempt, plans])
  useEffect(() => {
    setTable(null)
    if (shownWorkspace.current !== workspace) {
      shownWorkspace.current = workspace
      setSelected(null)
    }
    if (!workspace) return
    void load(workspace)
    plans.languages(workspace).then(
      (result) => {
        registerLanguages(result.languages)
        setGrammars((n) => n + 1)
      },
      () => undefined,
    )
  }, [workspace, load, plans])

  const row = table?.items.find((item) => item.key === selected) ?? null
  const spec: SpecSummary | null = row?.spec ? (table?.specs.find((item) => item.name === row.spec) ?? null) : null

  // The opened row's stored plan, preview, documents and tasks. Opening is
  // immediate: the row's own data is already here, and these fill in.
  const loadPlan = useCallback(
    async (workspaceId: string, planId: string | null) => {
      setPlan(null)
      setPreview(null)
      setProjection(null)
      if (!planId) return
      const [stored, shown] = await Promise.all([plans.get(workspaceId, planId), plans.preview(workspaceId, planId).catch(() => null)])
      setPlan(stored)
      setPreview(shown)
    },
    [plans],
  )
  useEffect(() => {
    setDocs(null)
    setDocsError(null)
    setText(null)
    setPlanGraph(null)
    if (!workspace || !row) return
    let live = true
    void attempt(() => loadPlan(workspace, row.planId))
    views.graph(workspace, { plan: row.planId ?? undefined, spec: row.spec ?? undefined }).then(
      (value) => live && setPlanGraph(value),
      () => undefined,
    )
    if (row.spec)
      plans.documents(workspace, row.spec).then(
        (value) => live && setDocs(value),
        (caught: unknown) => live && setDocsError(errorMessage(caught)),
      )
    else if (row.planId)
      plans.text(workspace, row.planId).then(
        (value) => live && setText({ text: value, error: null }),
        (caught: unknown) => live && setText({ text: null, error: errorMessage(caught) }),
      )
    return () => {
      live = false
    }
    // Reload only when another row opens, not when the table refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, selected])

  // Bring the opened plan into view: the page scrolls, and a long table
  // would otherwise leave the detail out of sight.
  useEffect(() => {
    if (selected) detailTop.current?.scrollIntoView?.({ block: 'start' })
  }, [selected])

  const open = (next: PlanRow) => openPlan(next.key)
  const scope = (target: PlanTarget, next: PlanRow) => props.onScope?.(target, { plan: rowPlanKey(next) })
  // Edit plan: a planner chat drafts the change to the spec files; adding a
  // task goes the same way, and comes back as a revision to approve.
  const change = (next: PlanRow) => openChat({ message: changeMessage(next), autoSend: false })
  const act = (call: (workspaceId: string) => Promise<unknown>) => {
    if (!workspace) return
    const workspaceId = workspace
    void attempt(async () => {
      const result = (await call(workspaceId)) as { id?: string } | null
      const next = await plans.table(workspaceId)
      setTable(next)
      const current = next.items.find((item) => item.key === selected) ?? null
      await loadPlan(workspaceId, current?.planId ?? result?.id ?? null)
    })
  }
  const importRow = (next: PlanRow) => next.spec && act((workspaceId) => plans.store(workspaceId, next.spec!))
  // Unarchive needs no confirm: it only undoes an archive.
  const unarchive = (next: PlanRow) =>
    next.planId &&
    act(async (workspaceId) => {
      const done = await plans.unarchive(workspaceId, next.planId!)
      setNotice(`Unarchived ${next.name}. ${done.released} tasks may start again; ${done.decisions} decisions closed.`)
      return { id: next.planId! }
    })
  const rows = table ? filterRows(table.items, filter) : []

  return (
    <section aria-labelledby="avoozl-plans-title" className="flex flex-col gap-3.5">
      {deleting && workspace && (
        <DeletePlanDialog
          workspaceId={workspace}
          row={deleting}
          client={plans}
          onDone={(text) => {
            setDeleting(null)
            if (text === null) return
            setSelected(null)
            setNotice(text)
            void load(workspace)
          }}
        />
      )}
      {archiving && workspace && (
        <ArchivePlanDialog
          workspaceId={workspace}
          row={archiving}
          client={plans}
          onDone={(text) => {
            setArchiving(null)
            if (text === null) return
            setNotice(text)
            void load(workspace)
          }}
        />
      )}
      {creating && workspace && (
        <NewPlanDrawer
          workspaceId={workspace}
          taken={(table?.items ?? []).flatMap((item) => [item.spec, item.planId]).filter((name): name is string => Boolean(name))}
          categories={[...new Set((table?.items ?? []).map((item) => item.category).filter((name): name is string => Boolean(name)))].sort()}
          onClose={(text) => {
            setCreating(false)
            if (text) setNotice(text)
          }}
        />
      )}
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
      <div ref={detailTop} className="flex flex-wrap items-center gap-3">
        {row && <IconLabel icon={ArrowLeft} onClick={() => openPlan(null)}>All plans</IconLabel>}
        <div className="min-w-0 flex-1">
          <ViewHeading
            id="avoozl-plans-title"
            view="plans"
            actions={
              workspace && !row ? (
                <PlansActions onNewPlan={() => setCreating(true)} onNewTask={() => drawer.addTask()} onRefresh={() => void load(workspace)} busy={busy} />
              ) : row ? (
                <RowButtons row={row} onScope={(target) => scope(target, row)} onReview={() => jump('avoozl-plan-main')} />
              ) : null
            }
          >
            {row ? row.name : 'Plans'}
          </ViewHeading>
        </div>
      </div>
      {(error || chat.error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? chat.error}
        </p>
      )}
      <p role="status" className="sr-only">
        {busy ? 'Working…' : ''}
      </p>

      {!workspace ? (
        <p className="text-sm text-muted">Choose a workspace in the header.</p>
      ) : !row ? (
        <>
          {table && table.items.length > 0 && (
            <PlanFilters filter={filter} rows={table.items} onChange={setFilter}>
              <p className="text-xs text-muted" role="status">
                {rows.length} of {table.items.length} plans
              </p>
            </PlanFilters>
          )}
          <div className="flex flex-col gap-2" data-plans-list>
            {table === null ? (
              <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
            ) : table.items.length === 0 ? (
              <p className="text-sm text-muted">
                No plans yet{table.root ? ` in ${table.root}/.kiro/specs` : ''}. Use New plan to start one.
              </p>
            ) : rows.length ? (
              <PlansTable rows={rows} reset={JSON.stringify(filter)} busy={busy} onOpen={open} onScope={scope} onChange={change} onImport={importRow} onDelete={setDeleting} onArchive={setArchiving} onUnarchive={unarchive} />
            ) : (
              <p className="text-sm text-muted">No plan matches these filters.</p>
            )}
            {table?.problem && <p className="mt-2 text-xs text-muted">Spec folders: {table.problem}</p>}
            <p className="mt-2 text-xs text-muted">
              Categories come from <code>category:</code> in the front-matter of a spec&apos;s requirements.md or bugfix.md. Avoozl
              never guesses one. {UNCATEGORIZED} holds the rest.
            </p>
          </div>
        </>
      ) : (
        <div
          style={
            stack
              ? { display: 'flex', flexDirection: 'column', gap: 14 }
              : { display: 'grid', gridTemplateColumns: `${ASIDE_WIDTH} minmax(0, 1fr)`, gap: 14, alignItems: 'start' }
          }
        >
          <aside
            ref={asideRef}
            aria-label="Plan summary"
            data-plan-aside-scroll
            style={stack ? undefined : { position: 'sticky', top: 8, maxHeight: asideHeight ?? 'calc(100vh - 2rem)', overflowY: 'auto', overscrollBehavior: 'contain' }}
          >
            <Card>
              <PlanAside
                row={row}
                graph={planGraph}
                docs={docs}
                onEdit={() => change(row)}
                onDiscuss={() => void chat.ask(discussSeed(row))}
                onDelete={rowActions(row).deletable ? () => setDeleting(row) : undefined}
                onArchive={rowActions(row).archivable ? () => setArchiving(row) : undefined}
                onUnarchive={rowActions(row).unarchivable ? () => unarchive(row) : undefined}
                onDrill={(drill) => props.onDrill?.(drill)}
                onOpenTask={(id) => drawer.openTask(id)}
              />
            </Card>
          </aside>
          <div id="avoozl-plan-main" className="min-w-0">
            <ArchivedBanner row={row} busy={busy} onUnarchive={() => unarchive(row)} />
            {row.categoryProblem && (
              <p className="mb-3 text-sm text-muted">
                <Badge variant="warning">front-matter</Badge> {row.categoryProblem}
              </p>
            )}
            {spec ? (
              <SpecDetail
                docs={docs}
                docsError={docsError}
                spec={spec}
                plan={plan}
                preview={preview}
                projection={projection}
                busy={busy}
                onStore={() => act((workspaceId) => plans.store(workspaceId, spec.name))}
                onReload={() => plan && act((workspaceId) => plans.reload(workspaceId, plan.id, plan.hash))}
                onApprove={() => plan && act((workspaceId) => plans.approve(workspaceId, plan.id, plan.hash))}
                onProjection={() => plan && void attempt(async () => setProjection(await plans.projection(workspace, plan.id)))}
              />
            ) : (
              <Card>
                <SectionHeading title={row.name} className="mb-2" />
                <p className="mt-1 text-xs text-muted">
                  <code>{row.planId}</code> · written before the spec layout, so it has no folder. Its tasks show in Graph and Delivery.
                </p>
                <div className="mt-2">
                  {!text ? (
                    <p className="text-sm text-muted">Loading…</p>
                  ) : text.error ? (
                    <p className="text-sm text-danger">{text.error}</p>
                  ) : text.text ? (
                    <Markdown text={text.text} measure={PROSE_MEASURE} />
                  ) : (
                    <p className="text-sm text-muted">This plan has no text.</p>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
