// The Browser page box in Settings > Workspaces: the page.status operation
// and the words each state shows. Kept free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface PageStatus {
  enabled: boolean
  running: boolean
  origin?: string
  open?: string
  problem?: string
}

export function pageClient(api: AppApi) {
  return {
    status: async (workspaceId: string) => (await api.post<{ result: PageStatus }>(COMMAND_PATH, { operation: 'page.status', input: {}, workspaceId })).result,
  }
}

export const PAGE_OFF_HELP = 'To turn it off, set "serve": { "enabled": false } in this computer\'s Avoozl config.json.'

// One line for the page's state. A running page names its sign-in command.
export function pageWords(view: PageStatus): string {
  if (!view.enabled) return "Off. serve.enabled is false in this computer's config.json. Remove it to turn the page on."
  if (view.problem) return `${view.problem}. The next tick tries again.`
  if (!view.running) return 'On. It starts with the next tick.'
  return `On at ${view.origin ?? '127.0.0.1'}. To sign in, run ${view.open ?? 'avoozl link'} in a terminal on this computer and open the link it prints.`
}
