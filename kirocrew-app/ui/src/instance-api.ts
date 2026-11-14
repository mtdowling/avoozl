// The install's display name and fixed ID (src/app/instance.mjs). The name is
// for people and shows in the header always; it shows in other places only
// once another instance exists, so one install stays quiet. The ID is never
// shown. Trace and the other surfaces use these two helpers, so the rule lives
// in one place. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface InstanceView {
  id: string
  name: string
  others: string[]
  shared: boolean
}

export const NAME_RULE = 'A name is 1 to 24 letters, digits, spaces or hyphens.'
export const validName = (value: string) => /^[A-Za-z0-9][A-Za-z0-9 -]{0,23}$/.test(value.trim()) && !/^inst-[0-9a-f]{12}$/.test(value.trim())

export function instanceClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    view: (workspaceId: string) => run<InstanceView>('instance.view', {}, workspaceId),
    rename: (workspaceId: string, name: string) => run<InstanceView>('instance.rename', { name }, workspaceId),
  }
}

// The name to show on a surface, or null to show nothing. The header always
// shows it; every other surface only when another instance was seen.
export function nameFor(view: InstanceView | null | undefined, surface: 'header' | 'other'): string | null {
  if (!view) return null
  return surface === 'header' || view.shared ? view.name : null
}

// "Mira hands the driver role to Juno"; without a target, "Mira hands the
// driver role over". Null when the name stays quiet.
export function handoffLine(view: InstanceView | null | undefined, to?: string | null): string | null {
  const name = nameFor(view, 'other')
  return name ? `${name} hands the driver role ${to ? `to ${to}` : 'over'}.` : null
}
