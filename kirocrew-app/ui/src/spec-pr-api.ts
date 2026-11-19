// Spec pull requests (Requirement 107): the facts the backend adopted, and a
// person's three actions. The backend (src/app/spec-pull-requests.mjs)
// decides everything; this module only calls it and words the checks.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface SpecPullFile {
  file: string
  status: 'added' | 'changed' | 'removed'
  added: number
  removed: number
  diff: string
}

export interface SpecPull {
  id: string
  spec: string
  planId: string
  title: string
  repository: string
  number: number
  url: string
  author: string | null
  draft: boolean
  checks: 'passing' | 'failing' | 'pending' | null
  head: string
  hash: string
  link: 'own' | 'allowed' | 'person'
  // No approved revision exists: the whole spec is the change.
  newSpec: boolean
  files: SpecPullFile[]
  tasks: { taskId: string; title: string; change: 'added' | 'edited' | 'removed' }[]
  review: {
    state: string
    current: boolean
    found: number
    bySeverity: Record<string, number>
    openBySeverity: Record<string, number>
    summary: string | null
  }
  approved: boolean
  // Approved: Avoozl merges it when the checks pass.
  merging: boolean
  canApprove: boolean
}

export const CHECKS_TEXT: Record<string, string> = { passing: 'Checks passing', failing: 'Checks failing', pending: 'Checks running' }

// Why Approve is not offered yet, or null when it is.
export function approveWhy(pull: SpecPull): string | null {
  if (pull.draft) return 'This pull request is a draft. Mark it ready for review on GitHub, then approve.'
  if (pull.approved) return 'This revision is approved.'
  if (pull.merging) return 'Approved. Avoozl merges it when its checks pass.'
  return null
}

export function specPullClient(api: AppApi) {
  const call = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string) => call<{ items: SpecPull[] }>(workspaceId, 'specpr.view').then((result) => result.items),
    // Closes the pull request with a comment that names the reason.
    reject: (workspaceId: string, id: string, reason: string) => call<{ closed: boolean }>(workspaceId, 'specpr.reject', { id, reason }),
    // Posts the review's open findings as one comment.
    requestChanges: (workspaceId: string, id: string) => call<{ posted: number }>(workspaceId, 'specpr.requestChanges', { id }),
  }
}
