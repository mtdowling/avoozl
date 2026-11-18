import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { useAppApi, useChatLauncher, useNavigate } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge from './ui/Badge.tsx'
import { Markdown } from './Markdown.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { errorMessage } from './workspace-api'
import { relativeTime } from './task-api.ts'
import { Authority } from './Authority.tsx'
import NewPlanDrawer from './NewPlanDrawer.tsx'
import type { NewPlanForm } from './new-plan-api.ts'
import { DriverBanner, DriverChip, HandOffButton, SetupList, useDriver } from './Driver.tsx'
import type { DriverSpec } from './driver-api.ts'
import { COMPACT_BTN, IconBtn, IconLabel, SectionHeading, ShowMore, SmallBtn, TipBtn, ViewHeading, dangerStyle, useAskChat, usePages } from './ui/controls.tsx'
import { Archive, ArchiveRestore, ArrowUpDown, CaseSensitive, Clock, Layers, ListChecks, ListFilter, Tag, X, ClipboardCheck, DetailsIcon, Download, ExternalLink, FileText, FolderOpen, MessagesSquare, Network, Pencil, Plus, RefreshCw, Trash2, type LucideIcon } from './icons.ts'
import { MoreMenu } from './MoreMenu.tsx'
import { useReveal } from './RepositoriesSettings.tsx'
import { openSpecBuilder } from './spec-builder-api.ts'
import { settingsClient } from './settings-api.ts'
import { githubHref } from './repository-rows.ts'
import { RailBlock, RailChips, RailDivider, RailRow, RailSortList, RailStyle, type RailSort } from './NavRail.tsx'
import { NavSlotFor } from './nav-slot.tsx'
import { STATES, nodeState, type Drill, type NodeState } from './graph-layout.ts'
import { rowPlanKey, type TaskFilter } from './filters.ts'
import { outline } from './markdown.ts'
import { registerLanguages } from './highlight.ts'
import { linkHref, safeHref, viewsClient, type Graph } from './views-api.ts'
import { useSteppedState } from './NavHistory.tsx'
import { usePhone } from './list-detail.ts'
import { ListDetailLayout } from './ListDetailLayout.tsx'
import { usePaneKeys } from './pane-keys.ts'
import { useDetailTitleRef } from './ListDetail.tsx'
import { useTitleScrolledOut } from './use-title-scrolled-out.ts'
import { Modal } from './ui/Modal.tsx'
import { Button } from './ui/Button.tsx'
import { PlanReviewSummary, REVIEW_POLL_MS, ReviewWorking, RevisionChanged } from './PlanReviewSummary.tsx'
import { SpecGraph } from './SpecGraph.tsx'
import { DocTabs, ReviewView } from './ReviewView.tsx'
import { parseReviewLink, parseSpecTab, renderText, reviewClient, reviewHref, reviewLink, specTabLink, type ReviewPlace } from './review-view.ts'
import { SeverityBadges } from './SeverityBadges.tsx'
import { urlBase } from './focus-tree.ts'
import { DiffBlock } from './FlowMemory.tsx'
import { ProjectionModal } from './ProjectionModal.tsx'
import { SpecChangedModal } from './SpecChangedModal.tsx'
import { SpecPullBox } from './SpecPullBox.tsx'
import { specPullClient, type SpecPull } from './spec-pr-api.ts'
import { projectionClient } from './projection-api.ts'
import {
  UNCATEGORIZED,
  approveBlocker,
  checkDot,
  scmLinkText,
  type SpecLinks,
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
  batchNumbers,
  missingOwners,
  type ApprovalBatches,
  type ApproveManyResult,
  type BatchEntry,
  type BatchSelection,
  progressPercent,
  homeBadge,
  specChip,
  SPEC_CHIP_LABEL,
  type SpecChip,
  rowActions,
  rowChoices,
  shortHash,
  baseRevision,
  revisionChange,
  revisionDiff,
  type PlanReviewSummary as ReviewSummary,
  type RevisionChange,
  writesByRepository,
  type PlanListFilter,
  SORT_FIRST,
  sortRows,
  type SpecSort,
  type PlanRow,
  type PlanTable,
  type Preview,
  type ProjectionPreview,
  type SpecDocuments,
  type SpecPlan,
  type SpecSummary,
} from './plans-api'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { Checkbox } from './ui/Checkbox'

// Where a row's Graph button goes; the filter is the tabs'
// shared one, set to this plan.
export type PlanTarget = 'graph'

// Plan prose stays at a readable line length (about 80 characters); tables
// and code blocks may use the column's full width.
export const PROSE_MEASURE = '80ch'

const docPrefix = (file: string) => `avoozl-doc-${file.replace(/\.md$/, '')}`
const jump = (id: string) => document.getElementById(id)?.scrollIntoView?.({ block: 'start' })

// Issue Radar's issue view, measured on its own page: a bordered card with
// 12px corners whose title row is small caps (11px, uppercase) on a light
// band over a divider, and a right rail of labeled sections split by
// dividers, 12.5px text, 236px wide.
export function SpecCard(props: { title: string; id?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={props.title} id={props.id} data-spec-card={props.title} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card, var(--bg))', overflow: 'hidden', scrollMarginTop: 12, minWidth: 0 }}>
      <div data-spec-card-head style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 34, boxSizing: 'border-box', padding: '6px 14px', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)' }}>
        <h3 style={{ margin: 0, flex: '1 1 auto', fontSize: 11, fontWeight: 500, lineHeight: '17px', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>{props.title}</h3>
        {props.actions}
      </div>
      <div data-spec-card-body style={{ padding: '12px 14px', minWidth: 0 }}>
        {props.children}
      </div>
    </section>
  )
}

const RAIL_CSS = `[data-spec-rail]>[data-rail-section]:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}
[data-rail-edit]{font-size:11.5px;color:var(--accent);background:none;border:0;padding:0;cursor:pointer}
[data-rail-edit]:hover{text-decoration:underline}
[data-rail-edit]:focus-visible,[data-spec-menu-item]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[data-spec-menu-item]{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--text);font-size:13px;text-align:left;cursor:pointer;text-decoration:none;white-space:nowrap}
[data-spec-menu-item]:hover{background:var(--bg-hover)}
[data-spec-menu-item][aria-disabled=true]{color:var(--muted);cursor:default;background:none}
[data-spec-menu-item][data-danger]{color:var(--danger)}`

function RailSection(props: { title: string; edit?: { label: string; onClick: () => void }; children: ReactNode; attrs?: Record<string, string> }) {
  return (
    <section data-rail-section={props.title} {...props.attrs} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 11, fontWeight: 500, lineHeight: '17px', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>{props.title}</h4>
        {props.edit && (
          <Tooltip text="Edit">
            <button type="button" data-rail-edit aria-label={props.edit.label} onClick={props.edit.onClick} style={{ display: 'inline-flex', padding: 2 }}>
              <Pencil size={13} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {props.children}
    </section>
  )
}

// One item in the spec's ... menu: an icon and its words, 28px tall.
function MenuItem(props: { icon: LucideIcon; label: string; tooltip?: string; onClick?: () => void; link?: string | null; disabled?: boolean; danger?: boolean }) {
  const Icon = props.icon
  const body = (
    <>
      <Icon size={14} aria-hidden="true" />
      {props.label}
    </>
  )
  const item =
    props.link !== undefined ? (
      linkHref(props.link) && !props.disabled ? (
        <a data-spec-menu-item href={linkHref(props.link)} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <button type="button" data-spec-menu-item aria-disabled="true">
          {body}
        </button>
      )
    ) : (
      <button type="button" data-spec-menu-item data-danger={props.danger ? '' : undefined} aria-disabled={props.disabled ? 'true' : undefined} onClick={props.disabled ? undefined : props.onClick}>
        {body}
      </button>
    )
  return props.tooltip ? <Tooltip text={props.tooltip} display="block">{item}</Tooltip> : item
}

// The state pill: Draft, Approved, Done and the rest, in theme colors.
const PILL: Record<string, { color: string; background: string }> = {
  approved: { color: 'var(--accent)', background: 'var(--accent-subtle, color-mix(in srgb, var(--accent) 12%, transparent))' },
  done: { color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 14%, transparent)' },
  changed: { color: 'var(--warning, #b7791f)', background: 'color-mix(in srgb, var(--warning, #b7791f) 14%, transparent)' },
}
function StatePill(props: { status: string; archived?: boolean }) {
  const look = PILL[props.status] ?? { color: 'var(--muted)', background: 'var(--bg-hover)' }
  return (
    <span data-spec-state={props.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500, lineHeight: '18.6px', ...look }}>
      {props.archived ? 'Archived' : (STATUS_LABEL[props.status] ?? props.status)}
    </span>
  )
}

// A spec folder's documents one after another, each heading an anchor for
// the outline in the left column.
function Documents({ docs, error }: { docs: SpecDocuments | null; error: string | null }) {
  const tabs = documentTabs(docs)
  if (error)
    return (
      <SpecCard title="Documents">
        <ErrorText size="sm">{error}</ErrorText>
      </SpecCard>
    )
  if (!docs)
    return (
      <SpecCard title="Documents">
        <Hint as="p" size="sm">Loading…</Hint>
      </SpecCard>
    )
  if (!tabs.length)
    return (
      <SpecCard title="Documents">
        <Hint as="p" size="sm">This folder has no requirements, design or tasks file yet.</Hint>
      </SpecCard>
    )
  return (
    <>
      {tabs.map((tab) => (
        <SpecCard
          key={tab.file}
          title={tab.label}
          id={`avoozl-doc-${tab.file}`}
          actions={
            <span className="min-w-0 text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
              {docs.folder}
              {tab.file}
            </span>
          }
        >
          <Markdown text={tab.text} idPrefix={docPrefix(tab.file)} measure={PROSE_MEASURE} />
        </SpecCard>
      ))}
    </>
  )
}

// The spec's details in one compact bordered box on the Overview: the rail's
// small labeled sections as a label/value grid, scrolling inside the box.
const DETAILS_CSS = `[data-spec-details-box] [data-spec-rail]{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));column-gap:20px;row-gap:14px;align-items:start}
[data-spec-details-box] [data-rail-section]{border-bottom:0!important;margin-bottom:0!important;padding-bottom:0!important;min-width:0}`
function SpecDetailsBox({ children }: { children: ReactNode }) {
  return (
    <SpecCard title="Spec details" id="avoozl-spec-details">
      <style>{DETAILS_CSS}</style>
      <div data-spec-details-box tabIndex={0} style={{ maxHeight: 260, overflowY: 'auto', overscrollBehavior: 'contain', fontSize: 12.5 }}>
        {children}
      </div>
    </SpecCard>
  )
}

// One spec document, rendered, under its tab (the Review view's file tabs).
function DocumentTab({ docs, error, file }: { docs: SpecDocuments | null; error: string | null; file: string }) {
  const text = docs?.documents?.[file]
  return (
    <SpecCard title={file} id={`avoozl-doc-${file}`} actions={docs ? <span className="min-w-0 text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>{docs.folder}{file}</span> : undefined}>
      {error ? (
        <ErrorText size="sm">{error}</ErrorText>
      ) : !docs ? (
        <Hint as="p" size="sm">Loading…</Hint>
      ) : typeof text !== 'string' ? (
        <Hint as="p" size="sm">This folder has no {file}.</Hint>
      ) : (
        <Markdown text={renderText(file, text)} idPrefix={docPrefix(file)} measure={PROSE_MEASURE} />
      )}
    </SpecCard>
  )
}

// The tabs a spec page has: Overview, Tasks, one per document in the spec
// folder, and Review. The files come from the folder, in reading order.
export function specTabNames(docs: SpecDocuments | null, hasPlan: boolean): string[] {
  if (!hasPlan) return []
  const files = Object.keys(docs?.documents ?? {})
  const first = documentTabs(docs).map((t) => t.file)
  return ['overview', 'tasks', ...first, ...files.filter((f) => !first.includes(f)).sort(), 'review']
}
const TAB_NAME: Record<string, string> = { overview: 'Overview', tasks: 'Tasks', review: 'Review' }
const OPEN = new Set(['open', 'answered', 'for you', 'accepted'])

function SpecTabs(props: { tabs: string[]; current: string; plan: SpecPlan | null; onPick: (tab: string) => void }) {
  const counts: Record<string, number> = {}
  for (const finding of props.plan?.review?.open ?? []) if (OPEN.has(finding.state ?? 'open')) counts[finding.file] = (counts[finding.file] ?? 0) + 1
  const files = props.tabs.filter((tab) => !TAB_NAME[tab])
  const shown: Record<string, number> = Object.fromEntries(files.map((file) => [file, counts[file] ?? 0]))
  shown.review = Object.values(counts).reduce((a, b) => a + b, 0)
  // The same inset as the spec header and body (data-spec-body), so the bar
  // spans the page's content edge to edge.
  const phone = usePhone()
  return (
    <div data-spec-tabs-wrap style={{ padding: phone ? 0 : '0 12px', minWidth: 0 }}>
      <DocTabs tabs={props.tabs} current={props.current} counts={shown} onPick={props.onPick} bar={{ label: 'Spec views', attr: 'data-spec-tab', prefix: 'spec-tab', labels: TAB_NAME }} />
    </div>
  )
}

// What projecting the approved plan would write to GitHub. Nothing is written.
function GitHubPreview(props: { projection: ProjectionPreview | null; busy: boolean; onPreview: () => void; onProject: () => void; onChanged: () => void }) {
  const { projection, busy } = props
  return (
    <SpecCard
        title="GitHub preview"
        actions={
          <Row gap={2} align="start">
            <TipBtn style={COMPACT_BTN} tooltip="List every GitHub write this spec would make. Makes none." onClick={props.onPreview} disabled={busy}>
              {projection ? 'Preview again' : 'Preview GitHub writes'}
            </TipBtn>
            <TipBtn primary style={COMPACT_BTN} tooltip="Preview, choose batches and create the issues. Nothing is written until you confirm." onClick={props.onProject} disabled={busy}>
              Project to GitHub…
            </TipBtn>
            <TipBtn style={COMPACT_BTN} tooltip="What an edited spec would do to each issue. Writes nothing until you apply it." onClick={props.onChanged} disabled={busy}>
              Spec changed…
            </TipBtn>
          </Row>
        }
      >
      <Hint as="p" size="sm">Lists every write a projection would make. Nothing is written.</Hint>
      {projection && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {projection.previewOnly.length > 0 && (
            <p>
              <Badge>preview only</Badge> Another machine writes {projection.previewOnly.join(', ')}.
            </p>
          )}
          {projection.writes.length === 0 ? (
            <Hint as="p">GitHub already matches this revision.</Hint>
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
            <Hint key={note} as="p">
              {note}
            </Hint>
          ))}
          {projection.project.status === 'unavailable' && (
            <Hint as="p">
              Project fields not previewed: {projection.project.reason} Fix: <code>{projection.project.fix}</code>
            </Hint>
          )}
        </div>
      )}
    </SpecCard>
  )
}

// The spec Summary. A reviewer writes the plain summary once per revision and
// the page reads it from Avoozl's own store (never a model call on open, no
// GitHub call). While the review runs the shared AI working box shows; if
// there is no summary and no review running, the line says so and Retry reads
// the plan again (and runs a review when one may).
function SpecAiSummary(props: { plan: SpecPlan; spec: SpecSummary; onRetry?: () => void }) {
  const { plan, spec } = props
  const review = plan.review
  const written = review?.summary ?? null
  const pending = review?.state === 'running' && !written?.current
  return (
    <Stack data-spec-summary gap={2}>
      {pending ? (
        <ReviewWorking model={review?.reviewerModel ?? null} title="AI working" label="Writing a short summary of this spec…" />
      ) : written ? (
        <p className="text-sm" data-spec-summary-text style={{ margin: 0, maxWidth: PROSE_MEASURE }}>
          {written.text}
          {!written.current && (
            <Hint size="xs" data-spec-summary-older>
              {' '}
              (written for <code>{shortHash(written.revisionHash)}</code>)
            </Hint>
          )}
        </p>
      ) : (
        <Hint as="p" size="sm" flush data-spec-summary-fallback>
          Summary unavailable{' '}
          {props.onRetry && (
            <button type="button" className="underline underline-offset-2" style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer' }} data-spec-summary-retry onClick={props.onRetry}>
              Retry
            </button>
          )}
        </Hint>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted" data-spec-summary-data>
        <span>
          Revision {plan.revision} · <code>{shortHash(plan.hash)}</code> · {plan.state}
        </span>
        <span>
          {spec.folder} · {spec.files.join(', ') || 'no files'}
        </span>
        <SeverityBadges counts={review?.openBySeverity} label="Open review findings" />
      </div>
    </Stack>
  )
}

function SpecDetail(props: {
  docs: SpecDocuments | null
  docsError: string | null
  spec: SpecSummary
  plan: SpecPlan | null
  preview: Preview | null
  projection: ProjectionPreview | null
  graph: Graph | null
  busy: boolean
  onProjection: () => void
  onProject: () => void
  onChanged: () => void
  onOpenTask: (id: string) => void
  onReview?: () => void
  // The spec's open pull request, adopted into it (R107.4).
  pull?: SpecPull | null
  workspaceId?: string | null
  onApprovePull?: () => void
  onPullChanged?: () => void
  // Retry for a summary that is not there: the page reads the plan again, and
  // runs a review when one can run.
  onRetrySummary?: () => void
  // The open tab (SpecTabs) and, for the Overview, the spec details box.
  tab: string
  details: ReactNode
  onTasks: () => void
}) {
  const { spec, plan, preview, busy, tab } = props
  const overview = tab === 'overview' || !plan
  const blocker = approveBlocker(plan)
  const critique = plan?.disk.critique ?? spec.critique
  const diagnostics = plan?.quality.diagnostics ?? []
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 20 }} role="tabpanel" id="spec-tab-panel">
      {overview && (<>
      {props.pull && props.workspaceId && (
        <SpecCard title="Proposed change" id="avoozl-spec-pull">
          <SpecPullBox pull={props.pull} workspaceId={props.workspaceId} onApprove={() => props.onApprovePull?.()} onChanged={() => props.onPullChanged?.()} />
        </SpecCard>
      )}
      <SpecCard
        title="Summary"
        actions={
          plan && props.onReview ? (
            <TipBtn style={COMPACT_BTN} tooltip="Read each review finding beside the spec text and decide it." onClick={props.onReview} data-open-review="">
              Open review{plan.review?.found ? ` (${plan.review.found})` : ''}
            </TipBtn>
          ) : undefined
        }
      >
        {plan ? (
          <SpecAiSummary plan={plan} spec={spec} onRetry={props.onRetrySummary} />
        ) : (
          <>
            <p className="text-sm">Not imported. Import stores this folder as a draft spec, so you can check and approve it. It approves nothing and starts nothing.</p>
            <p className="mt-1 text-sm text-muted">
              {spec.folder} · {spec.files.join(', ') || 'no files'}
            </p>
          </>
        )}
        {plan?.disk.changed && <p className="mt-1 text-sm">The files on disk changed since this revision. Reload from disk stores them as a new revision to approve.</p>}
        {plan && blocker && <p className="mt-1 text-sm text-muted">{blocker}</p>}
        <p className="mt-2 text-xs text-muted">
          Avoozl delivers this spec. Do not use Spec Builder&apos;s Approve tasks or Kiro&apos;s Run all Tasks on it.
        </p>
      </SpecCard>

      {props.details}

      {plan && (
        <SpecCard title="Task graph">
          <SpecGraph key={plan.id} graph={props.graph} planId={plan.id} only="frontier" onTasks={props.onTasks} />
        </SpecCard>
      )}
      </>)}

      {plan && tab === 'tasks' && (
        <>
          <SpecCard title="Task tree">
            <SpecGraph key={plan.id} graph={props.graph} planId={plan.id} only="tree" />
          </SpecCard>
          <PhaseTasks graph={props.graph} onOpenTask={props.onOpenTask} />
        </>
      )}

      {plan && tab !== 'overview' && tab !== 'tasks' && <DocumentTab key={tab} docs={props.docs} error={props.docsError} file={tab} />}

      {!plan && (
        <>
          <Documents key={spec.name} docs={props.docs} error={props.docsError} />
          <PhaseTasks graph={props.graph} onOpenTask={props.onOpenTask} />
        </>
      )}

      {overview && (<>
      <SpecCard title="Diagnostics">
        {!plan ? (
          <Hint as="p" size="sm">
            {spec.counts.error} errors, {spec.counts.warning} warnings in the folder on disk.
          </Hint>
        ) : diagnostics.length === 0 ? (
          <Hint as="p" size="sm">No diagnostics.</Hint>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {diagnostics.map((d) => (
              <li key={d.id}>
                <Badge variant={d.severity === 'error' ? 'danger' : undefined}>{d.severity}</Badge> <code>{location(d)}</code>{' '}
                {d.message}
              </li>
            ))}
          </ul>
        )}
      </SpecCard>

      <SpecCard title="Critique">
        {!critique ? (
          <Hint as="p" size="sm">No avoozl/critique.md yet.</Hint>
        ) : (
          <>
            <p className="text-sm">
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
      </SpecCard>

      {preview && (
        <SpecCard title="Manifest">
          {preview.baseline?.text && <Hint as="p" size="sm">{preview.baseline.text}.</Hint>}
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {preview.tasks.map((task) => {
              const requires = preview.dependencies.filter((edge) => edge.to === task.taskId && edge.kind === 'requires').map((edge) => edge.from)
              return (
                <li key={task.taskId}>
                  <code>{task.taskId}</code> {task.title} <Authority owner={task} />
                  {preview.baseline?.taskIds.includes(task.taskId) && <Badge>done</Badge>}
                  {requires.length > 0 && <Hint> · requires {requires.join(', ')}</Hint>}
                </li>
              )
            })}
          </ul>
        </SpecCard>
      )}

      {plan?.state === 'approved' && <GitHubPreview projection={props.projection} busy={busy} onPreview={props.onProjection} onProject={props.onProject} onChanged={props.onChanged} />}

      {plan && plan.approvals.length > 0 && (
        <SpecCard title="Approvals">
          <ul className="flex flex-col gap-1 text-sm">
            {plan.approvals.map((approval) => (
              <li key={approval.id}>
                <code>{shortHash(approval.hash)}</code> · {approval.at}
                {approval.approvedBy ? ` · ${approval.approvedBy}` : ''}
              </li>
            ))}
          </ul>
        </SpecCard>
      )}
      </>)}
    </div>
  )
}

// The spec's tasks by phase, in task order, No phase last; a title opens
// the task drawer.
function PhaseTasks(props: { graph: Graph | null; onOpenTask: (id: string) => void; fold?: boolean }) {
  const leaves = (props.graph?.tasks ?? []).filter((t) => t.kind === 'leaf')
  const groups = new Map<string | null, { title: string; tasks: typeof leaves }>()
  for (const task of leaves) {
    const id = task.phase?.id ?? null
    const entry = groups.get(id) ?? { title: task.phase?.title ?? 'No phase', tasks: [] }
    entry.tasks.push(task)
    groups.set(id, entry)
  }
  const list = [...groups].sort(([a], [b]) => Number(a === null) - Number(b === null))
  // Under the task graph the list is folded: the same tasks, one click away.
  const fold = (children: ReactNode) =>
    props.fold ? (
      <details data-phase-tasks-fold>
        <summary className="cursor-pointer text-sm text-muted">Show the task list ({leaves.length})</summary>
        <div className="mt-2">{children}</div>
      </details>
    ) : (
      <>{children}</>
    )
  return (
    <SpecCard title="Tasks by phase">
      {fold(<>
      {!props.graph ? (
        <Hint as="p" size="sm">Loading…</Hint>
      ) : list.length === 0 ? (
        <Hint as="p" size="sm">No task yet.</Hint>
      ) : (
        <Stack gap={3} data-phase-tasks>
          {list.map(([id, group]) => (
            <div key={id ?? '(none)'}>
              <h4 className="text-sm font-medium">
                {group.title} <span className="text-xs font-normal text-muted">{group.tasks.filter((t) => nodeState(t) === 'done').length}/{group.tasks.length}</span>
              </h4>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                {group.tasks.map((task) => (
                  <li key={task.id} className="flex items-baseline justify-between gap-3">
                    <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => props.onOpenTask(task.id)}>
                      {task.title}
                    </button>
                    <span className="shrink-0 text-xs text-muted">{STATES.find((state) => state.id === nodeState(task))?.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Stack>
      )}
      </>)}
    </SpecCard>
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
  if (percent === null) return <Hint size="xs">no tasks</Hint>
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
  return parts.length ? <span className="inline-flex flex-wrap gap-1">{parts}</span> : <Hint size="xs">—</Hint>
}

const cell: CSSProperties = { padding: '8px 10px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }
const head: CSSProperties = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }

// The Specs list's sort and filters: search, sort, status, what a spec
// has, kind, batch, archived, epic and category. They sit in the left nav
// under the open Specs section as Radar's Issues rail draws its own
// (NavRail.tsx); the count stays on the page.
const SORTS: RailSort<SpecSort>[] = [
  { key: 'name', label: 'Name', icon: CaseSensitive },
  { key: 'updated', label: 'Last update', icon: Clock },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
]
export interface SpecOrder {
  sort: SpecSort
  dir: 'asc' | 'desc'
}
// Statuses in the order a spec moves through them; unknown ones last.
const STATUS_ORDER = ['draft', 'changed', 'approved', 'done', 'not imported']
const statusRank = (status: string) => (STATUS_ORDER.indexOf(status) + 1 || STATUS_ORDER.length + 1)
function PlanFilters(props: { filter: PlanListFilter; rows: PlanRow[]; batches: number; order: SpecOrder; onOrder: (order: SpecOrder) => void; onChange: (filter: PlanListFilter) => void; children?: ReactNode }) {
  const { filter, order } = props
  const choices = rowChoices(props.rows)
  const set = (change: Partial<PlanListFilter>) => {
    const next: Record<string, unknown> = { ...filter, ...change }
    for (const key of Object.keys(next)) if (!next[key]) delete next[key]
    props.onChange(next as PlanListFilter)
  }
  // A row in a group of one choice: picking the one that is on clears it.
  const pick = <K extends keyof PlanListFilter>(key: K, value: PlanListFilter[K]) => set({ [key]: filter[key] === value ? undefined : value } as Partial<PlanListFilter>)
  const active = Object.keys(filter).length > 0
  const kinds = new Set(props.rows.map((row) => row.kind))
  const categories = choices.categories.map((value) => ({ value, label: value, count: choices.categoryCounts.get(value) ?? 0 }))
  return (
    <>
      <NavSlotFor section="plans">
        <div role="search" aria-label="Filter specs" data-nav-filters="avoozl-plans" data-filter-panel="avoozl-plans" data-rail>
          <RailStyle />
          <input
            type="search"
            aria-label="Search specs"
            placeholder="Search specs"
            value={filter.q ?? ''}
            onChange={(event) => set({ q: event.target.value })}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, fontSize: 13, padding: '6px 12px', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
          <RailBlock first id="sort" icon={ArrowUpDown} title="Sort">
            <RailSortList fields={SORTS} sort={order.sort} dir={order.dir} onSort={(sort) => props.onOrder(sort === order.sort ? { sort, dir: order.dir === 'asc' ? 'desc' : 'asc' } : { sort, dir: SORT_FIRST[sort] })} />
          </RailBlock>
          <RailBlock
            id="filters"
            icon={ListFilter}
            title="Filters"
            action={
              active && (
                <button type="button" data-rail-icon onClick={() => props.onChange({})} style={{ gap: 2, alignItems: 'center', fontSize: 12 }}>
                  <X size={11} aria-hidden="true" /> Clear
                </button>
              )
            }
          >
            {/* Above each rule a group of one choice; Show archived alone. */}
            <RailRow label="All" active={!filter.status} onClick={() => set({ status: undefined })} attrs={{ 'data-rail-status': '' }} />
            {[...choices.statuses].sort((a, b) => statusRank(a) - statusRank(b)).map((value) => (
              <RailRow key={value} label={STATUS_LABEL[value] ?? value} active={filter.status === value} onClick={() => pick('status', value)} attrs={{ 'data-rail-status': value }} />
            ))}
            <RailDivider />
            <RailRow label="Ready tasks" active={filter.has === 'ready'} onClick={() => pick('has', 'ready')} />
            <RailRow label="Running tasks" active={filter.has === 'running'} onClick={() => pick('has', 'running')} />
            <RailRow label="Tasks that need you" active={filter.has === 'needs-you'} onClick={() => pick('has', 'needs-you')} />
            {kinds.has('old-style') && (
              <>
                <RailDivider />
                <RailRow label="Spec folders" active={filter.kind === 'spec'} onClick={() => pick('kind', 'spec')} />
                <RailRow label="Old-style specs" active={filter.kind === 'old-style'} onClick={() => pick('kind', 'old-style')} />
              </>
            )}
            {props.batches > 0 && <RailDivider />}
            {Array.from({ length: props.batches }, (_, at) => String(at + 1)).map((batch) => (
              <RailRow key={batch} label={`Batch ${batch}`} active={filter.batch === batch} onClick={() => pick('batch', batch)} attrs={{ 'data-rail-batch': batch }} />
            ))}
            <RailDivider />
            <RailRow label="Show archived" active={Boolean(filter.archived)} onClick={() => set({ archived: !filter.archived })} />
          </RailBlock>
          <RailChips id="epics" icon={Layers} title="Epics" noun="epic" items={choices.epics} picked={filter.epic} onPick={(epic) => set({ epic })} />
          {categories.length > 1 && <RailChips id="categories" icon={Tag} title="Categories" noun="category" items={categories} picked={filter.category} onPick={(category) => set({ category })} />}
        </div>
      </NavSlotFor>
      <div className="flex min-w-0 items-center gap-1.5 px-1" data-filter-status>
        {props.children}
        {active && (
          <button type="button" className="text-xs underline" onClick={() => props.onChange({})} data-filter-clear-inline>
            Clear filters
          </button>
        )}
      </div>
    </>
  )
}

const ARCHIVE_TIP = 'Archive this spec: its tasks stop starting and it is hidden. You can undo it.'
const UNARCHIVE_TIP = 'Unarchive this spec: its tasks may start again and it shows everywhere.'

// The Specs heading buttons, in the owner's order: New spec, then Refresh
// last. New task lives in a spec's detail only (RC30.2). Refresh re-reads plan.table (the spec folders on disk and
// the stored plans); it imports nothing.
export const REFRESH_PLANS_TIP = 'Reload specs from disk. Imports nothing.'
function PlansActions(props: { onNewPlan: () => void; onRefresh: () => void; busy: boolean }) {
  return (
    <>
      <IconLabel style={COMPACT_BTN} icon={Plus} primary tooltip="Describe what you want. Spec Builder drafts its spec folder; nothing is approved." onClick={props.onNewPlan}>
        New spec
      </IconLabel>
      <IconBtn icon={RefreshCw} label="Refresh specs" tooltip={REFRESH_PLANS_TIP} onClick={props.onRefresh} disabled={props.busy} />
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
        <IconBtn icon={Download} label={`Import ${row.name}`} tooltip="Store this folder as a draft spec. Approves and starts nothing." disabled={props.busy} onClick={props.onImport} />
      )}
      {props.onOpen && <IconBtn icon={DetailsIcon} label={`Open docs for ${row.name}`} tooltip="Open this spec's documents and tasks" onClick={props.onOpen} />}
      {actions.scoped && <IconBtn icon={Network} label={`Graph of ${row.name}`} tooltip="Show this spec's tasks in the Graph" onClick={() => props.onScope('graph')} />}
      {actions.review && props.onReview && <IconBtn icon={ClipboardCheck} label={`Review ${row.name}`} tooltip="Open this spec to check and approve it" onClick={props.onReview} />}
      {props.onChange && <IconBtn icon={Pencil} label={`Change spec ${row.name}`} tooltip="Start a planner chat to change this spec" onClick={props.onChange} />}
      {props.onArchive && actions.archivable && (
        <IconBtn icon={Archive} label={`Archive ${row.name}`} tooltip={ARCHIVE_TIP} disabled={props.busy} onClick={props.onArchive} />
      )}
      {props.onUnarchive && actions.unarchivable && (
        <IconBtn icon={ArchiveRestore} label={`Unarchive ${row.name}`} tooltip={UNARCHIVE_TIP} disabled={props.busy} onClick={props.onUnarchive} />
      )}
      {props.onDelete && actions.deletable && (
        <IconBtn icon={Trash2} label={`Delete ${row.name}`} tooltip="Delete this spec. You confirm first; it stays in history." disabled={props.busy} onClick={props.onDelete} style={dangerStyle} />
      )}
    </span>
  )
}

// The Plans table: one row per plan, grouped by category (Uncategorized
// last) in groups that fold. No pages: a group over PAGE rows shows that
// many and a Show more button. A click on a row or its name opens the
// plan; the buttons do their own thing and never open it as well.
// Private specs live on the mirror's plans branch only; public ones follow the code (RC25.2).
function HomeBadge(props: { home?: 'main' | 'plansBranch' }) {
  const badge = homeBadge(props.home)
  return badge ? <Badge variant={badge.warn ? 'warning' : undefined}>{badge.label}</Badge> : null
}

// Every spec in one list (follows Kiro Crew's list-detail pattern): the
// name, one status chip, the task count, the epic and where it lives.
// Picking a row opens it in the detail column.
// A draft spec in an approval batch shows its Batch chip and a checkbox to
// pick it for Approve N specs.
export function SpecList(props: {
  rows: PlanRow[]
  order?: SpecOrder
  selected: string | null
  onOpen: (row: PlanRow) => void
  reset: string
  batchOf?: Map<string, number>
  checked?: Set<string>
  onCheck?: (planId: string, on: boolean) => void
}) {
  const sorted = sortRows(props.rows, props.order?.sort, props.order?.dir)
  const pages = usePages(props.reset)
  const batchOf = props.batchOf ?? new Map<string, number>()
  const picking = Boolean(props.onCheck) && props.rows.some((row) => row.planId && batchOf.has(row.planId))
  return (
    <>
    {sorted.some((row) => specChip(row) === 'draft') && (
      <p data-spec-legend className="m-0 px-2 pb-1 text-xs text-muted">
        Grey titles are drafts.
      </p>
    )}
    <ul className="m-0 flex list-none flex-col p-0" data-spec-list>
      {pages.take('specs', sorted).map((row) => {
        const chip = specChip(row)
        const selected = row.key === props.selected
        const batch = row.planId ? batchOf.get(row.planId) : undefined
        const button = (
          <button
            type="button"
            data-plan-row={row.key}
            data-spec-chip={chip}
            aria-current={selected ? 'true' : undefined}
            onClick={() => props.onOpen(row)}
            className="flex w-full min-w-0 flex-col items-stretch gap-0.5 px-2 py-1.5 text-left"
            style={{ background: selected ? 'var(--accent-subtle, var(--bg-elevated))' : 'none', border: 0, borderRadius: 6, color: 'inherit', cursor: 'pointer' }}
          >
            <span className="flex min-w-0 items-center gap-2">
              {chip === 'draft' ? (
                // A draft has no badge: its title is in the muted theme color, the
                // word stays for screen readers, and the row has a Draft tooltip.
                <span className="min-w-0 flex-1 truncate text-sm font-medium" data-spec-name="draft" style={{ color: 'var(--muted)' }}>
                  {row.name}
                  <span className="sr-only"> ({SPEC_CHIP_LABEL.draft})</span>
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" data-spec-name="">{row.name}</span>
                  <Badge variant={SPEC_CHIP_VARIANT[chip]}>{SPEC_CHIP_LABEL[chip]}</Badge>
                </>
              )}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span className="tabular-nums">
                {row.tasks.total} {row.tasks.total === 1 ? 'task' : 'tasks'}
              </span>
              <span>·</span>
              <span className="truncate">{row.kind === 'epic' ? 'Epic' : (row.epicTitle ?? 'No epic')}</span>
              <HomeBadge home={row.home} />
              {row.pull && (
                <Tooltip text={`A pull request proposes a change to this spec: #${row.pull.number}${row.pull.draft ? ' (draft)' : ''}`}>
                  <span data-spec-pr-chip="">
                    <Badge variant="info">PR</Badge>
                  </span>
                </Tooltip>
              )}
              {batch !== undefined && <Badge>Batch {batch}</Badge>}
              {row.archived && <Badge>Archived</Badge>}
            </span>
          </button>
        )
        return (
          <li key={row.key} className="flex items-center gap-1 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
            {picking && (
              <span className="flex w-6 shrink-0 justify-center">
                {batch !== undefined && row.planId && (
                  <Checkbox
                    data-spec-check={row.planId}
                    aria-label={`Select ${row.name} to approve`}
                    checked={props.checked?.has(row.planId) ?? false}
                    onChange={(event) => props.onCheck?.(row.planId!, event.target.checked)}
                  />
                )}
              </span>
            )}
            {chip === 'draft' ? (
              <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                <Tooltip text={SPEC_CHIP_LABEL.draft} display="block">
                  {button}
                </Tooltip>
              </div>
            ) : (
              button
            )}
          </li>
        )
      })}
    </ul>
    <ShowMore {...pages.more('specs', sorted.length)} />
    </>
  )
}

const SPEC_CHIP_VARIANT: Record<Exclude<SpecChip, 'draft'>, 'success' | 'info' | undefined> = { approved: 'info', github: undefined, done: 'success' }

// Where a spec's issues and their graph are: Issue Radar's Graph.
function RadarGraphLink() {
  return (
    <p data-radar-graph className="m-0 text-sm">
      Issues on GitHub and their graph:{' '}
      <TextLink href={linkHref(RADAR_GRAPH_URL)} target="_top">
        Open the Issue Radar graph →
      </TextLink>{' '}
      <Hint size="xs">Choose the Graph view there, then the issue.</Hint>
    </p>
  )
}
const RADAR_GRAPH_URL = '/issue-radar'

// The spec's header, as Issue Radar heads an issue: the title (27px bold),
// a meta line (category, who approved or created it, when), then a row with
// the state pill, the spec's ID, the one primary action and a ... menu with
// every other spec action. A divider runs under it.
interface SpecActions {
  onEdit: () => void
  onDiscuss: () => void
  onNewTask: () => void
  onImport?: () => void
  onReload?: () => void
  onApprove?: () => void
  approveBlocker?: string | null
  onSpecBuilder?: () => void
  onGraph?: () => void
  onFolder?: () => void
  github: string | null
  onDelete?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
}

// The primary action: Import a folder Avoozl has not stored; Approve a draft
// that can be approved; Open in Spec Builder for a draft that cannot yet;
// Edit spec otherwise.
export function primaryAction(row: Pick<PlanRow, 'status' | 'spec'>, plan: { state: string } | null, blocker: string | null): 'import' | 'approve' | 'spec-builder' | 'edit' {
  if (row.status === 'not imported') return 'import'
  if (plan && (plan.state === 'draft' || row.status === 'changed')) return blocker === null ? 'approve' : row.spec ? 'spec-builder' : 'edit'
  if (row.status === 'draft') return row.spec ? 'spec-builder' : 'edit'
  return 'edit'
}

function specMeta(row: PlanRow, plan: (SpecPlan & { createdAt?: string; updatedAt?: string }) | null): ReactNode[] {
  const parts: ReactNode[] = [<span key="category">{row.category ?? 'Uncategorized'}</span>]
  const approval = plan?.approvals.at(-1)
  if (approval)
    parts.push(
      <span key="who">
        {approval.approvedBy ? `${approval.approvedBy} approved it` : 'Approved'}{' '}
        <Tooltip text={approval.at}>
          <span>{relativeTime(approval.at)}</span>
        </Tooltip>
      </span>,
    )
  else if (plan?.createdAt)
    parts.push(
      <span key="who">
        Created{' '}
        <Tooltip text={plan.createdAt}>
          <span>{relativeTime(plan.createdAt)}</span>
        </Tooltip>
      </span>,
    )
  else if (row.lastChange)
    parts.push(
      <span key="who">
        Changed{' '}
        <Tooltip text={row.lastChange}>
          <span>{relativeTime(row.lastChange)}</span>
        </Tooltip>
      </span>,
    )
  return parts
}

function SpecHeader(props: { row: PlanRow; plan: SpecPlan | null; actions: SpecActions; busy: boolean; driver: ReactNode; handOff: ReactNode; flush: boolean }) {
  const { row, plan, actions } = props
  const primary = primaryAction(row, plan, actions.approveBlocker ?? null)
  const id = row.planId ?? row.spec ?? row.key
  const primaryButton = {
    import: { label: 'Import', icon: Download, tooltip: 'Store this folder as a draft spec. Approves and starts nothing.', onClick: actions.onImport },
    approve: { label: 'Approve', icon: ClipboardCheck, tooltip: `Approve revision ${shortHash(plan?.hash)}. Its ready tasks may then start.`, onClick: actions.onApprove },
    'spec-builder': { label: 'Open in Spec Builder', icon: FileText, tooltip: actions.approveBlocker ? `Not ready to approve: ${actions.approveBlocker}` : "Open this draft in Kiro Crew's Spec Builder", onClick: actions.onSpecBuilder },
    edit: { label: 'Edit spec', icon: Pencil, tooltip: 'Start a planner chat that drafts a change to the spec files', onClick: actions.onEdit },
  }[primary]
  const PrimaryIcon = primaryButton.icon
  const titleRef = useDetailTitleRef()
  const pad = props.flush ? 0 : 12
  const divider = { borderBottom: '1px solid var(--border)', marginLeft: props.flush ? 0 : -12, paddingLeft: props.flush ? 0 : 24, paddingRight: pad }
  return (
    <header data-spec-header>
      <div style={{ padding: `20px ${pad}px 0`, marginLeft: props.flush ? 0 : -12, paddingLeft: props.flush ? 0 : 24 }}>
        <h1 id="avoozl-plan-title" ref={titleRef ?? undefined} style={{ margin: 0, fontSize: 27, fontWeight: 700, lineHeight: 1.25, color: 'var(--text-strong, var(--text))', overflowWrap: 'anywhere' }}>
          {row.name}
        </h1>
        <p data-spec-meta style={{ margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12.5, lineHeight: '19.4px', color: 'var(--muted)' }}>
          {specMeta(row, plan).map((part, i) => (
            <span key={i} style={{ display: 'contents' }}>
              {i > 0 && <span aria-hidden="true">·</span>}
              {part}
            </span>
          ))}
          {props.driver}
        </p>
      </div>
      <div data-spec-actions style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: `16px ${pad}px 16px`, ...divider }}>
        <StatePill status={row.status} archived={Boolean(row.archived)} />
        <span data-spec-id style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono, ui-monospace, monospace)', overflowWrap: 'anywhere' }}>
          {id}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'stretch', gap: 6 }}>
          <Tooltip text={primaryButton.tooltip}>
            {(describedBy) => (
              <Btn
                type="button"
                primary
                data-spec-primary={primary}
                aria-describedby={describedBy}
                disabled={props.busy || !primaryButton.onClick}
                onClick={primaryButton.onClick}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: 0 }}
              >
                <PrimaryIcon size={13} aria-hidden="true" />
                {primaryButton.label}
              </Btn>
            )}
          </Tooltip>
          <MoreMenu label="More spec actions" attrs={{ 'data-spec-more': '' }}>
            <style>{RAIL_CSS}</style>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {primary !== 'edit' && <MenuItem icon={Pencil} label="Edit spec" tooltip="Start a planner chat that drafts a change to the spec files" onClick={actions.onEdit} />}
              <MenuItem icon={MessagesSquare} label="Discuss spec" tooltip="Start a chat about this spec. It makes no edits." onClick={actions.onDiscuss} />
              <span data-new-task className="contents">
                <MenuItem icon={Plus} label="New task" tooltip="Add a draft task from this spec. It waits for your review." onClick={actions.onNewTask} />
              </span>
              {primary !== 'spec-builder' && actions.onSpecBuilder && <MenuItem icon={FileText} label="Open in Spec Builder" onClick={actions.onSpecBuilder} />}
              {primary !== 'approve' && actions.onApprove && plan?.state === 'draft' && (
                <MenuItem icon={ClipboardCheck} label="Approve" disabled={actions.approveBlocker !== null} tooltip={actions.approveBlocker ?? undefined} onClick={actions.onApprove} />
              )}
              {actions.onReload && <MenuItem icon={RefreshCw} label="Reload from disk" tooltip="Store the changed files as a new revision to approve" onClick={actions.onReload} />}
              {actions.onGraph && <MenuItem icon={Network} label="Show in Graph" tooltip="Show this spec's tasks in the Graph" onClick={actions.onGraph} />}
              <MenuItem icon={FolderOpen} label="Open folder" tooltip={actions.onFolder ? 'Show the spec folder in Finder' : 'This spec has no folder on disk'} disabled={!actions.onFolder} onClick={actions.onFolder} />
              <MenuItem icon={ExternalLink} label="Open on GitHub" tooltip={actions.github ? undefined : 'No GitHub repository holds this spec'} link={actions.github} />
              {props.handOff && (
                <span data-keep-menu className="contents">
                  {props.handOff}
                </span>
              )}
              {actions.onArchive && <MenuItem icon={Archive} label="Archive" tooltip={ARCHIVE_TIP} onClick={actions.onArchive} />}
              {actions.onUnarchive && <MenuItem icon={ArchiveRestore} label="Unarchive" tooltip={UNARCHIVE_TIP} onClick={actions.onUnarchive} />}
              {actions.onDelete && <MenuItem icon={Trash2} label="Delete" danger tooltip="Delete this spec. You confirm first; it stays in history." onClick={actions.onDelete} />}
            </div>
          </MoreMenu>
        </span>
      </div>
    </header>
  )
}

// One GitHub link: opens a new tab with no opener (R92.9).
function GithubLink(props: { link: { url: string }; children: ReactNode }) {
  if (!safeHref(props.link.url)) return <>{props.children}</>
  return (
    <a href={safeHref(props.link.url)!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ overflowWrap: 'anywhere' }} data-spec-link>
      {props.children}
    </a>
  )
}

// The spec's Links box (R92.4): its issue, working branch, open pull
// requests with a check dot each, and the Radar issues it came from. Built
// from stored records only; a missing one shows as none. This page is
// local, so a private spec issue shows here and nowhere public.
function LinksSection(props: { links: SpecLinks | null | undefined; loading: boolean }) {
  const links = props.links
  const muted = 'var(--muted)'
  const none = <span style={{ color: muted }}>{props.loading ? '…' : 'None'}</span>
  const row = (label: string, body: ReactNode) => (
    <div data-spec-links-row={label}>
      <dt style={{ color: muted }}>{label}</dt>
      <dd style={{ margin: 0 }}>{body}</dd>
    </div>
  )
  const list = (items: ReactNode[]) => (items.length ? <ul className="flex flex-col gap-0.5">{items}</ul> : none)
  return (
    <RailSection title="Links" attrs={{ 'data-spec-links': '' }}>
      <dl className="flex flex-col gap-2" style={{ margin: 0 }}>
        {row(
          'Spec issue',
          links?.issue ? (
            <GithubLink link={links.issue}>{scmLinkText(links.issue)}</GithubLink>
          ) : links?.journal?.home === 'local' ? (
            <span style={{ color: muted }}>None; the journal is kept locally</span>
          ) : (
            none
          ),
        )}
        {row(
          'Working branch',
          list((links?.workingBranches ?? []).map((branch) => (
            <li key={branch.url}>
              <GithubLink link={branch}>{scmLinkText(branch)}</GithubLink>
            </li>
          ))),
        )}
        {row(
          'Open pull requests',
          list((links?.pulls ?? []).map((pull) => {
            const dot = checkDot(pull.checks, relativeTime)
            return (
              <li key={pull.url} className="flex items-center gap-1.5" data-spec-pull={pull.number}>
                <Tooltip text={dot.label}>
                  {(describedBy) =>
                    pull.checks?.url && safeHref(pull.checks.url) ? (
                      <a href={safeHref(pull.checks.url)!} target="_blank" rel="noopener noreferrer" aria-label={dot.label} aria-describedby={describedBy} data-check-dot={pull.checks.dot} className="inline-flex shrink-0">
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color }} />
                      </a>
                    ) : (
                      <span role="img" aria-label={dot.label} aria-describedby={describedBy} data-check-dot={pull.checks?.dot ?? 'none'} className="inline-flex shrink-0" style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color }} />
                    )
                  }
                </Tooltip>
                <GithubLink link={pull}>#{pull.number}</GithubLink>
                <span className="truncate" style={{ color: muted }}>{pull.task}</span>
              </li>
            )
          })),
        )}
        {row(
          'Radar issues',
          list((links?.sources ?? []).map((source) => (
            <li key={source.url}>
              <GithubLink link={source}>{scmLinkText(source)}</GithubLink>
            </li>
          ))),
        )}
      </dl>
    </RailSection>
  )
}

// The spec's right rail: small labeled sections split by dividers, each
// with Edit where a planner chat or a setting changes it.
function SpecRail(props: {
  row: PlanRow
  plan: (SpecPlan & { createdAt?: string; updatedAt?: string }) | null
  graph: Graph | null
  docs: SpecDocuments | null
  onEdit: () => void
  onRepositories?: () => void
  onDrill: (drill: Drill) => void
  onOpenTask: (id: string) => void
}) {
  const { row, graph, docs, plan } = props
  const leaves = (graph?.tasks ?? []).filter((t) => t.kind === 'leaf')
  const counts = Object.fromEntries(STATES.map((s) => [s.id, 0])) as Record<NodeState, number>
  for (const task of leaves) counts[nodeState(task)] += 1
  // Its phases with progress, in task order; No phase last (R59.10).
  const phases = new Map<string | null, { title: string; done: number; total: number }>()
  for (const task of leaves) {
    const id = task.phase?.id ?? null
    const entry = phases.get(id) ?? { title: task.phase?.title ?? 'No phase', done: 0, total: 0 }
    entry.total += 1
    if (nodeState(task) === 'done') entry.done += 1
    phases.set(id, entry)
  }
  const phaseList = [...phases].sort(([a], [b]) => Number(a === null) - Number(b === null))
  const repositories = [...new Set(leaves.map((t) => t.repository).filter((name): name is string => Boolean(name)))].sort()
  const decisions = (graph?.tasks ?? []).filter((t) => t.decision)
  const tabs = documentTabs(docs)
  const muted = 'var(--muted)'
  const date = (label: string, at: string | null | undefined) => (
    <div className="flex items-baseline justify-between gap-3" data-rail-date={label}>
      <span style={{ color: muted }}>{label}</span>
      {at ? (
        <Tooltip text={at}>
          <span>{relativeTime(at)}</span>
        </Tooltip>
      ) : (
        <span style={{ color: muted }}>—</span>
      )}
    </div>
  )
  const edit = (what: string) => ({ label: `Edit the ${what} of ${row.name}`, onClick: props.onEdit })
  return (
    <div data-spec-rail data-plan-aside style={{ fontSize: 12.5, lineHeight: '19.4px' }}>
      <style>{RAIL_CSS}</style>
      {row.kind !== 'epic' && (
        <RailSection title="Epic" edit={edit('epic')}>
          {row.epic ? (
            <button type="button" className="text-left underline" onClick={() => props.onDrill({ kind: 'epic', id: row.epic!, title: row.epicTitle ?? row.epic! })}>
              {row.epicTitle ?? row.epic}
            </button>
          ) : (
            <span style={{ color: muted }}>No epic</span>
          )}
        </RailSection>
      )}
      <RailSection title="Category" edit={edit('category')}>
        {row.category ?? <span style={{ color: muted }}>None in its front-matter</span>}
        {(row.type || row.home) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {row.type && <Badge>{row.type}</Badge>}
            <HomeBadge home={row.home} />
          </span>
        )}
      </RailSection>
      <RailSection title="Repositories" edit={props.onRepositories ? { label: 'Edit repositories in Settings', onClick: props.onRepositories } : undefined}>
        {repositories.length ? (
          <ul className="flex flex-col gap-0.5">
            {repositories.map((name) => (
              <li key={name} style={{ overflowWrap: 'anywhere' }}>
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <span style={{ color: muted }}>{graph ? 'No repository yet' : '…'}</span>
        )}
      </RailSection>
      {row.planId && <LinksSection links={plan?.links} loading={!plan} />}
      <RailSection title="Phases" edit={edit('phases')}>
        {phaseList.length === 0 ? (
          <span style={{ color: muted }}>{graph ? 'No phase yet' : '…'}</span>
        ) : (
          <Stack as="ul" gap={1}>
            {phaseList.map(([id, phase]) => {
              const percent = phase.total ? Math.round((phase.done / phase.total) * 100) : 0
              return (
                <li key={id ?? '(none)'}>
                  <Tooltip text={`Show only ${phase.title} in the Graph`} display="block">
                    <button type="button" className="w-full rounded px-1 py-0.5 text-left hover:bg-accent/10" onClick={() => props.onDrill({ kind: 'phase', plan: row.planId, id, title: phase.title })}>
                      <span className="flex justify-between gap-2">
                        <span className="truncate">{phase.title}</span>
                        <span className="shrink-0" style={{ color: muted }}>
                          {phase.done}/{phase.total}
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
          </Stack>
        )}
      </RailSection>
      <RailSection title="Progress">
        <ProgressBar tasks={row.tasks} />
        {/* One row per state: the label, then its count on the same line. */}
        <dl className="mt-2 flex flex-col gap-0.5" style={{ margin: 0 }}>
          {STATES.map((state) => (
            <div key={state.id} className="flex items-baseline justify-between gap-3" data-state-count={state.id}>
              <dt style={{ color: muted }}>{state.label}</dt>
              <dd className="tabular-nums" style={{ margin: 0 }}>{graph ? counts[state.id] : '…'}</dd>
            </div>
          ))}
        </dl>
        {row.planId && leaves.length > 0 && (
          <Tooltip text="Show this spec's live dependency tree in the Graph" display="block">
            <button
              type="button"
              className="mt-2 text-left underline underline-offset-2"
              style={{ color: 'var(--accent)' }}
              data-spec-open-tree={row.planId}
              onClick={() => props.onDrill({ kind: 'spec', id: row.planId!, title: row.name })}
            >
              open tree →
            </button>
          </Tooltip>
        )}
      </RailSection>
      <RailSection title="Dates">
        <div className="flex flex-col gap-0.5">
          {date('Created', plan?.createdAt)}
          {date('Updated', plan?.updatedAt ?? row.lastChange)}
          {date('Approved', plan?.approvals.at(-1)?.at)}
        </div>
      </RailSection>
      <RailSection title={`Open decisions (${decisions.length})`}>
        {decisions.length === 0 ? (
          <span style={{ color: muted }}>None.</span>
        ) : (
          <Stack as="ul" gap={1}>
            {decisions.map((task) => (
              <li key={task.id}>
                <button type="button" className="text-left underline" onClick={() => props.onOpenTask(task.id)}>
                  {task.title}
                </button>
                <span className="block" style={{ color: muted }}>{task.decision}</span>
              </li>
            ))}
          </Stack>
        )}
      </RailSection>
      {tabs.length > 0 && (
        <RailSection title="Outline">
          <nav aria-label="Spec outline">
            <Stack as="ul" gap={1}>
              {tabs.map((tab) => (
                <li key={tab.file}>
                  <button type="button" className="font-medium hover:underline" onClick={() => jump(`avoozl-doc-${tab.file}`)}>
                    {tab.label}
                  </button>
                  <Stack as="ul">
                    {outline(tab.text, docPrefix(tab.file), 2)
                      .filter((h) => h.level === 2)
                      .map((h) => (
                        <li key={h.id} className="truncate pl-3">
                          <button type="button" className="text-left hover:underline" style={{ color: muted }} onClick={() => jump(h.id)}>
                            {h.text}
                          </button>
                        </li>
                      ))}
                  </Stack>
                </li>
              ))}
            </Stack>
          </nav>
        </RailSection>
      )}
      {(row.timeline ?? []).length > 0 && (
        <RailSection title="Activity" attrs={{ 'data-plan-timeline': '' }}>
          <ol className="flex flex-col gap-0.5">
            {row.timeline!.map((entry, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{planEventLine(entry)}</span>
                <Tooltip text={entry.at}>
                  <span className="shrink-0" style={{ color: muted }}>{relativeTime(entry.at)}</span>
                </Tooltip>
              </li>
            ))}
          </ol>
        </RailSection>
      )}
    </div>
  )
}


// Archive plan: a plain confirm, not red, because Unarchive undoes it.
export function ArchivePlanDialog(props: { workspaceId: string; row: PlanRow; client: PlansClient; onDone: (text: string | null) => void }) {
  const { row, client, workspaceId } = props
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const done = await client.archive(workspaceId, row.planId!)
      props.onDone(
        `Archived ${row.name}. ${done.held} tasks held, ${done.running} running chats left alone, ${done.decisions} decisions opened. Show archived on Specs brings it back.`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    // Esc, Back and a click outside do what Cancel does.
    <Modal
      id="avoozl-archive-plan"
      role="alertdialog"
      width="32rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      focusClose
      attrs={{ 'data-archive-plan': true }}
      title={`Archive the spec ${row.name}?`}
      onDismiss={() => props.onDone(null)}
      footer={
        <>
          <Btn type="button" primary data-archive-confirm style={COMPACT_BTN} disabled={busy} onClick={() => void run()}>
            Archive spec
          </Btn>
        </>
      }
    >
      <ul className="flex flex-col gap-1 pl-5 text-sm" style={{ listStyle: 'disc' }}>
        {ARCHIVE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {error && <ErrorText role="alert" size="sm">{error}</ErrorText>}
    </Modal>
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
        <span className="font-medium">This spec is archived.</span>{' '}
        <Hint>
          {archived.by ? `${archived.by} archived it` : 'Archived'} <Tooltip text={archived.at}><span>{relativeTime(archived.at)}</span></Tooltip>. Its tasks
          do not start, and it is hidden unless Show archived is on.
        </Hint>
      </span>
      <IconLabel style={COMPACT_BTN} icon={ArchiveRestore} primary disabled={props.busy} tooltip={UNARCHIVE_TIP} onClick={props.onUnarchive}>
        Unarchive
      </IconLabel>
    </div>
  )
}

// Delete plan: the confirm names the plan, counts its tasks and says what
// happens to each. The spec folder checkbox is off by default and removes
// the folder from the working tree only, never committing or pushing.
export function DeletePlanDialog(props: { workspaceId: string; row: PlanRow; client: PlansClient; onDone: (text: string | null) => void }) {
  const { row, client, workspaceId } = props
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [folder, setFolder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    client.deletePreview(workspaceId, row.planId!).then(setPreview, (caught) => setError(errorMessage(caught)))
  }, [client, workspaceId, row.planId])
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
    // Esc, Back and a click outside do what Cancel does.
    <Modal
      id="avoozl-delete-plan"
      role="alertdialog"
      width="32rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      focusClose
      attrs={{ 'data-delete-plan': preview?.retire ? 'retire' : 'draft' }}
      title={`Delete the spec ${preview?.title ?? row.name}?`}
      onDismiss={() => props.onDone(null)}
      footer={
        <>
          <Button type="button" variant="danger" disabled={!preview || busy || blocked} onClick={() => void run()} style={COMPACT_BTN}>
            Delete spec
          </Button>
        </>
      }
    >
      {!preview && !error && <Hint as="p" size="sm">Counting its tasks…</Hint>}
      {preview && (
        <ul className="flex flex-col gap-1 pl-5 text-sm" style={{ listStyle: 'disc' }}>
          {deleteLines(preview).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {preview?.folder?.exists && (
        <label className="flex flex-col gap-1 text-sm">
          <Row as="span" gap={2} wrap={false}>
            <Checkbox checked={folder} onChange={(event) => setFolder(event.target.checked)} />
            Also delete the spec folder (.kiro/specs/{preview.spec}/) from the repo.
          </Row>
          <code className="pl-6 text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>{preview.folder.path}</code>
          <span className="pl-6 text-xs text-muted">Only the working tree. Avoozl never commits or pushes this.</span>
          {folder && preview.folder.dirty && <span role="alert" className="pl-6 text-xs text-danger">{preview.folder.reason}</span>}
        </label>
      )}
      {error && <ErrorText role="alert" size="sm">{error}</ErrorText>}
    </Modal>
  )
}

// The approve dialog's specs: a bordered box that scrolls sideways on its
// own, fixed columns, the name truncating with the full name in its tooltip.
// A phone shows the name and writes; the other counts are in the row tooltip.
const TH: CSSProperties = { padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text-muted, var(--muted))', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }
const TD: CSSProperties = { padding: '6px 10px', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' }
const NUM: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
function ApproveTable(props: { entries: BatchEntry[]; selection: BatchSelection | null; phone: boolean }) {
  const writesOf = (id: string) => {
    const found = props.selection?.specs.find((entry) => entry.id === id)
    if (!props.selection) return '…'
    return found?.writes === null || found?.writes === undefined ? '—' : String(found.writes)
  }
  const columns = props.phone ? ['auto', '5rem'] : ['auto', '8.5rem', '5rem', '5rem']
  return (
    <div data-approve-list className="overflow-x-auto rounded border" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse', minWidth: props.phone ? undefined : '30rem' }}>
        <colgroup>
          {columns.map((width, at) => (
            <col key={at} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'left' }}>Spec</th>
            {!props.phone && <th style={{ ...TH, textAlign: 'left' }}>Revision</th>}
            {!props.phone && <th style={{ ...TH, ...NUM }}>Tasks</th>}
            <th style={{ ...TH, ...NUM }}>Writes</th>
          </tr>
        </thead>
        <tbody>
          {props.entries.map((entry) => {
            const tip = props.phone ? `${entry.spec} · revision ${shortHash(entry.hash)} · ${entry.tasks} ${entry.tasks === 1 ? 'task' : 'tasks'} · ${writesOf(entry.id)} writes` : entry.spec
            return (
              <tr key={entry.id} data-approve-row={entry.id}>
                <td style={{ ...TD, overflow: 'hidden' }}>
                  <Tooltip text={tip} display="block">
                    <span className="block truncate font-medium">{entry.spec}</span>
                  </Tooltip>
                </td>
                {!props.phone && (
                  <td style={TD}>
                    <code className="text-xs text-muted">{shortHash(entry.hash)}</code>
                  </td>
                )}
                {!props.phone && <td style={{ ...TD, ...NUM }}>{entry.tasks}</td>}
                <td style={{ ...TD, ...NUM }}>{writesOf(entry.id)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// While an Approve dialog is open, run `read` now and every REVIEW_POLL_MS.
// It reads Avoozl's own database only, never GitHub. A read still running
// skips the next tick.
function useOpenDialogReads(read: () => Promise<unknown>) {
  const latest = useRef(read)
  latest.current = read
  useEffect(() => {
    let running = false
    const tick = () => {
      if (running) return
      running = true
      latest.current().catch(() => undefined).finally(() => { running = false })
    }
    tick()
    const timer = setInterval(tick, REVIEW_POLL_MS)
    return () => clearInterval(timer)
  }, [])
}

// Approve one exact revision after showing its independent review evidence.
export function ApproveSpecDialog(props: { workspaceId: string; plan: SpecPlan; client: PlansClient; onDone: (text: string | null) => void; onOpenReview?: (planId: string, rev: string) => void }) {
  const { client, workspaceId } = props
  // The plan can move while the dialog is open (the planner writes a
  // revision). The dialog updates in place, and Approve always targets the
  // revision shown here (R104.13).
  const [plan, setPlan] = useState(props.plan)
  const [change, setChange] = useState<RevisionChange | null>(null)
  const [review, setReview] = useState(plan.review)
  const [showDiff, setShowDiff] = useState(false)
  const base = baseRevision(plan)
  const diffs = showDiff && base ? revisionDiff(base.files, plan.files) : []
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ repository: string; number: number; adopted?: boolean } | null>(null)
  const shown = useRef({ plan, review })
  shown.current = { plan, review }
  // Swap to the stored revision when it moved from the one on screen. The
  // Approve button resets, so approving it takes a new click.
  const update = async () => {
    const [fresh, next] = await Promise.all([client.get(workspaceId, plan.id), client.reviewSummary(workspaceId, plan.id)])
    const was = shown.current
    if (fresh.hash !== was.plan.hash) {
      setChange(revisionChange({ hash: was.plan.hash, files: was.plan.files, review: was.review }, { hash: fresh.hash, files: fresh.files, review: next }))
      setPlan(fresh)
      setShowDiff(false)
      setError(null)
    }
    if (next) setReview(next)
  }
  useOpenDialogReads(async () => {
    const next = await client.reviewSummary(workspaceId, plan.id)
    if (next?.planHash && next.planHash !== shown.current.plan.hash) await update()
    else if (next) setReview(next)
  })
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await client.approve(workspaceId, plan.id, plan.hash)
      if ('changed' in result) await update()
      else if (result.pending && result.approvalPullRequest) setPending(result.approvalPullRequest)
      else props.onDone(`Approved ${plan.spec || plan.title}.`)
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setBusy(false) }
  }
  return (
    <Modal id="avoozl-approve-spec" title={`Approve ${plan.spec || plan.title}?`} width="36rem" height="34rem" backLabel="Cancel" dismissLabel={pending ? 'Close' : 'Cancel'} focusClose attrs={{ 'data-approve-spec': true }} onDismiss={() => props.onDone(null)} footer={
      <>
        {!pending && <SmallBtn primary disabled={busy} onClick={() => void run()} attrs={{ 'data-approve-spec-go': true }}>Approve spec</SmallBtn>}
      </>
    }>
      <div className="flex flex-col gap-3 text-sm">
        <Hint as="p" flush>
          Approve exactly revision{' '}
          {base ? (
            <Tooltip text={`Show changes since ${base.approved ? 'the approved' : 'the previous'} revision ${shortHash(base.hash)}`}>
              <button type="button" className="underline" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }} aria-expanded={showDiff} onClick={() => setShowDiff(!showDiff)} data-revision-diff-toggle><code>{shortHash(plan.hash)}</code></button>
            </Tooltip>
          ) : <Tooltip text={plan.hash}><code>{shortHash(plan.hash)}</code></Tooltip>}
          . Review findings are evidence for your decision; they do not block approval.
        </Hint>
        {change && <RevisionChanged change={change} />}
        {showDiff && base && (
          <Stack data-revision-diff as="section" gap={2}>
            <Hint as="p" size="xs" flush>Changes since {base.approved ? 'approved' : 'previous'} revision <code>{shortHash(base.hash)}</code></Hint>
            {diffs.length ? diffs.map((entry) => (
              <Stack key={entry.file} gap={1}>
                <p className="m-0 text-xs font-medium"><code>{entry.file}</code></p>
                <DiffBlock diff={entry.diff} label={`Changes to ${entry.file}`} />
              </Stack>
            )) : <Hint as="p" flush>No file changed.</Hint>}
          </Stack>
        )}
        <PlanReviewSummary key={`${workspaceId}:${plan.id}:${plan.hash}`} review={review} onStart={() => client.reviewAnyway(workspaceId, plan.id, plan.hash)} reviewHref={reviewHref(window.location.pathname, plan.id, plan.hash)} onOpenReview={props.onOpenReview && (() => props.onOpenReview!(plan.id, plan.hash))} />
        {error && <ErrorText role="alert" flush>{error}</ErrorText>}
        {pending?.adopted && <p role="status" className="m-0" data-spec-pull-approved>Approved for merge. Avoozl merges <TextLink href={safeHref(`https://github.com/${pending.repository}/pull/${pending.number}`) ?? undefined} target="_blank" rel="noreferrer">{pending.repository}#{pending.number}</TextLink> when its checks pass, then records the approval.</p>}
        {pending && !pending.adopted && <p role="status" className="m-0">Nothing approved yet. Merge <TextLink href={safeHref(`https://github.com/${pending.repository}/pull/${pending.number}`) ?? undefined} target="_blank" rel="noreferrer">{pending.repository}#{pending.number}</TextLink>, then approve again.</p>}
      </div>
    </Modal>
  )
}

// Approve N specs: the exact revisions listed, together, all or none.
export function ApproveSpecsDialog(props: { workspaceId: string; entries: BatchEntry[]; client: PlansClient; onDone: (text: string | null) => void; onOpenReview?: (planId: string, rev: string) => void }) {
  // Each spec can move while the dialog is open; that entry updates in place
  // and Approve sends the revisions on screen (R104.13).
  const [entries, setEntries] = useState(props.entries)
  const [reviews, setReviews] = useState<Record<string, ReviewSummary | null>>({})
  const [changes, setChanges] = useState<Record<string, RevisionChange>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ApproveManyResult | null>(null)
  // Each spec's issue writes, from a scratch approval. Writes nothing.
  const [selection, setSelection] = useState<BatchSelection | null>(null)
  const phone = usePhone()
  const shown = useRef({ entries, reviews, selection })
  shown.current = { entries, reviews, selection }
  const reviewOf = (entry: BatchEntry) => reviews[entry.id] ?? selection?.specs.find((spec) => spec.id === entry.id)?.review ?? entry.review
  useEffect(() => {
    let live = true
    props.client.selection(props.workspaceId, entries.map((entry) => entry.id)).then(
      (value) => live && setSelection(value),
      () => undefined,
    )
    return () => {
      live = false
    }
    // Read once on open; a moved spec reads it again in update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Swap each moved spec to its stored revision, with what changed. The
  // Approve button resets, so approving takes a new click.
  const update = async (ids: string[], next: Record<string, ReviewSummary | null>) => {
    const was = shown.current
    const [picked, ...fresh] = await Promise.all([
      props.client.selection(props.workspaceId, was.entries.map((entry) => entry.id)).catch(() => null),
      ...ids.map((id) => props.client.get(props.workspaceId, id)),
    ])
    const moved: Record<string, RevisionChange> = {}
    const byId = new Map(fresh.map((plan) => [plan.id, plan]))
    for (const entry of was.entries) {
      const plan = byId.get(entry.id)
      if (!plan || plan.hash === entry.hash) continue
      const before = plan.history?.find((revision) => revision.hash === entry.hash)?.files
      moved[entry.id] = revisionChange({ hash: entry.hash, files: before, review: was.reviews[entry.id] ?? entry.review }, { hash: plan.hash, files: plan.files, review: next[entry.id] })
    }
    if (picked) setSelection(picked)
    setEntries((list) => list.map((entry) => {
      const plan = byId.get(entry.id)
      if (!plan || !moved[entry.id]) return entry
      const listed = picked?.specs.find((spec) => spec.id === entry.id)
      return { ...entry, ...(listed ?? {}), hash: plan.hash }
    }))
    setChanges((all) => ({ ...all, ...moved }))
    if (Object.keys(moved).length) { setResult(null); setError(null) }
  }
  // Re-read each spec's stored review; returns the specs whose revision moved.
  const read = async () => {
    const was = shown.current.entries
    const next = Object.fromEntries(await Promise.all(was.map(async (entry) => [entry.id, await props.client.reviewSummary(props.workspaceId, entry.id).catch(() => null)] as const)))
    const ids = was.filter((entry) => next[entry.id]?.planHash && next[entry.id]!.planHash !== entry.hash).map((entry) => entry.id)
    if (ids.length) await update(ids, next)
    setReviews((all) => ({ ...all, ...Object.fromEntries(Object.entries(next).filter(([, value]) => value)) }))
    return ids
  }
  useOpenDialogReads(read)
  const missing = missingOwners(entries)
  const tasks = entries.reduce((sum, entry) => sum + entry.tasks, 0)
  const label = `Approve ${entries.length} ${entries.length === 1 ? 'spec' : 'specs'}`
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const done = await props.client.approveMany(
        props.workspaceId,
        entries.map((entry) => ({ id: entry.id, expectedHash: entry.hash })),
      )
      if (done.ok) props.onDone(`Approved ${entries.length} ${entries.length === 1 ? 'spec' : 'specs'}.`)
      // A spec that moved shows its update instead of an error. A move
      // between that check and the call reads the same way; any other
      // refusal fails the batch as before.
      else if (done.changed?.length) await read()
      else if (done.pending || !(await read()).length) setResult(done)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const finished = Boolean(result?.pending)
  return (
    <Modal
      id="avoozl-approve-specs"
      width="36rem"
      height="34rem"
      title={label}
      backLabel="Cancel"
      dismissLabel={finished ? 'Close' : 'Cancel'}
      focusClose
      attrs={{ 'data-approve-specs': result ? (result.pending ? 'pending' : 'failed') : 'confirm' }}
      onDismiss={() => props.onDone(finished ? 'Nothing approved yet. Merge the approval pull request, then approve again.' : null)}
      footer={
        <>
          {!finished && (
            <SmallBtn primary disabled={busy || entries.length === 0} onClick={() => void run()} attrs={{ 'data-approve-specs-go': true }}>
              {label}
            </SmallBtn>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <Hint as="p" flush>
          {entries.length} {entries.length === 1 ? 'spec' : 'specs'}, {tasks} {tasks === 1 ? 'task' : 'tasks'}. Each revision below is approved exactly as shown, or none are.
        </Hint>
        {missing.length > 0 && (
          <p role="note" data-approve-missing className="m-0" style={{ color: 'var(--warning, var(--text))' }}>
            These need specs from an earlier batch that are still drafts: {missing.join(', ')}.
          </p>
        )}
        {error && (
          <ErrorText role="alert" flush>
            {error}
          </ErrorText>
        )}
        {result?.pending && (
          <Stack role="status" gap={1}>
            <p className="m-0">Nothing approved yet. These specs are approved through a pull request. Merge it, then approve again:</p>
            {result.approvalPullRequests?.map((pull) => (
              <TextLink key={pull.number} href={safeHref(`https://github.com/${pull.repository}/pull/${pull.number}`) ?? undefined} target="_blank" rel="noreferrer">
                {pull.repository}#{pull.number} ({pull.specs.length} specs)
              </TextLink>
            ))}
          </Stack>
        )}
        {result && !result.pending && (
          <Stack role="alert" gap={1}>
            <ErrorText flush>Nothing approved. These specs failed:</ErrorText>
            <ul className="m-0 flex flex-col gap-1 pl-5" style={{ listStyle: 'disc' }}>
              {result.failures.map((failure) => (
                <li key={failure.id}>
                  <span className="font-medium">{failure.spec ?? failure.id}</span>: {failure.error}
                </li>
              ))}
            </ul>
          </Stack>
        )}
        <ApproveTable entries={entries} selection={selection} phone={phone} />
        <Hint as="p" flush>Review findings are evidence for your decision; they do not block approval.</Hint>
        {entries.map((entry) => (
          <section key={entry.id} data-approve-review={entry.id} className="flex min-w-0 flex-col gap-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <h3 className="m-0 text-sm font-medium">{entry.spec}</h3>
            {changes[entry.id] && <RevisionChanged change={changes[entry.id]} />}
            <PlanReviewSummary key={`${props.workspaceId}:${entry.id}:${entry.hash}`} onStart={() => props.client.reviewAnyway(props.workspaceId, entry.id, entry.hash)} review={reviewOf(entry)} reviewHref={reviewHref(window.location.pathname, entry.id, entry.hash)} onOpenReview={props.onOpenReview && (() => props.onOpenReview!(entry.id, entry.hash))} />
          </section>
        ))}
      </div>
    </Modal>
  )
}

export default function PlansView(props: {
  workspaceId: string | null
  onScope?: (target: PlanTarget, filter: TaskFilter) => void
  onDrill?: (drill: Drill) => void
  // Bumped by the header's Plan a goal: open the New plan drawer.
  newPlanRequest?: { n: number; seed?: Partial<NewPlanForm> }
  // The rail's Repositories Edit: Settings › Repository setup.
  onOpenSettings?: (section: string) => void
}) {
  const workspace = props.workspaceId
  const api = useAppApi()
  const { openChat } = useChatLauncher()
  const plans = useMemo(() => plansClient(api), [api])
  const projections = useMemo(() => projectionClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])
  const reviews = useMemo(() => reviewClient(api), [api])
  const drawer = useTaskDrawer()
  const chat = useAskChat(workspace)
  const phone = usePhone()
  const navigate = useNavigate()
  const reveal = useReveal()
  const settings = useMemo(() => settingsClient(api), [api])
  // The repository that holds spec folders, for Open on GitHub: the plans
  // repository in plans-repo mode, else the one code repository a spec's
  // tasks name. Null in Local only mode.
  const [specHome, setSpecHome] = useState<{ mode: string; planning: string | null } | null>(null)
  useEffect(() => {
    setSpecHome(null)
    if (!workspace) return
    settings.get(workspace).then(
      (value) => {
        const github = (value.effective ?? value.github) as { mode?: string; planningRepository?: string }
        setSpecHome({ mode: github.mode ?? 'local', planning: github.planningRepository ?? null })
      },
      () => undefined,
    )
  }, [settings, workspace])
  const { scrolledOut, titleRef } = useTitleScrolledOut()
  const [deleting, setDeleting] = useState<PlanRow | null>(null)
  const [archiving, setArchiving] = useState<PlanRow | null>(null)
  const [creating, setCreating] = useState<{ seed?: Partial<NewPlanForm> } | null>(null)
  useEffect(() => {
    if (props.newPlanRequest?.n) setCreating({ seed: props.newPlanRequest.seed })
  }, [props.newPlanRequest])
  const [notice, setNotice] = useState<string | null>(null)
  const [table, setTable] = useState<PlanTable | null>(null)
  // Draft specs' approval batches, read again whenever the table loads.
  const [batches, setBatches] = useState<ApprovalBatches | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState<{workspaceId: string; entries: BatchEntry[]} | null>(null)
  // Adopted spec pull requests, read again whenever the table loads (R107.4).
  const [pulls, setPulls] = useState<SpecPull[]>([])
  useEffect(() => {
    if (!workspace || !table) return
    let live = true
    specPullClient(api).view(workspace).then(
      (items) => live && setPulls(items),
      () => live && setPulls([]),
    )
    return () => {
      live = false
    }
  }, [workspace, table, api])
  useEffect(() => {
    if (!workspace || !table) return
    let live = true
    plans.batches(workspace).then(
      (value) => {
        if (!live) return
        setBatches(value)
        // A spec that left the drafts can't stay picked.
        const ids = batchNumbers(value)
        setChecked((previous) => new Set([...previous].filter((id) => ids.has(id))))
      },
      () => live && setBatches(null),
    )
    return () => {
      live = false
    }
  }, [workspace, table, plans])
  // Opening a plan is a Back step; Back from another tab reopens it.
  const [selected, openPlan, setSelected] = useSteppedState<string | null>(
    'plans-selected',
    'select',
    (previous) => (previous ? 'Back to the spec' : 'Back to all specs'),
    null,
  )
  const shownWorkspace = useRef(workspace)
  const [filter, setFilter] = useState<PlanListFilter>({})
  const [order, setOrder] = useState<SpecOrder>({ sort: 'name', dir: 'asc' })
  const [plan, setPlan] = useState<SpecPlan | null>(null)
  const [singleApproval, setSingleApproval] = useState<{ workspaceId: string; plan: SpecPlan } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [projection, setProjection] = useState<ProjectionPreview | null>(null)
  const [dialog, setDialog] = useState<'project' | 'changed' | null>(null)
  const [docs, setDocs] = useState<SpecDocuments | null>(null)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [planGraph, setPlanGraph] = useState<Graph | null>(null)
  const [text, setText] = useState<{ text: string | null; error: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped once the workspace's extra grammars load, so code redraws.
  const [, setGrammars] = useState(0)
  const detailTop = useRef<HTMLDivElement>(null)
  // Home, End and the page keys scroll the pane under the mouse.
  const pageRef = useRef<HTMLElement>(null)
  usePaneKeys(pageRef, !phone)

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
      setSingleApproval(null)
      setApproving(null)
      setChecked(new Set())
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
  // The open spec's Review view (R104.9), kept in the page address on
  // Kiro Crew's route. A pasted ?view=review&plan=P link opens it once.
  const [review, setReview] = useState<ReviewPlace | null>(null)
  // The other tabs: Overview, Tasks and one per spec document, in the address
  // as the spec id plus tab=T. Review has its own link. Back and Forward walk them.
  const [specAt, setSpecAt] = useState<{ plan: string; tab: string }>({ plan: '', tab: 'overview' })
  const reviewLinkRead = useRef(false)
  const readAddress = useCallback(() => {
    const link = parseReviewLink(window.location.search)
    if (link) {
      setReview(link)
      return link.plan
    }
    const at = parseSpecTab(window.location.search)
    setReview(null)
    setSpecAt(at ?? { plan: '', tab: 'overview' })
    return at?.plan ?? null
  }, [])
  useEffect(() => {
    if (!table || reviewLinkRead.current) return
    reviewLinkRead.current = true
    const plan = readAddress(),
      found = plan && table.items.find((item) => item.planId === plan)
    if (found) setSelected(found.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])
  useEffect(() => {
    const onPop = () => {
      const plan = readAddress()
      const found = plan && table?.items.find((item) => item.planId === plan)
      if (found) setSelected(found.key)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, readAddress])
  const goAddress = (link: string) => {
    const base = urlBase(window.location.pathname)
    if (!base) return
    try {
      navigate(base + link)
    } catch {
      // The address is a convenience; the view still changes.
    }
  }
  const placeReview = (next: ReviewPlace | null) => {
    setReview(next)
    if (next) goAddress(reviewLink(next))
  }
  const reviewing = review && row?.planId === review.plan ? review : null
  // A new spec opens on its Overview.
  useEffect(() => {
    if (review && row?.planId !== review.plan) setReview(null)
  }, [row?.planId, review])
  const specTab = specAt.plan === row?.planId ? specAt.tab : 'overview'
  const pickTab = (next: string) => {
    const id = row?.planId
    if (!id || !workspace) return
    if (next === 'review') return placeReview({ plan: id, rev: null, file: null, severity: [], state: [] })
    if (reviewing) {
      // Decisions change the Summary's open counts: re-read the plan in place.
      plans.get(workspace, id).then((fresh) => setPlan((shown) => (shown?.id === id ? fresh : shown)), () => undefined)
    }
    setReview(null)
    setSpecAt({ plan: id, tab: next })
    goAddress(specTabLink(id, next))
  }
  // An Approve dialog's Open review: the spec's Review view at the revision
  // the dialog showed. The caller closes the dialog.
  const openReview = (planId: string, rev: string) => {
    const found = table?.items.find((item) => item.planId === planId)
    if (found) setSelected(found.key)
    placeReview({ plan: planId, rev, file: null, severity: [], state: [] })
  }
  // The Review view folds the specs list so the text and its rail sit side
  // by side; the bar brings the list back until the view is opened again.
  const [reviewList, setReviewList] = useState(false)
  useEffect(() => setReviewList(false), [reviewing?.plan])
  const listFolded = reviewing && !reviewList ? { label: 'Show the specs list', onUnfold: () => setReviewList(true) } : undefined
  // Who drives the open spec (§6.10): the chip, banner and Hand off.
  const driver = useDriver(workspace, row?.planId ?? null)
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
  // While the reviewer writes the summary, read the plan again until it lands.
  const summaryPending = plan?.review?.state === 'running' && !plan.review.summary?.current
  const pendingId = plan?.id
  useEffect(() => {
    if (!summaryPending || !workspace || !pendingId) return
    let live = true
    const timer = setInterval(() => {
      plans.get(workspace, pendingId).then((stored) => live && setPlan((now) => (now?.id === stored.id ? stored : now)), () => undefined)
    }, REVIEW_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [summaryPending, workspace, pendingId, plans])
  const retrySummary = () => {
    if (!workspace || !row) return
    const review = plan?.review
    void attempt(async () => {
      if (plan && review?.canReviewAnyway) await plans.reviewAnyway(workspace, plan.id, plan.hash)
      await loadPlan(workspace, row.planId)
    })
  }
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
  const batchOf = batchNumbers(batches)
  const rows = table ? filterRows(table.items, filter, batchOf) : []
  const pickable = rows.flatMap((item) => (item.planId && batchOf.has(item.planId) ? [item.planId] : []))
  const allPicked = pickable.length > 0 && pickable.every((id) => checked.has(id))
  const entries = (batches?.batches ?? []).flatMap((batch) => batch.specs).filter((entry) => checked.has(entry.id))
  const specActions = (row: PlanRow): SpecActions => {
    const actions = rowActions(row)
    const blocker = approveBlocker(plan)
    const repos = [...new Set((planGraph?.tasks ?? []).map((t) => t.repository).filter((name): name is string => Boolean(name)))]
    const home = specHome?.mode === 'plans-repo' ? specHome.planning : specHome?.mode === 'single-repo' && repos.length === 1 ? repos[0] : null
    const repoHref = githubHref(home)
    return {
      onEdit: () => change(row),
      onDiscuss: () => void chat.ask(discussSeed(row)),
      onNewTask: () => drawer.addTask(),
      onImport: actions.importable ? () => importRow(row) : undefined,
      onReload: plan?.disk.changed ? () => act((workspaceId) => plans.reload(workspaceId, plan.id, plan.hash)) : undefined,
      onApprove: plan && workspace ? () => setSingleApproval({ workspaceId: workspace, plan }) : undefined,
      approveBlocker: plan ? blocker : null,
      onSpecBuilder: row.spec ? () => openSpecBuilder(row.spec!, navigate) : undefined,
      onGraph: actions.scoped ? () => scope('graph', row) : undefined,
      onFolder: table?.root && row.folder ? () => void reveal(`${table.root!.replace(/\/$/, '')}/${row.folder}`).then(setNotice) : undefined,
      github: repoHref && row.folder ? `${repoHref}/tree/HEAD/${row.folder}` : null,
      onDelete: actions.deletable ? () => setDeleting(row) : undefined,
      onArchive: actions.archivable ? () => setArchiving(row) : undefined,
      onUnarchive: actions.unarchivable ? () => unarchive(row) : undefined,
    }
  }

  const tabNames = specTabNames(docs, Boolean(plan))
  const shownTab = reviewing ? 'review' : specTab
  const specTabs =
    plan && row?.planId ? (
      <SpecTabs tabs={tabNames.includes(shownTab) ? tabNames : [...tabNames.slice(0, -1), shownTab, 'review']} current={shownTab} plan={plan} onPick={pickTab} />
    ) : null
  const specHeader = row ? (
    <SpecHeader
      row={row}
      plan={plan}
      busy={busy}
      flush={phone}
      driver={<DriverChip spec={driver.spec} />}
      handOff={workspace ? <HandOffButton workspaceId={workspace} spec={driver.spec} onChanged={driver.reload} /> : null}
      actions={specActions(row)}
    />
  ) : null
  // The specs list column.
  const specList = (
    <Stack gap={3} data-plans-list-pane>
      <ViewHeading
        id="avoozl-plans-title"
        view="plans"
        phoneMenu
        actions={
          <PlansActions onNewPlan={() => setCreating({})} onRefresh={() => workspace && void load(workspace)} busy={busy} />
        }
      >
        Specs
      </ViewHeading>
      {table && table.items.length > 0 && (
        <PlanFilters filter={filter} rows={table.items} batches={batches?.batches.length ?? 0} order={order} onOrder={setOrder} onChange={setFilter}>
          <Hint size="xs" role="status">
            {rows.length} of {table.items.length} specs
          </Hint>
        </PlanFilters>
      )}
      {pickable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1" data-approve-bar>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              data-select-shown
              checked={allPicked}
              ref={(el) => {
                if (el) el.indeterminate = !allPicked && pickable.some((id) => checked.has(id))
              }}
              onChange={(event) =>
                setChecked((previous) => {
                  const next = new Set(previous)
                  for (const id of pickable) {
                    if (event.target.checked) next.add(id)
                    else next.delete(id)
                  }
                  return next
                })
              }
            />
            Select all shown
          </label>
          <span className="flex-1" />
          <SmallBtn primary disabled={entries.length === 0 || busy} onClick={() => { if (workspace) setApproving({workspaceId:workspace,entries}) }} attrs={{ 'data-approve-specs-open': true }}>
            Approve {entries.length} {entries.length === 1 ? 'spec' : 'specs'}
          </SmallBtn>
        </div>
      )}
      <Stack gap={2} data-plans-list>
        {table === null ? (
          <Hint as="p" size="sm">{busy ? 'Loading…' : 'Not loaded'}</Hint>
        ) : table.items.length === 0 ? (
          <Hint as="p" size="sm">
            No specs yet{table.root ? ` in ${table.root}/.kiro/specs` : ''}. Use New spec to start one.
          </Hint>
        ) : rows.length ? (
          <SpecList
            rows={rows}
            selected={row?.key ?? null}
            onOpen={open}
            order={order}
            reset={JSON.stringify(filter)}
            batchOf={batchOf}
            checked={checked}
            onCheck={(id, on) =>
              setChecked((previous) => {
                const next = new Set(previous)
                if (on) next.add(id)
                else next.delete(id)
                return next
              })
            }
          />
        ) : (
          <Hint as="p" size="sm">No spec matches these filters.</Hint>
        )}
        {table?.problem && <p className="mt-2 text-xs text-muted">Spec folders: {table.problem}</p>}
      </Stack>
    </Stack>
  )
  const specRail = row ? (
    <SpecRail
      row={row}
      plan={plan}
      graph={planGraph}
      docs={docs}
      onEdit={() => change(row)}
      onRepositories={props.onOpenSettings ? () => props.onOpenSettings!('repositories') : undefined}
      onDrill={(drill) => props.onDrill?.(drill)}
      onOpenTask={(id) => drawer.openTask(id)}
    />
  ) : null
  const specContent = row ? (
    <>
      {specHeader}
      {specTabs}
      <div data-spec-body style={{ padding: phone ? '20px 0' : '20px 12px 20px 12px', ...(phone ? {} : { flex: '1 1 0%', minHeight: 0, overflowY: 'auto', position: 'relative' }) }}>
        <div id="avoozl-plan-main" className="flex min-w-0 flex-col" style={{ gap: 20, scrollMarginTop: 48 }}>
          <RadarGraphLink />
          <ArchivedBanner row={row} busy={busy} onUnarchive={() => unarchive(row)} />
          {workspace && <DriverBanner workspaceId={workspace} spec={driver.spec} onChanged={driver.reload} />}
          <SetupList spec={driver.spec} />
          {row.categoryProblem && (
            <Hint as="p" size="sm">
              <Badge variant="warning">front-matter</Badge> {row.categoryProblem}
            </Hint>
          )}
          {spec ? (
            <SpecDetail
              docs={docs}
              docsError={docsError}
              spec={spec}
              plan={plan}
              preview={preview}
              projection={projection}
              graph={planGraph}
              busy={busy}
              onProjection={() => plan && workspace && void attempt(async () => setProjection(await plans.projection(workspace, plan.id)))}
              onProject={() => setDialog('project')}
              onChanged={() => setDialog('changed')}
              onOpenTask={(id) => drawer.openTask(id)}
              onRetrySummary={retrySummary}
              onReview={row.planId ? () => pickTab('review') : undefined}
              pull={pulls.find((pull) => pull.spec === row.spec) ?? null}
              workspaceId={workspace}
              onApprovePull={() => workspace && plan && setSingleApproval({ workspaceId: workspace, plan })}
              onPullChanged={() => workspace && void load(workspace)}
              tab={specTab}
              details={<SpecDetailsBox>{specRail}</SpecDetailsBox>}
              onTasks={() => pickTab('tasks')}
            />
          ) : (
            <>
              <SpecCard title="Summary">
                <Hint as="p" size="xs">
                  <code>{row.planId}</code> · written before the spec layout, so it has no folder. Its tasks show in the spec graph.
                </Hint>
                <div className="mt-2">
                  {!text ? (
                    <Hint as="p" size="sm">Loading…</Hint>
                  ) : text.error ? (
                    <ErrorText size="sm">{text.error}</ErrorText>
                  ) : text.text ? (
                    <Markdown text={text.text} measure={PROSE_MEASURE} />
                  ) : (
                    <Hint as="p" size="sm">This spec has no text.</Hint>
                  )}
                </div>
              </SpecCard>
              <SpecDetailsBox>{specRail}</SpecDetailsBox>
              <PhaseTasks graph={planGraph} onOpenTask={(id) => drawer.openTask(id)} />
            </>
          )}
        </div>
      </div>
    </>
  ) : null
  return (
    <section ref={pageRef} aria-labelledby="avoozl-plans-title" className="flex flex-col gap-3.5">
      {singleApproval && singleApproval.workspaceId === workspace && (
        <ApproveSpecDialog workspaceId={singleApproval.workspaceId} plan={singleApproval.plan} client={plans} onOpenReview={(planId, rev) => { setSingleApproval(null); openReview(planId, rev) }} onDone={(text) => {
          if (shownWorkspace.current !== singleApproval.workspaceId) return
          setSingleApproval(null)
          if (text === null) return
          setNotice(text)
          void load(singleApproval.workspaceId)
          void loadPlan(singleApproval.workspaceId, singleApproval.plan.id)
        }} />
      )}
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
      {approving && approving.workspaceId === workspace && (
        <ApproveSpecsDialog
          key={approving.workspaceId}
          workspaceId={approving.workspaceId}
          entries={approving.entries}
          client={plans}
          onOpenReview={(planId, rev) => { setApproving(null); openReview(planId, rev) }}
          onDone={(text) => {
            if (shownWorkspace.current !== approving.workspaceId) return
            setApproving(null)
            if (text === null) return
            setNotice(text)
            setChecked(new Set())
            void load(workspace)
          }}
        />
      )}
      {creating && workspace && (
        <NewPlanDrawer
          workspaceId={workspace}
          seed={creating.seed}
          taken={(table?.items ?? []).flatMap((item) => [item.spec, item.planId]).filter((name): name is string => Boolean(name))}
          categories={[...new Set((table?.items ?? []).map((item) => item.category).filter((name): name is string => Boolean(name)))].sort()}
          epics={(table?.items ?? []).filter((item) => item.kind === 'epic' && item.spec).map((item) => ({ id: item.spec!, title: item.name }))}
          onClose={(text) => {
            setCreating(null)
            if (text) setNotice(text)
          }}
        />
      )}
      {notice && <Hint role="status" as="p" size="sm">{notice}</Hint>}
      {(error || chat.error) && (
        <ErrorText role="alert" size="sm">
          {error ?? chat.error}
        </ErrorText>
      )}
      <p role="status" className="sr-only">
        {busy ? 'Working…' : ''}
      </p>
      {!workspace ? (
        <Hint as="p" size="sm">Choose a workspace in the header.</Hint>
      ) : (
        <ListDetailLayout
          id="specs"
          listFolded={listFolded}
          fill
          backLabel="All specs"
          detailTitle={row?.name ?? ''}
          detailOwnTitle
          onBack={() => openPlan(null)}
          list={
            specList
          }
          detail={
            !row ? null : (
              <div className="flex flex-col" data-spec-detail={row.key} ref={detailTop} style={phone ? undefined : { flex: '1 1 0%', minHeight: 0 }}>
                {reviewing && workspace ? (
                  <>
                    {specHeader}
                    {specTabs}
                    <ReviewView key={`${workspace}:${reviewing.plan}`} workspaceId={workspace} client={reviews} place={reviewing} onPlace={placeReview} fill={!phone} />
                  </>
                ) : (
                  specContent
                )}
              </div>
            )
          }
        />
      )}
      {dialog && workspace && plan && (
        <>
          {dialog === 'project' && (
            <ProjectionModal
              workspaceId={workspace}
              client={projections}
              planId={plan.id}
              title={plan.title}
              onClose={() => setDialog(null)}
              onCreated={() => void loadPlan(workspace, plan.id)}
            />
          )}
          {dialog === 'changed' && (
            <SpecChangedModal
              workspaceId={workspace}
              client={projections}
              planId={plan.id}
              title={plan.title}
              onClose={() => setDialog(null)}
              onApplied={() => void loadPlan(workspace, plan.id)}
            />
          )}
        </>
      )}
    </section>
  )
}
