// The task drawer and the add/edit task form: the reads and writes they make,
// and the pure rules behind them (cycle check, new IDs, what an edit sends).
// Kept free of JSX so node can test it directly.
import type { TaskTimingDetail } from './flow-api.ts'
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { ConflictItem, DeliveryItem, DeliverySession } from './views-api.ts'

export interface TaskLink {
  id: string
  title: string
  kind: string
  condition: string | null
  satisfied: boolean
}

export interface TaskDetail {
  revision: number
  task: {
    id: string
    title: string
    summary: string
    acceptance: string[]
    checks: string[]
    epic: string | null
    epicTitle: string | null
    // Its phase inside its plan; older backends omit it.
    phase?: { id: string; title: string } | null
    kind: string
    authority: string
    route: string
    completion: string
    repository: string | null
    status: string | null
    state: string | null
    ready: boolean
    needsReview: boolean
    decision: string | null
    // Status review with nothing behind it (set by hand); older backends omit it.
    handSetReview?: boolean
    noSession?: string | null
    nextAction?: string | null
    planArchived?: string | null
    owner: string | null
    issue: { number: number | null; url: string | null; repository: string | null } | null
    wave: number
    context: string
  }
  plan: { id: string; title: string; spec: string | null; state: string | null; approved: boolean } | null
  // Where the task came from (page-views.mjs taskOrigin).
  origin?: TaskOrigin
  // Why the page must not write this task's row, if it must not.
  locked: { reason: 'github' | 'plugin' | 'approved-spec'; message: string } | null
  waitsOn: TaskLink[]
  blocks: TaskLink[]
  delivery: DeliveryItem | null
  conflicts: ConflictItem[]
  timeline: { at: string; text: string }[]
  // The Timing fold (§8.4): null until the task's first dispatch.
  timing?: TaskTimingDetail | null
}

export interface OriginSource {
  document: string
  title: string | null
  lineStart: number | null
  lineEnd: number | null
  checked: boolean | null
  readable: boolean
}

export interface TaskOrigin {
  kind: 'github-issue' | 'spec' | 'plan' | 'imported' | 'captured' | 'unknown'
  label: string
  text: string
  sources: OriginSource[]
  spec: string | null
  plan: { id: string; title: string } | null
  prompt?: string | null
}

// "todo/runtime.md, lines 4–6", for a source reference.
export function sourceLine(source: OriginSource): string {
  if (!source.lineStart) return source.document
  return source.lineEnd && source.lineEnd !== source.lineStart
    ? `${source.document}, lines ${source.lineStart}–${source.lineEnd}`
    : `${source.document}, line ${source.lineStart}`
}

// The lines a reader shows around a source: `context` lines either side,
// each with its number and whether it is one the task came from.
export function sourceExcerpt(text: string, source: Pick<OriginSource, 'lineStart' | 'lineEnd'>, context = 6) {
  const lines = text.split('\n')
  const start = source.lineStart ?? 1,
    end = source.lineEnd ?? start
  const { from, to } = excerptRange(text, source, context)
  return lines.slice(from - 1, to).map((line, i) => ({ number: from + i, text: line, hit: from + i >= start && from + i <= end }))
}

// The lines the excerpt shows and the file's length, not counting the
// empty "line" after a final newline.
export function excerptRange(text: string, source: Pick<OriginSource, 'lineStart' | 'lineEnd'>, context = 6) {
  const total = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  const start = source.lineStart ?? 1,
    end = source.lineEnd ?? start
  return { from: Math.min(total, Math.max(1, start - context)), to: Math.min(total, end + context), total }
}

// "Lines 280–310 of 512", the excerpt reader's caption.
export function excerptLabel(text: string, source: Pick<OriginSource, 'lineStart' | 'lineEnd'>, context = 6) {
  const { from, to, total } = excerptRange(text, source, context)
  return `${from === to ? `Line ${from}` : `Lines ${from}–${to}`} of ${total}`
}

// The origin sentence cut around each mention of `path`, so the page can
// make the path a link and leave the rest as text.
export function linkParts(text: string, path: string): { text: string; link: boolean }[] {
  if (!path) return [{ text, link: false }]
  return text.split(path).flatMap((piece, i) => (i === 0 ? [{ text: piece, link: false }] : [{ text: path, link: true }, { text: piece, link: false }])).filter((p) => p.text)
}

// "Line 294" or "Lines 4–6", the reader header's cited lines.
export const lineText = (t: Pick<OriginSource, 'lineStart' | 'lineEnd'>) =>
  !t.lineStart ? null : t.lineEnd && t.lineEnd !== t.lineStart ? `Lines ${t.lineStart}–${t.lineEnd}` : `Line ${t.lineStart}`

// A path Reveal may join to the workspace root: relative, with no `..`.
export const insideWorkspace = (path: string) => Boolean(path) && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.split(/[\\/]/).includes('..')

// Which rendered block holds a cited line: the last whose first line is at
// or before it (blocks come in source order). -1 when none does.
export function blockForLine(lines: number[], target: number): number {
  let found = -1
  lines.forEach((line, i) => {
    if (line <= target && (found < 0 || line >= lines[found])) found = i
  })
  return found
}

// The rendered blocks a citation marks. `nodes` are the file's rendered
// blocks in order, each with its first source line and tag. A range marks
// every block that starts inside it. A single line marks the block that
// holds it, and when that block is a heading, every block up to the next
// heading of the same or a higher level; a list item (a task) is already
// its whole block. Returns their indices; none without a line.
export function citedNodes(nodes: { line: number; tag: string }[], start: number | null, end: number | null): number[] {
  if (!start) return []
  if (end && end > start) {
    const inside = nodes.flatMap((n, i) => (n.line >= start && n.line <= end ? [i] : []))
    if (inside.length) return inside
  }
  const at = blockForLine(
    nodes.map((n) => n.line),
    start,
  )
  if (at < 0) return []
  const level = /^h([1-6])$/.exec(nodes[at].tag)?.[1]
  if (!level) return [at]
  const marked = [at]
  for (let i = at + 1; i < nodes.length; i++) {
    const next = /^h([1-6])$/.exec(nodes[i].tag)?.[1]
    if (next && Number(next) <= Number(level)) break
    marked.push(i)
  }
  return marked
}

export interface ChangePreview {
  route: 'github' | 'plan' | 'spec' | 'none'
  message: string
  link?: string | null
  planId?: string
  spec?: string
  folder?: string
  tasks?: { line: number; before: string; after: string } | null
  manifest?: { key: string; before: Record<string, unknown>; after: Record<string, unknown> } | null
}

export interface SettleResult {
  revision: number
  settled: { taskId: string; slot?: string }[]
  refused: { taskId: string; slot?: string; reason: string }[]
}

export type SettleAction = 'reviewed' | 'unblock' | 'dismiss' | 'settle'

export function taskClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string, expectedRevision?: number) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, {
      operation,
      input,
      workspaceId,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    })
    return reply.result
  }
  return {
    detail: (workspaceId: string, id: string) => run<TaskDetail>('task.detail', { id }, workspaceId),
    // A workspace Markdown file, for reading where a task came from.
    document: (workspaceId: string, id: string) => run<{ id: string; title: string; text: string }>('document.get', { id }, workspaceId),
    // Writes nothing: what a locked task's edit becomes as a plan change.
    preview: (workspaceId: string, id: string, change: Record<string, unknown>) =>
      run<ChangePreview>('task.change.preview', { id, ...change }, workspaceId),
    save: (workspaceId: string, input: Record<string, unknown>, expectedRevision: number) =>
      run<unknown>('task.update', input, workspaceId, expectedRevision),
    settle: (
      workspaceId: string,
      action: SettleAction,
      items: { taskId: string; slot?: string }[],
      expectedRevision: number,
      answer?: string,
    ) => run<SettleResult>('conflicts.settle', { action, items, ...(answer ? { answer } : {}) }, workspaceId, expectedRevision),
  }
}

// The path a new set of prerequisites would close back to `id`, or null.
// "a → b" means b waits on a. Checked before saving; the backend checks again.
export function findCycle(edges: { from: string; to: string; kind: string }[], id: string, prerequisites: string[]): string[] | null {
  const next = new Map<string, string[]>()
  const add = (from: string, to: string) => {
    if (!next.has(from)) next.set(from, [])
    next.get(from)!.push(to)
  }
  for (const edge of edges)
    if ((edge.kind === 'requires' || edge.kind === 'sequence') && edge.to !== id) add(edge.from, edge.to)
  for (const from of prerequisites) add(from, id)
  const back = new Map<string, string>()
  const queue = [id]
  while (queue.length) {
    const at = queue.shift()!
    for (const to of next.get(at) ?? []) {
      if (to === id) {
        const path = [id]
        for (let step = at; step !== id; step = back.get(step)!) path.push(step)
        path.push(id)
        return path.reverse()
      }
      if (!back.has(to)) {
        back.set(to, at)
        queue.push(to)
      }
    }
  }
  return null
}

// A task ID from a title: lower-case words joined by dashes, 3 to 80
// characters, starting with a letter, and not already taken.
export function newTaskId(title: string, taken: ReadonlySet<string>): string {
  let base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  if (base.length < 3) base = `task-${base || 'new'}`.replace(/-+$/, '')
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

export interface Prerequisite {
  id: string
  kind: 'requires' | 'sequence'
  // The completion level a requires link waits for; '' for the task's own.
  condition: string
}

export interface TaskForm {
  id: string
  title: string
  summary: string
  repository: string
  acceptance: string
  checks: string
  prerequisites: Prerequisite[]
}

export const COMPLETION_LEVELS = ['merged-pr', 'integrated', 'released', 'answered']

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export function emptyForm(): TaskForm {
  return { id: '', title: '', summary: '', repository: '', acceptance: '', checks: '', prerequisites: [] }
}

export function formFrom(detail: TaskDetail): TaskForm {
  return {
    id: detail.task.id,
    title: detail.task.title,
    summary: detail.task.summary,
    repository: detail.task.repository ?? '',
    acceptance: detail.task.acceptance.join('\n'),
    checks: detail.task.checks.join('\n'),
    prerequisites: detail.waitsOn
      .filter((link) => link.kind === 'requires' || link.kind === 'sequence')
      .map((link) => ({ id: link.id, kind: link.kind as Prerequisite['kind'], condition: link.condition ?? '' })),
  }
}

// What task.update receives. A new task is created as a draft: it needs
// review before it can be ready, so plan approval stays a person's step.
// Editing an existing task's text marks that one task for review again.
export function taskInput(form: TaskForm, original: TaskForm | null): Record<string, unknown> {
  const input: Record<string, unknown> = { id: form.id.trim() }
  const set = (key: string, value: unknown, before: unknown) => {
    if (!original || JSON.stringify(value) !== JSON.stringify(before)) input[key] = value
  }
  set('title', form.title.trim(), original?.title.trim())
  set('summary', form.summary.trim(), original?.summary.trim())
  set('acceptance', lines(form.acceptance), original ? lines(original.acceptance) : undefined)
  set('checks', lines(form.checks), original ? lines(original.checks) : undefined)
  set('repository', form.repository.trim() || undefined, original ? original.repository.trim() || undefined : undefined)
  if (input.repository === undefined) delete input.repository
  const requires = (list: Prerequisite[]) =>
    list.filter((p) => p.kind === 'requires').map((p) => (p.condition ? { task: p.id, condition: p.condition } : p.id))
  const sequence = (list: Prerequisite[]) => list.filter((p) => p.kind === 'sequence').map((p) => p.id)
  set('requires', requires(form.prerequisites), original ? requires(original.prerequisites) : undefined)
  set('sequence', sequence(form.prerequisites), original ? sequence(original.prerequisites) : undefined)
  if (!original) {
    input.create = true
    input.needsReview = true
  } else if (['title', 'summary', 'acceptance', 'checks'].some((key) => key in input)) input.needsReview = true
  return input
}

// A stale revision reads as a plain instruction to reload.
export function saveError(message: string): string {
  return /Database changed/.test(message) ? 'This task changed elsewhere. Reload it, then make your change again.' : message
}

// "5 min ago", "3 h ago", "2 d ago", or the date for older times.
export function relativeTime(at: string | null, now = Date.now()): string {
  if (!at) return ''
  const then = Date.parse(at)
  if (!Number.isFinite(then)) return ''
  const minutes = Math.round((now - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / 60 / 24)} d ago`
  return at.slice(0, 10)
}

// "12 min", "3 h 5 min": how long since `at`.
export function duration(at: string | null, now = Date.now()): string {
  if (!at) return ''
  const then = Date.parse(at)
  if (!Number.isFinite(then)) return ''
  const minutes = Math.max(0, Math.floor((now - then) / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`
}

// The chat link for a session: the one the backend sends (Delivery cards use
// it), else the same Kiro Crew chat route the backend builds (sessionUrl in
// notifications.mjs). The app SDK has no call to focus a session, so this is
// a plain link in the page.
// Where Attach opens a session, or null: a remote chat opens only through
// Kiro Crew's MC-10 (R41.14), which gives the link.
export function attachHref(session: Pick<DeliverySession, 'slot' | 'link' | 'crew'>): string | null {
  if (session.crew && session.crew !== 'local') return session.link ?? null
  return sessionHref(session)
}

export function sessionHref(session: Pick<DeliverySession, 'slot' | 'link'>): string {
  if (session.link) return session.link
  const key = session.slot.startsWith('dashboard:') ? session.slot.slice('dashboard:'.length) : session.slot
  return `/chat?sid=${encodeURIComponent(key)}`
}
