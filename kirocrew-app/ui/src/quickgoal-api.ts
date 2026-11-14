// Calls and pure helpers for the quick goal modal (RC9, RC13). The backend
// (src/app/quick-goal-ops.mjs) decides every state; this module reads and
// words them. No JSX and no runtime imports, so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type Depth = 'look' | 'measure'

export interface Task {
  id: string
  title: string
  evidence: { file: string; line: number } | { measured: { seconds: number; command: string } }
  publicInterface?: boolean
}

export interface Proposal {
  tasks: Task[]
  edges: { from: string; to: string }[]
  batches: string[][]
  risks: string[]
  questions: { text: string; design: boolean }[]
  levels: number
}

export interface QuickGoal {
  id: string
  status: 'proposed' | 'approving' | 'approved' | 'promoted' | 'discarded'
  request: { goal: string; repository: string; depth: Depth; budget: { turns: number; minutes: number } }
  proposal: Proposal
  promote: string[]
  hint: { text: string; action: string } | null
  plan: { id: string; hash: string; spec: string } | null
  pull: { number: number; repository: string } | null
  pending?: boolean
  // Set when the auto-approve setting approved it at once.
  approval?: QuickGoal
}

// The planner chat ended without a proposal.
export interface Ended {
  status: 'stopped' | 'refused'
  reason: string
  turns: number
}

export interface Confirm {
  id: string
  spec: string
  repository: string
  issues: { id: string; title: string; requires: string[] }[]
}

export const isEnded = (value: QuickGoal | Ended): value is Ended => value.status === 'stopped' || value.status === 'refused'

export function quickGoalClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    repositories: (workspaceId: string) => run<{ items: { id: string; github: string | null }[] }>('repositories.list', {}, workspaceId),
    settings: (workspaceId: string) => run<{ autoApprove: boolean }>('quickgoal.settings.get', {}, workspaceId),
    setAutoApprove: (workspaceId: string, autoApprove: boolean) => run<{ autoApprove: boolean }>('quickgoal.settings.update', { autoApprove }, workspaceId),
    // Starts the planner chat. Writes nothing to GitHub.
    propose: (workspaceId: string, input: { goal: string; repository: string; depth: Depth; budget: { turns: number; minutes: number } }) =>
      run<QuickGoal | Ended>('quickgoal.propose', input, workspaceId),
    edit: (workspaceId: string, id: string, edit: { remove: string[]; titles: Record<string, string> }) => run<QuickGoal>('quickgoal.edit', { id, ...edit }, workspaceId),
    confirm: (workspaceId: string, id: string) => run<Confirm>('quickgoal.confirm', { id }, workspaceId),
    // The one call that writes to GitHub: it opens the approval pull request.
    approve: (workspaceId: string, id: string) => run<QuickGoal>('quickgoal.approve', { id }, workspaceId),
    promote: (workspaceId: string, id: string) => run<QuickGoal>('quickgoal.promote', { id }, workspaceId),
    // Goals whose approval pull request is open.
    waiting: (workspaceId: string) => run<QuickGoal[]>('quickgoal.list', {}, workspaceId),
    discard: (workspaceId: string, id: string) => run<QuickGoal>('quickgoal.discard', { id }, workspaceId),
  }
}

export const DEFAULT_BUDGET = { turns: 20, minutes: 15 }

export const DEPTH_TEXT: Record<Depth, { title: string; line: string }> = {
  look: { title: 'Look', line: 'Read only. Nothing is run.' },
  measure: { title: 'Measure', line: "Runs the repository's test command in a scratch worktree." },
}

// Why each promote rule fires, in the words the page shows.
export const PROMOTE_TEXT: Record<string, string> = {
  tasks: 'More than 8 tasks.',
  levels: 'More than 3 levels of tasks that wait on each other.',
  'design-question': 'A design question is still open.',
  'public-interface': 'A task changes a public interface.',
}

export function evidenceText(task: Task): string {
  return 'measured' in task.evidence ? `measured ${task.evidence.measured.seconds} s with ${task.evidence.measured.command}` : `${task.evidence.file}:${task.evidence.line}`
}

// What a task waits on, as the other tasks' IDs.
export const waitsOn = (proposal: Proposal, id: string) => proposal.edges.filter((edge) => edge.to === id).map((edge) => edge.from)

// How the chat ended without a proposal.
export function endedText(ended: Ended): string {
  if (ended.status === 'stopped') return `The planner ran out of ${ended.reason === 'time' ? 'time' : 'turns'} after ${ended.turns} turn${ended.turns === 1 ? '' : 's'} with no proposal. Nothing was written. Try a larger budget or a narrower goal.`
  return `The proposal was refused: ${ended.reason} Nothing was written.`
}

// One line after Approve: the pull request is open, or the goal is approved.
export function approvedText(goal: QuickGoal): string {
  if (goal.status === 'approved') return 'Approved. The issues are next.'
  return goal.pull ? `Approval pull request #${goal.pull.number} is open in ${goal.pull.repository}. Merge it, then reopen Quick goal and press Check the merge.` : 'Approval started.'
}
