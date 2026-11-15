// Calls for the Mirror section of Settings (RC27, design D32). The backend
// holds all the logic: this module only sends the two operations and reads
// the dry run back. Keep it free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type MirrorKind = 'adopt' | 'create'

export interface MirrorLine {
  id: string
  state: 'found' | 'missing' | 'differs' | string
  status: 'ok' | 'change' | 'blocked' | 'input' | 'error' | 'refused' | string
  detail: string
  permission?: string
  ticked: boolean
}

export interface MirrorRow {
  id: string
  status: string
  detail: string
}

export interface MirrorSetupResult {
  kind: MirrorKind
  repository: string
  source: string
  previewHash: string
  lines: MirrorLine[]
  writes: number
  refused?: boolean
  detail?: string
  applied?: MirrorRow[]
  needsYou?: MirrorRow[]
  next?: string
}

export const MIRROR_BUTTONS: { kind: MirrorKind; label: string; about: string }[] = [
  { kind: 'adopt', label: 'Adopt existing setup', about: 'Find the mirror, private specs branch, labels and rules you already have. Shows a dry run first and writes only the lines you keep ticked.' },
  { kind: 'create', label: 'Create setup', about: 'Build a private mirror, copy the source into it once, then add the private specs branch, labels, branch rule and auto-merge. Shows a dry run first.' },
]

export const LINE_NAMES: Record<string, string> = {
  mirror: 'Private mirror',
  seed: 'Copy of the source',
  'plans-branch': 'Private specs branch',
  labels: 'Labels',
  'branch-rule': 'Branch rule',
  'auto-merge': 'Auto-merge',
  setting: 'Mirror setting',
  'radar-values': 'Radar values',
}

// Only a line that would write can be ticked.
export const canTick = (line: MirrorLine) => line.status === 'change'

// The ids to send: every line that can be ticked and is still ticked.
export const tickedIds = (lines: MirrorLine[], unticked: ReadonlySet<string>) =>
  lines.filter((line) => canTick(line) && !unticked.has(line.id) && line.ticked !== false).map((line) => line.id)

export function mirrorSetupClient(api: AppApi) {
  const run = async (kind: MirrorKind, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: MirrorSetupResult }>(COMMAND_PATH, { operation: `mirror.${kind}`, input, workspaceId })
    return reply.result
  }
  return {
    // A dry run: reads GitHub, writes nothing.
    preview: (workspaceId: string, kind: MirrorKind, names: { repository: string; source: string }) => run(kind, { ...names }, workspaceId),
    // Applies the ticked lines the dry run's hash named.
    apply: (workspaceId: string, kind: MirrorKind, names: { repository: string; source: string }, previewHash: string, ticked: string[]) =>
      run(kind, { ...names, confirm: true, previewHash, ticked }, workspaceId),
  }
}
