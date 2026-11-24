// Round 3 calls: the chat seed (chat.context), Start now (task.start) and
// Recent activity (activity.recent).
// Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { ConflictItem } from './views-api.ts'

// What a chat is seeded with: conflict items (by identity) or tasks.
// `purpose` picks the opening ask.
export interface ChatSeed {
  items?: ItemRef[]
  tasks?: string[]
  purpose?: 'resolve' | 'help'
  // Ask for help (§8.9): where the person is and the settings there.
  help?: HelpSeed
}

export interface HelpSeed {
  page: string
  section?: string
  says?: string
  settings?: { key: string; value: string | number | boolean | null }[]
  docs?: string
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

// Run in a chat: a chat seeded with the skill that does the
// work and the item's IDs; the skill reads the rest itself. A spec is
// revised with avoozl-spec or reviewed with avoozl-spec-review, a task is
// worked with avoozl-work, and a Needs you item is explained with avoozl.
export type RunTarget =
  | { kind: 'spec'; spec: string; review: boolean }
  | { kind: 'task'; taskId: string }
  | { kind: 'item'; item: ItemRef & { reason?: string } }
  | { kind: 'retro'; scope: string; days: number }

export function runSeed(target: RunTarget): string {
  if (target.kind === 'retro')
    return `Use the avoozl-retro skill to run a retro over \`${target.scope}\` for the last ${target.days} days. Save the report with retro.save and change nothing else.`
  if (target.kind === 'spec')
    return target.review
      ? `Use the avoozl-spec-review skill to review the spec \`${target.spec}\`. Post findings only; edit no file.`
      : `Use the avoozl-spec skill to revise the spec \`${target.spec}\`. Ask me what should change, and leave the change on a spec branch for me to approve.`
  if (target.kind === 'task') return `Use the avoozl-work skill to work the task \`${target.taskId}\`.`
  const { item } = target
  const ids = [
    `kind \`${item.kind}\``,
    ...(item.reason ? [`reason \`${item.reason}\``] : []),
    ...(item.taskId ? [`task \`${item.taskId}\``] : []),
    ...(item.id ? [`id \`${item.id}\``] : []),
    ...(item.slot ? [`session \`${item.slot}\``] : []),
  ]
  return `Use the avoozl skill to look at the Needs you item with ${ids.join(', ')}. Explain why it needs me and what each choice would do, then recommend one. Change nothing until I say.`
}

interface ActivityItem {
  at: string
  text: string
  taskId: string
  title: string
}

interface StartResult {
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
    activity: (workspaceId: string, limit = 50) => run<{ items: ActivityItem[] }>('activity.recent', { limit }, workspaceId).then((r) => r.items),
  }
}
