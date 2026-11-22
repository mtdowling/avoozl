// The Plans view's calls to Avoozl's app backend and its pure helpers. Plans
// are Kiro spec folders; approval is of one stored revision, named by the hash
// of the folder's files. Keep this module free of JSX and runtime imports so
// node can test it directly.
import { unifiedDiff } from '../../../../src/app/agents/text-diff.ts'
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { TaskOwner } from './views-api.ts'
import { TONE } from './ui/tones.ts'

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
  review?: PlanReview
  // Earlier revisions, oldest first; a spec revision keeps its files.
  history?: { revision: number; hash: string; files?: Record<string, string> }[]
  // The spec's Links box (R92.4), from stored records only.
  links?: SpecLinks | null
}

export interface PlanReviewComment {
  id: string
  planId: string
  spec: string
  revisionHash: string
  file: string
  lineStart: number | null
  body: string
  state: 'open' | 'resolved'
  author: string
  createdAt: string
  current: boolean
  resolvedAt?: string
  resolvedBy?: string
  resolution?: string
}

export interface PlanReview {
  status: string
  comments: PlanReviewComment[]
  openCount: number
  currentOpenCount: number
  commentSnapshot: string
  latestRequest: PlanReviewRequest | null
  activeRequest: PlanReviewRequest | null
}

export interface PlanReviewRequest {
  id: string
  revisionHash: string
  disposition: 'changes-requested' | 'held'
  reason: string
  commentIds: string[]
  commentSnapshot: string
  requestedBy: string
  requestedAt: string
  current: boolean
  state?: 'open' | 'closed'
  closedAt?: string
  closedBy?: string
}

export interface ReviewRequestResult {
  id: string
  revisionHash: string
  disposition: 'changes-requested' | 'held'
  reason: string
  commentIds: string[]
  commentSnapshot: string
  comments: PlanReviewComment[]
}

function reviewExcerpt(text: string, lineStart: number | null): string {
  const lines = text.split('\n')
  const start = lineStart === null ? 0 : Math.max(0, lineStart - 4)
  const end = lineStart === null ? Math.min(lines.length, 40) : Math.min(lines.length, lineStart + 3)
  const shown = lines.slice(start, end).map((line, index) => `${start + index + 1} | ${line}`)
  if (end < lines.length) shown.push(`… ${lines.length - end} more lines`)
  return shown.join('\n')
}

// The exact review handoff for a spec-writing chat. It names the workspace
// and folder so a worker never has to search for the right checkout, carries
// the durable findings, and includes nearby current text so each requested
// change is actionable before the worker opens a file.
export function reviewReworkInstruction(request: ReviewRequestResult, context: { workspaceId: string; folder: string | null; files: Record<string, string> }): string {
  const requested = new Set(request.commentIds)
  const comments = request.comments.filter((comment) => requested.has(comment.id))
  const findings = comments.flatMap((comment) => {
    const location = `${comment.file}${comment.lineStart ? `:${comment.lineStart}` : ''}`
    const revision = comment.revisionHash === request.revisionHash ? '' : ` (reviewed revision ${comment.revisionHash.slice(0, 12)})`
    const current = context.files[comment.file]
    return [
      `- [${comment.id}] ${location}${revision}: ${comment.body}`,
      ...(typeof current === 'string'
        ? [
            `  Current ${comment.file} text:\n${reviewExcerpt(current, comment.lineStart)
              .split('\n')
              .map((line) => `    ${line}`)
              .join('\n')}`,
          ]
        : []),
    ]
  })
  return [
    `Revise exactly the changes requested for spec revision ${request.revisionHash}.`,
    `Avoozl workspace: ${context.workspaceId}.`,
    ...(context.folder ? [`Use this exact spec folder; do not search for another copy: ${context.folder}`] : []),
    ...(request.reason ? [`Reviewer note: ${request.reason}`] : []),
    ...(findings.length ? ['Required review findings:', ...findings] : []),
    `Review snapshot: ${request.commentSnapshot}.`,
  ].join('\n')
}

// A GitHub link built from validated fields (src/app/tasks/scm-links.ts).
export interface ScmLink {
  kind: 'issue' | 'pull' | 'branch' | 'commit'
  repository: string
  number?: number
  ref?: string
  sha?: string
  url: string
}

export interface CheckState {
  state: 'pass' | 'fail' | 'pending'
  // The state only for the task's current head; else stale.
  dot: 'pass' | 'fail' | 'pending' | 'stale'
  head: string
  readAt: string | null
  ageMs: number | null
  current: boolean
  url: string | null
}

export interface SpecLinks {
  issue: ScmLink | null
  workingBranches: ScmLink[]
  pulls: (ScmLink & { task: string; state: string; checks: CheckState | null })[]
  sources: ScmLink[]
}

// A link's short text: owner/name#N, a branch name, or a short SHA.
export function scmLinkText(link: ScmLink): string {
  if (link.kind === 'branch') return link.ref ?? ''
  if (link.kind === 'commit') return (link.sha ?? '').slice(0, 7)
  return `${link.repository}#${link.number}`
}

// A check dot's words and color. A dot for an older head is grey and says
// so, never its old state (R92.3).
export function checkDot(checks: CheckState | null, relative: (at: string | null) => string): { label: string; color: string } {
  if (!checks) return { label: 'No checks recorded', color: TONE.muted }
  const when = relative(checks.readAt)
  const age = when ? `, read ${when}` : ''
  if (checks.dot === 'stale') return { label: `Checks are for an older commit${age}`, color: TONE.muted }
  if (checks.dot === 'pass') return { label: `Checks passed${age}`, color: TONE.ok }
  if (checks.dot === 'fail') return { label: `Checks failed${age}`, color: TONE.danger }
  return { label: `Checks running${age}`, color: TONE.warnOrAmber }
}

export interface Preview {
  reviewedHash: string
  expectedRevision: number
  tasks: ({ localId: string; taskId: string; title: string; existing: boolean; lineStart: number } & TaskOwner)[]
  dependencies: { kind: string; from: string; to: string }[]
  // Checked [x] tasks.md items approval creates as accepted.
  baseline?: { count: number; taskIds: string[]; text: string }
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

// One row of the Plans table (`plan.table`): a spec folder. `category` is what the plan's front-matter says, or
// null; Avoozl never guesses one.
export interface PlanRow {
  key: string
  // An epic folder lists member plans (Requirement 59.1).
  kind: 'spec' | 'epic'
  name: string
  spec: string | null
  folder: string | null
  planId: string | null
  type: 'feature' | 'bugfix' | null
  category: string | null
  categoryProblem: string | null
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
  }
}

export function plansClient(api: AppApi) {
  const run = async <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}): Promise<T> => {
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
    // Store the folder on disk as a draft plan named after it.
    store: (workspaceId: string, spec: string) => run<SpecPlan>(workspaceId, 'plan.create', { spec }),
    reload: (workspaceId: string, id: string, expectedHash: string) => run<SpecPlan>(workspaceId, 'plan.save', { id, expectedHash }),
    comment: (workspaceId: string, input: { id: string; expectedHash: string; file: string; lineStart?: number; body: string }) =>
      run<PlanReviewComment>(workspaceId, 'plan.review.comment', input),
    resolveComment: (workspaceId: string, commentId: string, resolution?: string) => run<PlanReviewComment>(workspaceId, 'plan.review.resolve', { commentId, resolution }),
    requestChanges: (workspaceId: string, id: string, expectedHash: string, reason?: string) =>
      run<ReviewRequestResult>(workspaceId, 'plan.review.requestChanges', { id, expectedHash, reason }),
    holdReview: (workspaceId: string, id: string, expectedHash: string, reason: string) => run<ReviewRequestResult>(workspaceId, 'plan.review.hold', { id, expectedHash, reason }),
    resumeReview: (workspaceId: string, id: string, expectedHash: string) => run<PlanReview>(workspaceId, 'plan.review.resume', { id, expectedHash }),
    preview,
    // Extra code-fence grammars the workspace names (.avoozl.json
    // highlight.languages), as data for highlight.ts.
    languages: (workspaceId: string) =>
      run<{ languages: Record<string, { tokens: { type: string; pattern: string; flags?: string }[] }>; problems: string[] }>(workspaceId, 'highlight.languages'),
    // Approve exactly the revision the user is looking at: one commit on main
    // as the person. The backend refuses a changed hash, a changed database
    // or a folder that moved on disk. A revision that moved since it was shown comes back as `changed`
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

interface ApproveOneResult {
  id: string
  hash: string
}
// What changed while an Approve dialog was open (R104.13): the two hashes,
// and each changed file with lines added and removed.
export interface RevisionChange {
  from: string
  to: string
  files: { file: string; added: number; removed: number }[]
}
export function revisionChange(from: { hash: string; files?: Record<string, string> | null }, to: { hash: string; files?: Record<string, string> | null }): RevisionChange {
  const files =
    from.files && to.files
      ? revisionDiff(from.files, to.files).map(({ file, diff }) => {
          const lines = diff.split('\n')
          return { file, added: lines.filter((line) => line.startsWith('+')).length, removed: lines.filter((line) => line.startsWith('-')).length }
        })
      : []
  return { from: from.hash, to: to.hash, files }
}

export interface SpecDocuments {
  name: string
  folder: string
  hash: string | null
  documents: Record<string, string>
  // The file that holds the task list: tasks.md, or a file with a `## Tasks` section.
  tasksFile?: string
}

const DOCUMENT_ORDER = [
  ['requirements.md', 'Requirements'],
  ['bugfix.md', 'Bugfix'],
  ['design.md', 'Design'],
  ['tasks.md', 'Tasks'],
] as const

// The documents a folder has, in reading order, with their tab labels. A
// single-file spec's file comes last, under its own name.
export function documentTabs(docs: SpecDocuments | null): { file: string; label: string; text: string }[] {
  if (!docs) return []
  const order: (readonly [string, string])[] = [...DOCUMENT_ORDER]
  const single = docs.tasksFile
  if (single && !order.some(([file]) => file === single)) order.push([single, single])
  return order
    .filter(([file]) => typeof docs.documents?.[file] === 'string')
    .map(([file, label]) => ({
      file,
      label,
      text: docs.documents[file],
    }))
}

export const shortHash = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : '—')

export const location = (diagnostic: Diagnostic) => `${diagnostic.file ?? 'tasks.md'}:${diagnostic.lineStart}`

// One short line for a spec folder's row.
export function specStatus(spec: SpecSummary): string {
  const errors = spec.counts.error
  const problems = errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'valid'
  if (!spec.plan) return `Not imported · ${problems}`
  if (spec.plan.changed) return `Changed on disk · ${problems}`
  if (spec.plan.approved) return `Approved · revision ${spec.plan.revision}`
  return `Draft · revision ${spec.plan.revision} · ${problems}`
}

// Why the Approve button is off, or null when it may be pressed.
export function approveBlocker(plan: SpecPlan | null): string | null {
  if (!plan) return 'Store this spec first.'
  if (plan.disk.changed) return 'The folder changed on disk. Reload it first.'
  if (plan.approvals.some((approval) => approval.hash === plan.hash)) return 'This revision is approved.'
  if (!plan.quality.canApprove) return 'Fix the errors below first.'
  if (plan.review?.openCount) return `Resolve ${plan.review.openCount} review ${plan.review.openCount === 1 ? 'comment' : 'comments'} first.`
  if (plan.review?.status === 'held') return 'This spec review is held.'
  if (plan.review?.status === 'changes-requested') return 'This spec revision has requested changes.'
  return null
}

// The Plans list's filters. Empty fields match every row.
export interface PlanListFilter {
  q?: string
  category?: string
  status?: string
  has?: 'ready' | 'running' | 'needs-you'
  // Show archived plans; they are hidden otherwise.
  archived?: boolean
  // The epic's id; NO_EPIC for specs in none.
  epic?: string
}

export const NO_EPIC = 'none'

export function filterRows(rows: PlanRow[], filter: PlanListFilter): PlanRow[] {
  const text = filter.q?.trim().toLowerCase() ?? ''
  return rows.filter(
    (row) =>
      (!row.archived || filter.archived) &&
      (!text || row.name.toLowerCase().includes(text) || (row.spec ?? '').toLowerCase().includes(text) || (row.planId ?? '').toLowerCase().includes(text)) &&
      (!filter.category || (row.category ?? UNCATEGORIZED) === filter.category) &&
      (!filter.status || row.status === filter.status) &&
      (!filter.epic || (row.epic ?? NO_EPIC) === filter.epic) &&
      (!filter.has || (filter.has === 'ready' ? row.now.ready > 0 : filter.has === 'running' ? row.now.running > 0 : row.now.needsYou > 0)),
  )
}

// The values each Plans filter offers, from the rows.
export function rowChoices(rows: PlanRow[]) {
  const values = (pick: (row: PlanRow) => string) => [...new Set(rows.map(pick))].sort((a, b) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b)))
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

// One plan timeline entry as a line.
export function planEventLine(entry: { action: string; by: string | null }): string {
  const what = entry.action === 'archived' ? 'Archived' : entry.action === 'unarchived' ? 'Unarchived' : entry.action
  return entry.by ? `${what} by ${entry.by}` : what
}

// The one status chip a spec row shows: Draft, Approved, On GitHub or Done.
// Changed on disk and not imported are drafts until approved again.
export type SpecChip = 'draft' | 'approved' | 'github' | 'done'
export const SPEC_CHIP_LABEL: Record<SpecChip, string> = { draft: 'Draft', approved: 'Approved', github: 'On GitHub', done: 'Done' }
export function specChip(row: Pick<PlanRow, 'status' | 'onGitHub'>): SpecChip {
  if (row.status === 'done') return 'done'
  if (row.status !== 'approved') return 'draft'
  return row.onGitHub ? 'github' : 'approved'
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
