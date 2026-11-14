// The Plans view's calls to Avoozl's app backend and its pure helpers. Plans
// are Kiro spec folders; approval is of one stored revision, named by the hash
// of the folder's files. Keep this module free of JSX and runtime imports so
// node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
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
}

export interface Preview {
  reviewedHash: string
  expectedRevision: number
  tasks: ({ localId: string; taskId: string; title: string; existing: boolean; lineStart: number } & TaskOwner)[]
  dependencies: { kind: string; from: string; to: string }[]
  // Checked [x] tasks.md items approval creates as accepted.
  baseline?: { count: number; taskIds: string[]; text: string }
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
    approve: async (workspaceId: string, id: string, expectedHash: string) => {
      const { reviewedHash, expectedRevision } = await preview(workspaceId, id)
      if (reviewedHash !== expectedHash) throw new Error('This revision changed. Reload it before approving.')
      return run<{ id: string; hash: string }>(workspaceId, 'plan.approve', {
        id,
        expectedHash,
        expectedRevision,
      })
    },
  }
}

export type PlansClient = ReturnType<typeof plansClient>

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
}

export function filterRows(rows: PlanRow[], filter: PlanListFilter): PlanRow[] {
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
      (!filter.has ||
        (filter.has === 'ready' ? row.now.ready > 0 : filter.has === 'running' ? row.now.running > 0 : row.now.needsYou > 0)),
  )
}

// The values each Plans filter offers, from the rows.
export function rowChoices(rows: PlanRow[]) {
  const values = (pick: (row: PlanRow) => string) =>
    [...new Set(rows.map(pick))].sort((a, b) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b)))
  return {
    categories: values((row) => row.category ?? UNCATEGORIZED),
    statuses: values((row) => row.status),
  }
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
export function homeBadge(home?: 'main' | 'plansBranch'): { label: string; warn: boolean } | null {
  if (!home) return null
  return home === 'plansBranch' ? { label: 'Private', warn: true } : { label: 'Public', warn: false }
}
