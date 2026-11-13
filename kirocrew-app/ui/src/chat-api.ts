// Round 3 calls: the chat seed (chat.context), Start now (task.start), the
// tick log (workspace.tick.log) and Recent activity (activity.recent).
// Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { ConflictItem } from './views-api.ts'

// How many tick log lines Settings › Workspaces shows, newest first.
export const TICK_LOG_LINES = 20

// What a chat is seeded with: conflict items (by identity), tasks, or one
// plan row (its plan.table key). `purpose` picks the opening ask.
export interface ChatSeed {
  items?: ItemRef[]
  tasks?: string[]
  plan?: string
  // An idea's id, for Riff on this (R63.8).
  idea?: string
  purpose?: 'resolve' | 'discuss-plan' | 'riff-idea'
}

export interface ItemRef {
  kind: string
  taskId: string | null
  field?: string
  slot?: string
  id?: string
}

// The fields chat.context matches a conflict item on.
export function itemRef(item: ConflictItem): ItemRef {
  const ref: ItemRef = { kind: item.kind, taskId: item.taskId ?? null }
  if (item.field) ref.field = item.field
  if (item.slot) ref.slot = item.slot
  if (item.id) ref.id = item.id
  return ref
}

export interface TickLine {
  at: string | null
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface ActivityItem {
  at: string
  text: string
  taskId: string
  title: string
}

export interface StartResult {
  taskId: string
  full: boolean
  running: number
  limit: number
  message: string
}

export function chatClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    context: (workspaceId: string, seed: ChatSeed) => run<{ message: string }>('chat.context', { ...seed }, workspaceId),
    start: (workspaceId: string, taskId: string) => run<StartResult>('task.start', { taskId }, workspaceId),
    tickLog: (workspaceId: string, limit = TICK_LOG_LINES) =>
      run<{ items: TickLine[] }>('workspace.tick.log', { limit }, workspaceId).then((r) => r.items),
    activity: (workspaceId: string, limit = 50) =>
      run<{ items: ActivityItem[] }>('activity.recent', { limit }, workspaceId).then((r) => r.items),
  }
}
