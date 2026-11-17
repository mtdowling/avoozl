// The Plans view's calls to Avoozl's app backend and its pure helpers. Plans
// are Kiro spec folders; approval is of one stored revision, named by the hash
// of the folder's files. Keep this module free of JSX and runtime imports so
// node can test it directly.
import { unifiedDiff } from '../../../src/app/text-diff.mjs'
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { SEVERITIES, STATES } from './review-view.ts'
import type { TaskOwner } from './views-api.ts'

export interface Counts {
  error: number
  warning: number
  info: number
}

export interface Finding {
  kind: string
  task: string | null
  text: string
  line: number
}

export interface Critique {
  reviewedHash: string | null
  current: boolean
  findings: Finding[]
}

export interface SpecSummary {
  name: string
  folder: string
  type: 'feature' | 'bugfix' | null
  hash: string | null
  files: string[]
  counts: Counts
  taskCount: number
  critique: Critique | null
  plan: {
    id: string
    state: string
    hash: string
    revision: number
    changed: boolean
    approved: boolean
  } | null
}

export interface SpecList {
  root: string
  items: SpecSummary[]
}

export interface Diagnostic {
  id: string
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  lineStart: number
  taskId?: string
}

export interface SpecPlan {
  id: string
  spec: string
  title: string
  hash: string
  revision: number
  state: string
  files: Record<string, string>
  quality: { canApprove: boolean; counts: Counts; diagnostics: Diagnostic[] }
  disk: { folder: string; exists: boolean; hash: string | null; changed: boolean; critique: Critique | null }
  approvals: { id: string; hash: string; at: string; approvedBy: string }[]
  // Earlier revisions, oldest first; a spec revision keeps its files.
  history?: { revision: number; hash: string; files?: Record<string, string> }[]
  review?: PlanReviewSummary | null
}

export interface PlanReviewSummary {
  state: 'not-reviewed' | 'running' | 'done' | 'skipped'
  // The stored revision now, which can move while a dialog shows another.
  planHash?: string
  reviewerModel: string | null
  writerModel?: string | null
  revisionHash: string | null
  current: boolean
  found: number
  fixed: number
  forYou: number
  bySeverity?: Record<string, number>
  // Findings not yet fixed or closed, by severity: the spec Summary's badges.
  openBySeverity?: Record<string, number>
  byState?: Record<string, number>
  // The reviewer's plain summary of the spec, stored with its round; not
  // current when it was written for an earlier revision.
  summary?: { text: string; revisionHash: string; current: boolean } | null
  note: string | null
  unproven?: boolean
  canReviewAnyway?: boolean
  // The pass reached planReview.rounds; Review anyway runs one more round.
  capped?: boolean
  open: {
    id: string
    roundId: string
    revisionHash: string
    current: boolean
    kind: string
    severity: string
    state?: string
    // Its lines in the current revision, or moved.
    anchor?: { file: string; lineStart: number; lineEnd: number; moved?: boolean }
    file: string
    line: number
    claim: string
    evidence: string
    answer: { action: 'fixed' | 'answered'; revisionHash?: string; text: string; at: string } | null
  }[]
}

export interface Preview {
  reviewedHash: string
  expectedRevision: number
  tasks: ({ localId: string; taskId: string; title: string; existing: boolean; lineStart: number } & TaskOwner)[]
  dependencies: { kind: string; from: string; to: string }[]
  // Checked [x] tasks.md items approval creates as accepted.
  baseline?: { count: number; taskIds: string[]; text: string }
  review?: PlanReviewSummary | null
}

// One write a projection would make (`github.project.preview`). `issue` is
// null for an issue the projection would create.
export interface PlannedWrite {
  kind: string
  repository: string | null
  taskId: string | null
  issue: number | null
  title?: string
  labels?: string[]
  assignees?: string[]
  type?: string
  fields?: string[] | Record<string, string | number | null>
  childTaskId?: string | null
  blockerTaskId?: string | null
}

export interface ProjectionPreview {
  planId: string
  planHash: string
  writes: PlannedWrite[]
  // How long the writes take at the pace GitHub allows (github-pacer.mjs).
  pace?: { writes: number; perMinute: number; perHour: number; finishAt: string; minutes: number }
  conflicts: { taskId: string; field: string; reason: string }[]
  notes: string[]
  previewOnly: string[]
  project: { status: string; problems?: string[]; reason?: string; fix?: string }
}

export interface StoredPlan {
  id: string
  title: string | null
  state: string
  kind: string | null
  revision: number
  hash: string
  updatedAt: string | null
  // Set while archived (plan.archive); older backends omit it.
  archivedAt?: string | null
}

export interface StoredPlanPage {
  items: StoredPlan[]
  total: number
}

// Stored plans no spec folder on disk stands for: plans written before the
// spec layout (Nupp's), or whose folder was removed. The view lists them so
// a workspace with no spec folders still shows its plans.
export function plansWithoutFolder(specs: SpecList | null, stored: StoredPlanPage | null): StoredPlan[] {
  const claimed = new Set((specs?.items ?? []).flatMap((spec) => (spec.plan ? [spec.plan.id] : [])))
  return (stored?.items ?? []).filter((plan) => !claimed.has(plan.id))
}

// One row of the Plans table (`plan.table`): a spec folder, or a stored
// plan with no folder. `category` is what the plan's front-matter says, or
// null; Avoozl never guesses one.
export interface PlanRow {
  key: string
  // An epic folder lists member plans (Requirement 59.1).
  kind: 'spec' | 'old-style' | 'epic'
  name: string
  spec: string | null
  folder: string | null
  planId: string | null
  type: 'feature' | 'bugfix' | null
  category: string | null
  categoryProblem: string | null
  // Where the spec lives when a private mirror is set (RC25.2).
  home?: 'main' | 'plansBranch'
  errors: number
  status: string
  tasks: { total: number; done: number }
  now: { ready: number; running: number; needsYou: number }
  // How many phases its tasks fall in; older backends omit it.
  phases?: number
  // Any of its tasks has a GitHub issue; older backends omit it.
  onGitHub?: boolean
  // The epic it belongs to, both sides agreeing; null is No epic.
  epic?: string | null
  epicTitle?: string | null
  // An epic folder's member plans, in its order.
  members?: { key: string; plan: string; summary: string; title: string }[]
  lastChange: string | null
  // Set while the plan is archived (plan.archive); older backends omit it.
  archived?: { at: string; by: string | null } | null
  // The plan's own events (archived, unarchived), newest first.
  timeline?: { action: string; by: string | null; at: string }[]
}

export interface PlanTable {
  root: string | null
  problem: string | null
  specs: SpecSummary[]
  revision: number
  items: PlanRow[]
}

export const UNCATEGORIZED = 'Uncategorized'

// Rows grouped by category, categories in alphabetical order and
// Uncategorized last; rows inside a group by name.
export function groupByCategory(rows: PlanRow[]): { category: string; rows: PlanRow[] }[] {
  const groups = new Map<string, PlanRow[]>()
  for (const row of rows) {
    const key = row.category ?? UNCATEGORIZED
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups]
    .sort(([a], [b]) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b)))
    .map(([category, list]) => ({ category, rows: list.sort((a, b) => a.name.localeCompare(b.name)) }))
}

// Done over total leaf tasks, as a whole percent; null when there are none,
// which the table shows as "no tasks" rather than 0%.
export function progressPercent(tasks: { total: number; done: number }): number | null {
  if (!tasks.total) return null
  return Math.round((tasks.done / tasks.total) * 100)
}

// Which row buttons apply. Review opens the plan to store or approve it.
export function rowActions(row: PlanRow) {
  return {
    review: row.kind === 'spec' && ['not imported', 'draft', 'changed'].includes(row.status),
    // A spec folder Avoozl has never stored: Import stores it as a draft
    // plan (plan.create). It approves nothing and starts nothing.
    importable: row.kind === 'spec' && row.status === 'not imported' && Boolean(row.spec),
    scoped: Boolean(row.planId || row.spec),
    // Only a stored plan can be deleted (plan.delete); a folder never imported has nothing to delete.
    deletable: Boolean(row.planId),
    // The same for archive (plan.archive); an archived one offers Unarchive.
    archivable: Boolean(row.planId) && !row.archived,
    unarchivable: Boolean(row.planId && row.archived),
  }
}

// The chat draft that changes one plan. The user reviews it before sending.
export function changeMessage(row: PlanRow): string {
  const target = row.spec
    ? `the existing spec folder .kiro/specs/${row.spec}/${row.planId ? ` (plan ${row.planId})` : ''}`
    : `the stored spec ${row.planId}, which has no spec folder yet; move it to .kiro/specs/<name>/ first`
  return `Use the Avoozl skill's "Plan a goal" steps 2 to 4 to change ${target}. Ask me what should change. Edit it in a planner session, critique it in a second isolated session, store the new revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Specs view.`
}

export function plansClient(api: AppApi) {
  const run = async <T>(
    workspaceId: string,
    operation: string,
    input: Record<string, unknown> = {},
  ): Promise<T> => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  const preview = (workspaceId: string, id: string) => run<Preview>(workspaceId, 'plan.preview', { id })
  return {
    specs: (workspaceId: string) => run<SpecList>(workspaceId, 'plan.specs'),
    // One row per plan for the Plans table.
    table: (workspaceId: string) => run<PlanTable>(workspaceId, 'plan.table'),
    // Every stored plan, including those written before spec folders.
    stored: (workspaceId: string) => run<StoredPlanPage>(workspaceId, 'plan.list', { limit: 100 }),
    get: (workspaceId: string, id: string) => run<SpecPlan>(workspaceId, 'plan.get', { id }),
    // A spec folder's requirements (or bugfix), design and tasks, to read.
    documents: (workspaceId: string, name: string) => run<SpecDocuments>(workspaceId, 'plan.spec.read', { name }),
    // An older stored plan's Markdown body.
    text: (workspaceId: string, id: string) =>
      run<{ id: string; title: string | null; text: string | null }>(workspaceId, 'plan.get', { id }).then((plan) => plan.text ?? ''),
    // Store the folder on disk as a draft plan named after it.
    store: (workspaceId: string, spec: string) => run<SpecPlan>(workspaceId, 'plan.create', { spec }),
    reload: (workspaceId: string, id: string, expectedHash: string) =>
      run<SpecPlan>(workspaceId, 'plan.save', { id, expectedHash }),
    preview,
    // Archive a plan, or bring it back (plan.archive, plan.unarchive). Both
    // are reversible and only a person calls them.
    archive: (workspaceId: string, id: string) =>
      run<{ id: string; held: number; running: number; decisions: number }>(workspaceId, 'plan.archive', { id }),
    unarchive: (workspaceId: string, id: string) =>
      run<{ id: string; released: number; decisions: number }>(workspaceId, 'plan.unarchive', { id }),
    // What deleting a plan would do (plan.delete.preview); writes nothing.
    deletePreview: (workspaceId: string, id: string) => run<DeletePreview>(workspaceId, 'plan.delete.preview', { id }),
    // Delete it. A plan with an approved revision needs retire: true, sent
    // only after the person confirmed the dialog that says what happens.
    remove: (workspaceId: string, id: string, input: { retire: boolean; deleteSpecFolder: boolean }) =>
      run<DeleteResult>(workspaceId, 'plan.delete', { id, ...input }),
    // Extra code-fence grammars the workspace names (.avoozl.json
    // highlight.languages), as data for highlight.ts.
    languages: (workspaceId: string) =>
      run<{ languages: Record<string, { tokens: { type: string; pattern: string; flags?: string }[] }>; problems: string[] }>(
        workspaceId,
        'highlight.languages',
      ),
    // Every GitHub write projecting this approved plan would make; none is made.
    projection: (workspaceId: string, planId: string) =>
      run<ProjectionPreview>(workspaceId, 'github.project.preview', { planId }),
    // Approve exactly the revision the user is looking at. The backend refuses
    // a changed hash, a changed database, or a folder that moved on disk.
    // Draft specs in the order they can be approved (plan.approvalBatches).
    batches: (workspaceId: string) => run<ApprovalBatches>(workspaceId, 'plan.approvalBatches'),
    reviewAnyway: (workspaceId: string, planId: string, revisionHash: string) => run(workspaceId, 'plan.review.decide', { planId, revisionHash, action: 'review', unproven: true }),
    reviewSummary: (workspaceId: string, planId: string) => run<PlanReviewSummary | null>(workspaceId, 'plan.reviewSummary', { planId }),
    // What approving just these would do, with each one's issue writes. Writes nothing.
    selection: (workspaceId: string, ids: string[]) =>
      run<ApprovalBatches & { selection: BatchSelection }>(workspaceId, 'plan.approvalBatches', { ids }).then((value) => value.selection),
    // Approve exactly these revisions together, all or none (plan.approveMany).
    // A spec whose stored revision moved since it was shown comes back in
    // `changed`, and nothing is sent: the dialog shows that spec's update.
    approveMany: async (workspaceId: string, items: { id: string; expectedHash: string }[]): Promise<ApproveManyResult> => {
      const shown = await Promise.all(items.map(async (item) => ({ item, preview: await preview(workspaceId, item.id) })))
      const changed = shown.filter(({ item, preview }) => preview.reviewedHash !== item.expectedHash).map(({ item, preview }) => ({ id: item.id, preview }))
      if (changed.length) return { ok: false, failures: [], changed }
      return run<ApproveManyResult>(workspaceId, 'plan.approveMany', { items })
    },
    // A revision that moved since it was shown comes back as `changed`
    // instead of an error, so the dialog updates in place. plan.approve still
    // refuses a stale hash; a move between this check and that call reads as
    // the same change.
    approve: async (workspaceId: string, id: string, expectedHash: string): Promise<ApproveOneResult | { changed: Preview }> => {
      const shown = await preview(workspaceId, id)
      if (shown.reviewedHash !== expectedHash) return { changed: shown }
      try {
        return await run<ApproveOneResult>(workspaceId, 'plan.approve', {
          id,
          expectedHash,
          expectedRevision: shown.expectedRevision,
        })
      } catch (caught) {
        const again = await preview(workspaceId, id).catch(() => null)
        if (again && again.reviewedHash !== expectedHash) return { changed: again }
        throw caught
      }
    },
  }
}

export type PlansClient = ReturnType<typeof plansClient>

// One draft spec in plan.approvalBatches: the batch it can be approved in.
export interface BatchEntry {
  id: string
  spec: string
  title: string
  hash: string
  batch: number
  tasks: number
  errors: number
  // It shares a loop with other specs in its batch.
  loop: boolean
  // Draft specs whose tasks it needs, by name.
  needs: string[]
  review?: PlanReviewSummary | null
}
export interface ApproveOneResult {
  id: string
  hash: string
  pending?: boolean
  approvalPullRequest?: { repository: string; number: number; branch: string }
}
export interface ApprovalBatches {
  batches: { batch: number; specs: BatchEntry[] }[]
}
// plan.approvalBatches {ids}: approving just these, tried on a scratch
// copy. `writes` counts the GitHub issue writes projecting each would make.
export interface BatchSelection {
  ok: boolean
  specs: (BatchEntry & { writes?: number | null; writesError?: string; pullRequest?: boolean })[]
  writes: number
  failures: { id: string; spec: string | null; error: string }[]
  missing: string[]
}
export interface ApproveManyResult {
  ok: boolean
  pending?: boolean
  failures: { id: string; spec: string | null; error: string }[]
  approvalPullRequests?: { repository: string; number: number; branch: string; specs: string[] }[]
  // Specs whose revision moved since the dialog showed them; nothing was sent.
  changed?: { id: string; preview: Preview }[]
}

// What changed while an Approve dialog was open (R104.13): the two hashes,
// each changed file with lines added and removed, and findings that became
// fixed or moved in the new revision.
export interface RevisionChange {
  from: string
  to: string
  files: { file: string; added: number; removed: number }[]
  fixed: PlanReviewSummary['open']
  moved: PlanReviewSummary['open']
}
export function revisionChange(
  from: { hash: string; files?: Record<string, string> | null; review?: PlanReviewSummary | null },
  to: { hash: string; files?: Record<string, string> | null; review?: PlanReviewSummary | null },
): RevisionChange {
  const files = from.files && to.files
    ? revisionDiff(from.files, to.files).map(({ file, diff }) => {
        const lines = diff.split('\n')
        return { file, added: lines.filter((line) => line.startsWith('+')).length, removed: lines.filter((line) => line.startsWith('-')).length }
      })
    : []
  const before = new Map((from.review?.open ?? []).map((finding) => [finding.id, finding]))
  const after = to.review?.open ?? []
  return {
    from: from.hash,
    to: to.hash,
    files,
    fixed: after.filter((finding) => finding.state === 'fixed' && before.get(finding.id)?.state !== 'fixed'),
    moved: after.filter((finding) => finding.anchor?.moved && !before.get(finding.id)?.anchor?.moved),
  }
}

// "2 blocker · 3 warn · 1 info · 1 for you": severities, then states, each
// left out at zero.
export function reviewCounts(review?: PlanReviewSummary | null): string {
  const parts = [
    ...SEVERITIES.map((name) => [name, review?.bySeverity?.[name] ?? 0] as const),
    ...STATES.map((name) => [name, review?.byState?.[name] ?? 0] as const),
  ].filter(([, count]) => count > 0)
  return parts.length ? parts.map(([name, count]) => `${count} ${name}`).join(' · ') : 'No findings'
}

// Each draft plan's batch number, by plan ID. Approved specs have none.
export function batchNumbers(batches: ApprovalBatches | null): Map<string, number> {
  return new Map((batches?.batches ?? []).flatMap((batch) => batch.specs.map((entry) => [entry.id, batch.batch] as const)))
}

// Specs the selected ones need that are not selected: approving fails
// for them until those are approved too.
export function missingOwners(selected: BatchEntry[]): string[] {
  const names = new Set(selected.map((entry) => entry.spec))
  return [...new Set(selected.flatMap((entry) => entry.needs.filter((need) => !names.has(need))))].sort()
}

export interface DeletePreview {
  id: string
  title: string
  spec: string | null
  retire: boolean
  open: number
  running: number
  done: number
  dependents: number
  folder: { path: string; exists: boolean; dirty: boolean; reason?: string | null } | null
}

export interface DeleteResult {
  id: string
  retired: boolean
  archived: number
  archiveWhenEnded: number
  decisions: number
  removedFolder: string | null
}

const n = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`

// The confirm dialog's lines: what happens to each part, from the preview.
export function deleteLines(p: DeletePreview): string[] {
  if (!p.retire) return ['The draft is marked deleted. No task was made from it.', 'The spec stays in history.']
  return [
    `${n(p.open, 'open task')}: archived. Their rows stay as history.`,
    `${n(p.running, 'running chat')}: left alone. Each task is archived when its chat ends.`,
    `${n(p.done, 'done task')}: kept as they are.`,
    `${n(p.dependents, 'task')} outside the spec that wait on it: each gets a decision for you.`,
    'The spec is marked deleted and stays in history. There is no undo button.',
  ]
}

export interface SpecDocuments {
  name: string
  folder: string
  hash: string | null
  documents: Record<string, string>
}

const DOCUMENT_ORDER = [
  ['requirements.md', 'Requirements'],
  ['bugfix.md', 'Bugfix'],
  ['design.md', 'Design'],
  ['tasks.md', 'Tasks'],
] as const

// The documents a folder has, in reading order, with their tab labels.
export function documentTabs(docs: SpecDocuments | null): { file: string; label: string; text: string }[] {
  if (!docs) return []
  return DOCUMENT_ORDER.filter(([file]) => typeof docs.documents?.[file] === 'string').map(([file, label]) => ({
    file,
    label,
    text: docs.documents[file],
  }))
}

export const shortHash = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : '—')

export const location = (diagnostic: Diagnostic) =>
  `${diagnostic.file ?? 'tasks.md'}:${diagnostic.lineStart}`

// One short line for a spec folder's row.
export function specStatus(spec: SpecSummary): string {
  const errors = spec.counts.error
  const problems = errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'valid'
  if (!spec.plan) return `Not imported · ${problems}`
  if (spec.plan.changed) return `Changed on disk · ${problems}`
  if (spec.plan.approved) return `Approved · revision ${spec.plan.revision}`
  return `Draft · revision ${spec.plan.revision} · ${problems}`
}

// One line for a planned write.
export function describeWrite(write: PlannedWrite): string {
  const target = write.issue === null ? 'new issue' : `#${write.issue}`
  const who = write.taskId ?? 'parent issue'
  switch (write.kind) {
    case 'issue.create':
      return `Create ${who}: ${write.title ?? ''}${write.type ? ` (${write.type})` : ''}`
    case 'issue.update':
      return `Update ${who} (${target}): ${Array.isArray(write.fields) ? write.fields.join(', ') : ''}`
    case 'label.add':
      return `Add label ${(write.labels ?? []).join(', ')} to ${who}`
    case 'label.remove':
      return `Remove label ${(write.labels ?? []).join(', ')} from ${who}`
    case 'assignee.add':
      return `Assign ${(write.assignees ?? []).join(', ')} to ${who}`
    case 'sub-issue.add':
      return `Link ${write.childTaskId} under ${who}`
    case 'blocker.add':
      return `${who} blocked by ${write.blockerTaskId}`
    case 'blocker.remove':
      return `${who} no longer blocked by ${write.blockerTaskId ?? 'an issue'}`
    case 'project.add':
      return `Add ${who} to the Project`
    case 'project.fields': {
      const fields = write.fields && !Array.isArray(write.fields) ? write.fields : {}
      return `Set ${Object.entries(fields)
        .map(([name, value]) => `${name} ${value ?? 'empty'}`)
        .join(', ')} on ${who}`
    }
    default:
      return `${write.kind} on ${who}`
  }
}

// Writes grouped by repository, in projection order.
export function writesByRepository(writes: PlannedWrite[]): [string, PlannedWrite[]][] {
  const groups = new Map<string, PlannedWrite[]>()
  for (const write of writes) {
    const key = write.repository ?? 'unknown repository'
    groups.set(key, [...(groups.get(key) ?? []), write])
  }
  return [...groups]
}

// Why the Approve button is off, or null when it may be pressed.
export function approveBlocker(plan: SpecPlan | null): string | null {
  if (!plan) return 'Store this spec first.'
  if (plan.disk.changed) return 'The folder changed on disk. Reload it first.'
  if (plan.approvals.some((approval) => approval.hash === plan.hash)) return 'This revision is approved.'
  if (!plan.quality.canApprove) return 'Fix the errors below first.'
  return null
}

// The Plans list's filters. Empty fields match every row.
export interface PlanListFilter {
  q?: string
  category?: string
  status?: string
  kind?: 'spec' | 'old-style'
  has?: 'ready' | 'running' | 'needs-you'
  // Show archived plans; they are hidden otherwise.
  archived?: boolean
  // Draft specs in this approval batch ("1", "2", ...).
  batch?: string
  // The epic's id; NO_EPIC for specs in none.
  epic?: string
}

export const NO_EPIC = 'none'

export function filterRows(rows: PlanRow[], filter: PlanListFilter, batchOf: Map<string, number> = new Map()): PlanRow[] {
  const text = filter.q?.trim().toLowerCase() ?? ''
  return rows.filter(
    (row) =>
      (!row.archived || filter.archived) &&
      (!text ||
        row.name.toLowerCase().includes(text) ||
        (row.spec ?? '').toLowerCase().includes(text) ||
        (row.planId ?? '').toLowerCase().includes(text)) &&
      (!filter.category || (row.category ?? UNCATEGORIZED) === filter.category) &&
      (!filter.status || row.status === filter.status) &&
      (!filter.kind || row.kind === filter.kind) &&
      (!filter.epic || (row.epic ?? NO_EPIC) === filter.epic) &&
      (!filter.batch || (row.planId !== null && batchOf.get(row.planId) === Number(filter.batch))) &&
      (!filter.has ||
        (filter.has === 'ready' ? row.now.ready > 0 : filter.has === 'running' ? row.now.running > 0 : row.now.needsYou > 0)),
  )
}

// The values each Plans filter offers, from the rows.
export function rowChoices(rows: PlanRow[]) {
  const values = (pick: (row: PlanRow) => string) =>
    [...new Set(rows.map(pick))].sort((a, b) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b)))
  const epics = new Map<string, { value: string; label: string; count: number }>()
  for (const row of rows) {
    if (row.kind === 'epic') continue
    const value = row.epic ?? NO_EPIC
    epics.set(value, { value, label: row.epic ? (row.epicTitle ?? row.epic) : 'No epic', count: (epics.get(value)?.count ?? 0) + 1 })
  }
  const counts = (pick: (row: PlanRow) => string) => {
    const n = new Map<string, number>()
    for (const row of rows) n.set(pick(row), (n.get(pick(row)) ?? 0) + 1)
    return n
  }
  return {
    categories: values((row) => row.category ?? UNCATEGORIZED),
    statuses: values((row) => row.status),
    categoryCounts: counts((row) => row.category ?? UNCATEGORIZED),
    // Epics by name, No epic last, each with how many specs it holds.
    epics: [...epics.values()].sort((a, b) => (a.value === NO_EPIC ? 1 : b.value === NO_EPIC ? -1 : a.label.localeCompare(b.label))),
  }
}

// How the Specs list is ordered. Name starts A to Z; Last update and Tasks
// start with the newest or largest.
export type SpecSort = 'name' | 'updated' | 'tasks'
export const SORT_FIRST: Record<SpecSort, 'asc' | 'desc'> = { name: 'asc', updated: 'desc', tasks: 'desc' }

export function sortRows(rows: PlanRow[], sort: SpecSort = 'name', dir: 'asc' | 'desc' = SORT_FIRST[sort]): PlanRow[] {
  const sign = dir === 'asc' ? 1 : -1
  const key = (row: PlanRow) => (sort === 'tasks' ? row.tasks.total : (row.lastChange && Date.parse(row.lastChange)) || 0)
  // Ties fall back to the name, A to Z.
  return [...rows].sort((a, b) => (sort === 'name' ? sign * a.name.localeCompare(b.name) : sign * (key(a) - key(b)) || a.name.localeCompare(b.name)))
}

// The chat draft that discusses one plan is built by the backend
// (chat.context with purpose discuss-plan); this is the seed it gets.
export const discussSeed = (row: PlanRow) => ({ plan: row.key, purpose: 'discuss-plan' as const })

// The archive confirm's lines. Archive is undone by Unarchive, so the
// dialog says so and its button is not red.
export const ARCHIVE_LINES = [
  'Its open tasks stop starting. Running chats keep going.',
  'Tasks in other specs that wait on it get a decision for you.',
  'It is hidden on Specs, Graph, Delivery and the Dashboard. Show archived brings it back.',
  'Nothing is deleted, and its spec folder is not touched. Unarchive undoes all of it.',
]

// One plan timeline entry as a line.
export function planEventLine(entry: { action: string; by: string | null }): string {
  const what = entry.action === 'archived' ? 'Archived' : entry.action === 'unarchived' ? 'Unarchived' : entry.action
  return entry.by ? `${what} by ${entry.by}` : what
}

// The badge a spec shows for its home (RC25.2); none when no mirror is set.
// The one status chip a spec row shows: Draft, Approved, On GitHub or Done.
// Changed on disk and not imported are drafts until approved again.
export type SpecChip = 'draft' | 'approved' | 'github' | 'done'
export const SPEC_CHIP_LABEL: Record<SpecChip, string> = { draft: 'Draft', approved: 'Approved', github: 'On GitHub', done: 'Done' }
export function specChip(row: Pick<PlanRow, 'status' | 'onGitHub'>): SpecChip {
  if (row.status === 'done') return 'done'
  if (row.status !== 'approved') return 'draft'
  return row.onGitHub ? 'github' : 'approved'
}

export function homeBadge(home?: 'main' | 'plansBranch'): { label: string; warn: boolean } | null {
  if (!home) return null
  return home === 'plansBranch' ? { label: 'Private', warn: true } : { label: 'Public', warn: false }
}

// The revision a person last approved, else the one before this; null when
// this is the first revision. Its files are what "Show changes" diffs from.
export function baseRevision(plan: Pick<SpecPlan, 'hash' | 'approvals' | 'history'>) {
  const history = plan.history ?? []
  const approved = new Set((plan.approvals ?? []).map((approval) => approval.hash))
  const base = [...history].reverse().find((entry) => approved.has(entry.hash) && entry.hash !== plan.hash) ?? history.at(-1)
  return base?.files ? { ...base, files: base.files, approved: approved.has(base.hash) } : null
}

// One unified diff per changed file, from `before` to `after`, in file order.
export function revisionDiff(before: Record<string, string>, after: Record<string, string>): { file: string; diff: string }[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .map((file) => ({ file, diff: unifiedDiff(before[file] ?? '', after[file] ?? '') }))
    .filter((entry) => entry.diff)
}
