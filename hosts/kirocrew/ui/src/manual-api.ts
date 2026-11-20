// Mark done and Reopen for a manual task (design §4.16). Kept free of JSX
// so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface ManualDone {
  choice: 'done' | 'skipped' | 'refused'
  by: string
  login?: string
  at: string
  via: 'avoozl' | 'github'
}

export function manualClient(api: AppApi) {
  const run = async <T>(operation: string, workspaceId: string, input: Record<string, unknown>) =>
    (
      await api.post<{ result: T }>(COMMAND_PATH, {
        operation,
        workspaceId,
        input,
      })
    ).result
  return {
    markDone: (workspaceId: string, taskId: string, choice: ManualDone['choice']) =>
      run<{ taskId: string; manualDone: ManualDone }>('task.manual.complete', workspaceId, { taskId, choice }),
    reopen: (workspaceId: string, taskId: string) => run<unknown>('task.manual.reopen', workspaceId, { taskId }),
  }
}
