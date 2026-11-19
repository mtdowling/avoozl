// A fix (triage-agent TA9): one change with no spec files. The drawer's
// checks and the fix.start / fix.spec calls. Kept free of JSX so node can
// test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH, type Repository } from './workspace-api.ts'

export const FIX_TEXT_LIMIT = 20000

export interface FixStarted {
  taskId: string
}

export interface FixSpecResult {
  taskId: string
  spec: string
  folder: string
}

// The repositories a fix can code: those with a local checkout. The
// planning repository holds specs, not code.
export const fixRepositories = (all: Repository[]) => all.filter((repo) => repo.localCheckout && !repo.planning)

// The first problem with the form, or null when it can be sent.
export function fixProblem(text: string, repository: string): string | null {
  if (!text.trim()) return 'Say what the fix should do.'
  if (text.trim().length > FIX_TEXT_LIMIT) return `Keep it under ${FIX_TEXT_LIMIT} characters.`
  if (!repository) return 'Pick the repository it changes.'
  return null
}

export function fixClient(api: AppApi) {
  const call = async <T>(operation: string, workspaceId: string, input: Record<string, unknown>) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, workspaceId, input })).result
  return {
    start: (workspaceId: string, text: string, repository: string) => call<FixStarted>('fix.start', workspaceId, { text, repository }),
    toSpec: (workspaceId: string, taskId: string) => call<FixSpecResult>('fix.spec', workspaceId, { taskId }),
  }
}
