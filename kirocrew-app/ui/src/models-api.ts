// Settings > Models: the model each of Avoozl's own chats opens on, saved as
// `models` in .avoozl.json (src/app/chat-models.mjs). Issue Radar crews pick
// their own model. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { parseModels } from './flow-api.ts'

export const MODEL_ROLES = [
  { key: 'planner', label: 'Planner', line: 'Drafts specs from a GitHub planning label.' },
  { key: 'driver', label: 'Driver', line: 'Drives approved specs. Set on the chat once it starts.' },
  { key: 'retro', label: 'Retro', line: 'Finds the slowest step and proposes one change.' },
  { key: 'reviewDraft', label: 'Review drafts', line: 'Drafts a pending review on a labeled pull request.' },
] as const
export type ModelRole = (typeof MODEL_ROLES)[number]['key']
export type ChatModels = Partial<Record<ModelRole, string>>

export interface ModelSettings {
  filename: string
  exists: boolean
  hash: string
  models: ChatModels
}

// The form back to `models`: auto and blank leave the role out.
export function toModels(form: ChatModels): ChatModels {
  return Object.fromEntries(Object.entries(form).filter(([, model]) => model && model !== 'auto')) as ChatModels
}

export function modelsClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    get: (workspaceId: string) => run<ModelSettings>(workspaceId, 'models.settings.get'),
    save: (workspaceId: string, models: ChatModels, expectedHash: string) => run<ModelSettings>(workspaceId, 'models.settings.update', { models: toModels(models), expectedHash }),
    list: () => api.get<unknown>('/api/models').then(parseModels),
  }
}
