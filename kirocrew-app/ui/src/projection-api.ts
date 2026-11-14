// Calls and pure helpers for the projection modal (RC2.1, RC2.8) and the
// Spec changed modal. The backend decides every write; this module reads and
// words them. No JSX and no runtime imports, so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import type { PlannedWrite, ProjectionPreview } from './plans-api.ts'
import { COMMAND_PATH } from './workspace-api.ts'

export interface ProjectionDetail extends ProjectionPreview {
  // Groups of task IDs the planner would batch; each is one issue if chosen.
  suggestedBatches?: string[][]
  // The preview ran on a scratch copy because the plan is still a draft.
  simulated?: boolean
  blocked?: { code: string; message: string }[]
}

export type ChangeAction = 'update' | 'comment' | 'create' | 'close' | 'none'

export interface ChangeRow {
  taskId: string
  title: string
  change: 'edited' | 'added' | 'removed'
  repository: string | null
  number: number | null
  issueState: 'none' | 'closed' | 'claimed' | 'unclaimed'
  action: ChangeAction
  text: string
}

export interface SpecChange {
  planId: string
  hash: string
  // True once the spec is approved again at this revision.
  approved: boolean
  applied: { taskId: string; action: string }[] | null
  rows: ChangeRow[]
}

export function projectionClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    // Every write the projection would make for these batches; none is made.
    preview: (workspaceId: string, planId: string, batches: string[][]) =>
      run<ProjectionDetail>('plan.issues.preview', { planId, batches }, workspaceId),
    // The only call that writes. `release` is Create and release.
    create: (workspaceId: string, planId: string, batches: string[][], release: boolean) =>
      run<unknown>('github.project', { planId, batches, ...(release ? { release: true } : {}) }, workspaceId),
    changed: (workspaceId: string, planId: string) => run<SpecChange>('spec.changed.preview', { planId }, workspaceId),
    apply: (workspaceId: string, planId: string) =>
      run<{ planId: string; done: { taskId: string; action: string }[] }>('spec.changed.apply', { planId }, workspaceId),
  }
}

// Write kinds, named here so the page walk does not read them as operations.
const KIND = { create: 'issue.create', update: 'issue.update', sub: 'sub-issue.add', blocker: 'blocker.add', project: 'project.add', label: 'label.add' }
const count = (writes: PlannedWrite[], kind: string) => writes.filter((write) => write.kind === kind).length
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// The headline under the title.
export function headline(preview: ProjectionDetail, batches: string[][]): string {
  const issues = count(preview.writes, KIND.create)
  const batched = batches.reduce((sum, group) => sum + group.length, 0)
  return `${plural(issues, 'issue')} to create${batched ? `, ${plural(batched, 'task')} batched into ${plural(batches.length, 'issue')}` : ''}. Nothing is written until you confirm.`
}

// The confirm step: every kind of write, counted. Zero counts are left out.
export function confirmLines(preview: ProjectionDetail, repository: string | null, release: boolean): string[] {
  const where = repository ?? 'the repository'
  const lines = [
    [count(preview.writes, KIND.create), (n: number) => `create ${plural(n, 'issue')} in ${where}`],
    [count(preview.writes, KIND.update), (n: number) => `update ${plural(n, 'issue')}`],
    [count(preview.writes, KIND.sub), (n: number) => `link ${plural(n, 'sub-issue')}`],
    [count(preview.writes, KIND.blocker), (n: number) => `add ${plural(n, 'blocked-by link')}`],
    [count(preview.writes, KIND.project), (n: number) => `add ${plural(n, 'issue')} to the Project`],
    [count(preview.writes, KIND.label), (n: number) => `add labels to ${plural(n, 'issue')}`],
  ] as const
  const out = lines.filter(([n]) => n > 0).map(([n, text]) => text(n))
  if (release) out.push('check the merge path, then release by your release mode')
  return out
}

export const UNDO = 'Undo: close the issues as not planned.'

// Task IDs in a chosen batch group, as the backend takes them.
export function toggleBatch(chosen: string[][], group: string[]): string[][] {
  const key = group.join()
  return chosen.some((entry) => entry.join() === key) ? chosen.filter((entry) => entry.join() !== key) : [...chosen, group]
}

export const ACTION_LABEL: Record<ChangeAction, string> = {
  update: 'Update the issue',
  comment: 'Comment only',
  create: 'Create the issue',
  close: 'Close as not planned',
  none: 'Nothing',
}

export const ISSUE_STATE_LABEL: Record<ChangeRow['issueState'], string> = {
  none: 'no issue',
  closed: 'closed',
  claimed: 'claimed',
  unclaimed: 'unclaimed',
}

// Rows that write something, so the modal can say how many.
export const writing = (rows: ChangeRow[]) => rows.filter((row) => row.action !== 'none')
