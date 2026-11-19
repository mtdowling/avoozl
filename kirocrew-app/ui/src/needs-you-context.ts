// What a Needs you item says about itself before any button: what is asked,
// what answering unblocks, and what evidence Avoozl holds. Free of JSX so
// node can test it. Nothing here calls GitHub; it reads the item and its
// `context` (src/app/needs-you-context.mjs).
import type { ConflictItem, ItemContext, TaskText } from './views-api.ts'

// What the person is asked to do, in plain words, by kind.
export function askLine(item: ConflictItem): string {
  const task = item.taskId ? `Task ${item.taskId}` : 'This item'
  switch (item.kind) {
    case 'decision':
      return `Answer the question below. ${task} waits for it.`
    case 'review':
      return 'Read each task’s text and mark it reviewed. None starts before you do.'
    case 'plan-review':
      return 'Choose whether a second model reads this draft before you approve it.'
    case 'investigation':
      return 'Read the worker’s findings and the falsifier’s reply, then choose: go ahead, investigate again, or stop.'
    case 'ready-to-merge':
      return item.integrate ? 'Press Integrate to land the verified commit.' : 'Merge the pull request on GitHub. Avoozl never merges it.'
    case 'branch-landing':
      return 'Approve this exact head, then merge the branch on GitHub yourself.'
    case 'tracker-conflict':
      return 'Change the field where the tracker owns it, or change the spec.'
    case 'stale-session':
      return 'Read why the chat ended, then retry the delivery or dismiss this row.'
    case 'content-match':
      return 'A content rule blocked a write. Read the match, then allow it once or fix the text.'
    case 'content-unavailable':
      return 'Add or fix the rule set so Avoozl can check content again.'
    case 'tick-failed':
      return 'Fix the error shown. Avoozl runs the tick again by itself.'
    case 'driver':
    case 'driver-away':
      return 'Choose who drives this work: start it here, or wait for its pull request.'
    case 'needs-human':
      if (item.reason === 'blocked') return 'Unblock the task, or leave it blocked.'
      if (item.reason === 'conflict-fix') return 'Choose whether Avoozl resolves the source conflict or you do.'
      if (item.reason === 'forward') return 'Read the exact public diff, then forward it or not.'
      if (item.reason === 'crew') return 'Answer on GitHub. The crew picks the issue up again when the label comes off.'
      if (item.reason === 'review') return 'Read the task, then mark it reviewed so it may start.'
      return 'Read the reason and act where the row says.'
    default:
      return 'Read the reason and act where the row says.'
  }
}

// What answering frees. Dependents come from the stored graph.
export function unblockLine(item: ConflictItem): string | null {
  const dependents = item.context?.unblocks
  const names = dependents?.tasks.map((t) => `${t.title} (${t.id})`) ?? []
  const more = dependents && dependents.total > names.length ? ` and ${dependents.total - names.length} more` : ''
  if (item.kind === 'review') return 'Each reviewed task may start when its other needs are met.'
  if (item.kind === 'plan-review') return 'Approval of this draft waits on the review or your skip.'
  if (item.kind === 'ready-to-merge' || item.kind === 'branch-landing') return names.length ? `Landing it starts: ${names.join(', ')}${more}.` : 'Landing it finishes this work.'
  if (!item.taskId) return null
  if (names.length) return `${item.taskId} moves on, and then ${names.join(', ')}${more} can start.`
  return `${item.taskId} moves on. Nothing else waits on it.`
}

const range = (source: { lineStart: number | null; lineEnd: number | null }) =>
  source.lineStart ? (source.lineEnd && source.lineEnd !== source.lineStart ? `lines ${source.lineStart}–${source.lineEnd}` : `line ${source.lineStart}`) : null

// The snippet header: file path, then its lines when the record has them.
export const sourceLine = (source: NonNullable<ItemContext['source']>) => [source.path, range(source)].filter(Boolean).join(' · ')

// A task's text as lines: its title, its summary and each acceptance line.
export function taskLines(title: string | null | undefined, text: TaskText | undefined): string[] {
  return [title ?? '', text?.summary ?? '', ...(text?.acceptance ?? []).map((line) => `- ${line}`)].filter((line) => line.trim() !== '')
}

export interface DiffLine {
  kind: 'same' | 'add' | 'remove'
  text: string
}

// A line diff by longest common subsequence. Task text is a handful of lines.
export function lineDiff(before: string[], after: string[]): DiffLine[] {
  const n = before.length
  const m = after.length
  const table = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: 'same', text: before[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) out.push({ kind: 'remove', text: before[i++] })
    else out.push({ kind: 'add', text: after[j++] })
  }
  while (i < n) out.push({ kind: 'remove', text: before[i++] })
  while (j < m) out.push({ kind: 'add', text: after[j++] })
  return out
}

// The evidence a review task carries: a diff when Avoozl kept the earlier
// text, else the current text and a plain note that no earlier text exists.
export function reviewEvidence(title: string, context: ItemContext | undefined): { kind: 'diff'; lines: DiffLine[] } | { kind: 'text'; lines: string[]; note: string } | null {
  if (!context) return null
  const now = taskLines(title, context.text)
  if (context.prior) return { kind: 'diff', lines: lineDiff(taskLines(context.prior.title, context.prior), now) }
  if (!now.length) return null
  return { kind: 'text', lines: now, note: 'New task, or Avoozl did not keep its earlier text, so no diff is shown.' }
}

// Which evidence blocks an item has. An item with none says so on the page.
export type Evidence = 'investigation' | 'review' | 'links' | 'checks' | 'content' | 'escalation' | 'summary' | 'text'
export function evidenceOf(item: ConflictItem): Evidence[] {
  const out: Evidence[] = []
  if (item.findings || item.reply) out.push('investigation')
  if (item.kind === 'review' && item.tasks?.length) out.push('review')
  if (item.kind === 'plan-review' && item.context?.review) out.push('summary')
  if (item.context?.text && item.kind !== 'review' && item.context.text.summary) out.push('text')
  const links = item.context?.links
  if (links && (links.branch || links.pr || links.checks)) out.push('links')
  if (item.context?.failedChecks?.checks.length) out.push('checks')
  if (item.kind === 'content-match' || item.kind === 'content-unavailable') out.push('content')
  if (item.escalation) out.push('escalation')
  return out
}

// The spec a list row names: its title, or the review group's plan.
export const specOfItem = (item: ConflictItem) =>
  item.context?.spec ?? item.tasks?.find((t) => t.context?.spec)?.context?.spec ?? (item.plan ? { planId: null, name: item.plan, title: item.plan } : null)
