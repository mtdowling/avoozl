// Calls and pure helpers for Settings > Plugins (design §4.8, R34.4, R34.9).
// The backend inspects, validates and writes; this module only shapes the
// list and the Add plugin form. Keep it free of JSX and runtime imports so
// node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { relativeTime } from './task-api.ts'

export type PluginState = 'invalid' | 'missing' | 'unsupported' | 'disabled' | 'unapproved' | 'changed' | 'approved'

export interface PluginHealth {
  state: 'ok' | 'unavailable'
  reason: string | null
  since?: string
}

export interface PluginRow {
  id: string | null
  source: 'repository' | 'machine'
  location?: string
  version?: string
  contract?: number
  // The parts this plugin bundles (R55.1), and the code kinds they run as.
  provides?: string[]
  kinds?: string[]
  capabilities?: Record<string, string[]>
  hash?: string
  // A plugin with a pack: what it sets, and what was imported from it.
  pack?: PackSummary
  // A git plugin's source and the commit this machine pinned it to (R34.13).
  git?: { url: string; ref: string; subdir?: string }
  commit?: string
  config?: Record<string, unknown>
  state: PluginState
  reason: string | null
  approval?: { version: string; hash: string; commit?: string; approvedAt: string }
  health: PluginHealth | null
}

export interface PluginList {
  supportedContracts: number[]
  routes: string[]
  plugins: PluginRow[]
}

export interface PluginForm {
  id: string
  where: 'path' | 'package' | 'git'
  // Each source keeps its own value, so switching sources loses nothing.
  path: string
  package: string
  // The package version the person expects; checked against the installed
  // manifest. The entry has no version key: approval pins the exact one.
  version: string
  git: string
  ref: string
  subdir: string
  contract: string
  config: string
  scope: 'machine' | 'repository'
}

export interface PackSummary {
  description: string | null
  groups: string[]
  imported: { version: string; importedAt: string; importedBy?: string; settings: string[] } | null
  // A version not imported yet: its diff is offered (R55.7).
  offer: boolean
}

// One setting of a pack import preview (R55.5).
export interface PackChange {
  setting: string
  action: 'create' | 'change' | 'keep' | 'skip'
  from?: unknown
  to?: unknown
  reason?: string
  warning?: string
}

export interface PackPreview {
  id: string
  version: string
  description: string | null
  repositories: string[]
  changes: PackChange[]
  warnings: string[]
  previewHash: string
  imported: PackSummary['imported']
}

// What plugin.preview found before anything was declared.
export interface PluginPreview {
  error?: string
  location?: string
  id?: string
  version?: string
  contract?: number
  provides?: string[]
  kinds?: string[]
  pack?: { description?: string; settings: Record<string, unknown> }
  capabilities?: Record<string, string[]>
  supported?: boolean
  // A git source: the commit its ref names now.
  commit?: string
}

// The Contract version field's words, shared by the form and its review.
export const CONTRACT_LABEL = 'Contract version'
export const CONTRACT_HINT = "Which version of Avoozl's plugin interface this plugin was built for. Not the plugin's own version."

export const emptyPluginForm = (): PluginForm => ({
  id: '',
  where: 'path',
  path: '',
  package: '',
  version: '',
  git: '',
  ref: '',
  subdir: '',
  contract: '1',
  config: '',
  scope: 'machine',
})

// The Add plugin steps: a heading and one line each.
export const PLUGIN_STEPS = [
  ['Where from', 'Pick where the plugin’s files are. Open one source and fill it in.'],
  ['What', 'What Avoozl found there. Check it is the plugin you meant.'],
  ['Applies to', 'Declare it on this computer only, or share it with the repository.'],
  ['Review and approve', 'Nothing runs until you approve this exact version.'],
] as const

// The three sources, with when to use each.
export const PLUGIN_SOURCES = [
  { key: 'path', title: 'Folder', line: 'A plugin folder on this computer. Use it while you build or try a plugin.' },
  { key: 'package', title: 'Package', line: 'An npm package installed in Avoozl’s plugin folder. Use it for a published plugin.' },
  { key: 'git', title: 'Git', line: 'A tag, branch or commit of a git repository. Use it to share one exact commit.' },
] as const

export const locationOf = (form: PluginForm) => form[form.where].trim()

// Each part a plugin may bundle, in plain words (R55.1).
export const PLUGIN_PARTS: Record<string, { title: string; line: string }> = {
  pack: { title: 'Settings pack', line: 'Settings you preview and copy into .avoozl.json once. Runs no code.' },
  rules: { title: 'Content rules', line: 'Rule sets supplied while Avoozl runs. The terms never go into Git.' },
  tracker: { title: 'Tracker', line: 'Keeps task records in another system.' },
  intake: { title: 'Intake source', line: 'Brings outside work in, read on each tick.' },
  route: { title: 'Delivery route', line: 'Delivers tasks somewhere other than a local worker.' },
  lessons: { title: 'Lessons pack', line: 'Retro lessons you preview and import as read-only. Runs no code.' },
}

// A row's parts; a plugin from before `provides` has one part per kind.
export const partsOf = (row: { provides?: string[]; kinds?: string[] }) => row.provides ?? row.kinds ?? []
export const partTitles = (row: { provides?: string[]; kinds?: string[] }) =>
  partsOf(row).map((part) => PLUGIN_PARTS[part]?.title ?? part)

// The preview's lines by action, for the summary above the table.
export function packCounts(changes: PackChange[]): Record<PackChange['action'], number> {
  const counts = { create: 0, change: 0, keep: 0, skip: 0 }
  for (const change of changes) counts[change.action]++
  return counts
}

// A setting value in one short line for the preview table.
export function shortValue(value: unknown): string {
  if (value === undefined) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 80 ? text.slice(0, 77) + '...' : text
}

// The import input for a preview the person saw.
export const importInput = (preview: PackPreview, acceptLowered: boolean, confirmPublic: boolean) => ({
  id: preview.id,
  repositories: preview.repositories,
  previewHash: preview.previewHash,
  acceptLowered,
  confirmPublic,
})

// Why Import is off, or null.
export function importBlocked(row: PluginRow, preview: PackPreview | null, acceptLowered: boolean, confirmPublic: boolean): string | null {
  if (row.state !== 'approved') return `Approve version ${row.version ?? ''} first. Nothing from the pack applies before that.`
  if (!preview) return 'Avoozl has not previewed the pack yet.'
  if (!preview.changes.some((c) => c.action === 'create' || c.action === 'change')) return 'Nothing to import: every setting is already the same.'
  if (preview.warnings.length && !acceptLowered) return 'Accept the who-counts change to import.'
  if (row.source === 'machine' && !confirmPublic) return 'Confirm that the settings and the plugin id go into .avoozl.json.'
  return null
}

// The plugin.preview input for the open source.
export function previewInput(form: PluginForm): Record<string, unknown> {
  const location = locationOf(form)
  if (form.where !== 'git') return { [form.where]: location, scope: form.scope }
  const subdir = form.subdir.trim()
  return { git: location, ref: form.ref.trim(), ...(subdir ? { subdir } : {}), scope: form.scope }
}

// The form with what the manifest says filled in: its id and contract version.
export function applyPreview(form: PluginForm, preview: PluginPreview): PluginForm {
  return {
    ...form,
    ...(preview.id ? { id: preview.id } : {}),
    ...(preview.contract !== undefined ? { contract: String(preview.contract) } : {}),
  }
}

// Why the What step can't go on, or null.
export function previewProblem(form: PluginForm, preview: PluginPreview | null, supported: number[]): string | null {
  if (!preview) return 'Avoozl has not looked at the source yet.'
  if (preview.error) return preview.error
  if (preview.contract !== undefined && preview.supported === false)
    return `The plugin is built for contract version ${preview.contract}; this Avoozl loads ${supported.join(', ') || '1'}.`
  const want = form.where === 'package' ? form.version.trim() : ''
  if (want && preview.version && want !== preview.version)
    return `The installed package is version ${preview.version}, not ${want}. Install ${want} or clear the version.`
  return null
}

// Shared needs a folder written relative to the repository.
export function sharedBlocked(form: PluginForm): string | null {
  if (form.where === 'path' && /^(?:\/|~|[A-Za-z]:[\\/])/.test(form.path.trim()))
    return 'A shared folder must be a path inside the repository, written relative to it.'
  return null
}

// The plugin.add input for a form, or the first problem a person must fix.
// The backend checks everything again.
export function addInput(form: PluginForm, confirmPublic = false): { input?: Record<string, unknown>; error?: string } {
  const id = form.id.trim()
  if (!/^[a-z][a-z0-9-]{0,60}$/.test(id)) return { error: 'Give the plugin a lowercase id.' }
  if (id === 'local' || id === 'github') return { error: `${id} is a built-in route.` }
  const location = locationOf(form)
  if (!location)
    return {
      error:
        form.where === 'path' ? 'Name the plugin folder.' : form.where === 'git' ? 'Give the git URL.' : 'Name the package.',
    }
  const ref = form.ref.trim(),
    subdir = form.subdir.trim()
  if (form.where === 'git' && !ref) return { error: 'Give a tag, branch or commit.' }
  const contract = Number(form.contract)
  if (!Number.isInteger(contract)) return { error: 'Pick a contract version.' }
  let config: unknown
  if (form.config.trim()) {
    try {
      config = JSON.parse(form.config)
    } catch {
      return { error: 'Config must be a JSON object.' }
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) return { error: 'Config must be a JSON object.' }
  }
  return {
    input: {
      scope: form.scope,
      confirmPublic,
      entry: {
        id,
        [form.where]: location,
        ...(form.where === 'git' ? { ref, ...(subdir ? { subdir } : {}) } : {}),
        contract,
        ...(config ? { config } : {}),
      },
    },
  }
}

// What the row says in one or two words, and whether it needs a person.
export function stateLabel(row: PluginRow): { label: string; attention: boolean } {
  if (row.state === 'approved')
    return row.health?.state === 'unavailable'
      ? { label: 'Unavailable', attention: true }
      : { label: 'Approved', attention: false }
  const labels: Record<PluginState, string> = {
    invalid: 'Invalid',
    missing: 'Missing',
    unsupported: 'Unsupported',
    disabled: 'Disabled',
    unapproved: 'Needs approval',
    changed: 'Changed: approve again',
    approved: 'Approved',
  }
  return { label: labels[row.state], attention: row.state !== 'disabled' }
}

// Approve is offered only for a plugin Avoozl could hash and can load.
export const canApprove = (row: PluginRow) => Boolean(row.hash) && (row.state === 'unapproved' || row.state === 'changed')

// The 409 the backend returns before writing a plugin into .avoozl.json.
export const publicWarning = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('body' in error)) return null
  try {
    const parsed = JSON.parse(String((error as { body: unknown }).body))
    return parsed?.code === 'plugin-public-repository' || /publish this plugin/.test(parsed?.error ?? '')
      ? String(parsed.error)
      : null
  } catch {
    return null
  }
}

export function pluginsClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    list: (workspaceId: string) => run<PluginList>('plugins.list', {}, workspaceId),
    // A plugin's lessons pack (design §4.18): preview reads; import is a person's.
    lessonsPreview: (workspaceId: string, id: string) => run<LessonsPackPreview>('plugin.lessons.preview', { id }, workspaceId),
    lessonsImport: (workspaceId: string, id: string, previewHash: string) => run<LessonsPackPreview>('plugin.lessons.import', { id, previewHash }, workspaceId),
    // What a source holds, before anything is declared. Reads only.
    preview: (workspaceId: string, input: Record<string, unknown>) => run<PluginPreview>('plugin.preview', input, workspaceId),
    add: (workspaceId: string, input: Record<string, unknown>) => run<PluginRow>('plugin.add', input, workspaceId),
    // The exact version, hash and, for git, commit the person was shown (R34.4, R34.14).
    approve: (workspaceId: string, row: PluginRow) =>
      run<PluginRow>(
        'plugin.approve',
        { id: row.id, version: row.version, hash: row.hash, ...(row.commit ? { commit: row.commit } : {}) },
        workspaceId,
      ),
    // A git plugin: resolve its ref again and fetch that commit.
    update: (workspaceId: string, id: string) => run<PluginRow>('plugin.update', { id }, workspaceId),
    disable: (workspaceId: string, id: string, disabled: boolean) =>
      run<PluginRow>('plugin.disable', { id, disabled }, workspaceId),
    remove: (workspaceId: string, id: string) => run<{ id: string; removed: boolean }>('plugin.remove', { id }, workspaceId),
    // What importing the pack would change. Reads only.
    packPreview: (workspaceId: string, id: string) => run<PackPreview>('plugin.pack.preview', { id }, workspaceId),
    // The exact preview the person saw (R55.5).
    packImport: (workspaceId: string, input: Record<string, unknown>) => run<PackPreview>('plugin.pack.import', input, workspaceId),
  }
}

// Intake sources (design §4.12, R50.6): sources other than GitHub, declared
// under `intake.sources` on this computer or in `.avoozl.json`.
export interface SourceItems {
  total: number
  untriaged: number
  lastAt: string | null
}

export interface IntakeSourceRow {
  id: string | null
  scope: 'machine' | 'repository'
  entry: Record<string, unknown> | null
  error: string | null
  state?: { cursor: string | null; readAt: string | null; error: string | null; more?: boolean; refused?: unknown[] } | null
  // What it holds (absent from older backends).
  items?: SourceItems
}

// GitHub's own intake: set in Settings > GitHub, shown here read-only.
export interface IntakeGitHub {
  mode: string | null
  repositories: { repository: string; checkedAt: string | null; error: string | null }[]
  items?: SourceItems
}

export interface SourceForm {
  id: string
  via: string
  repository: string
  labelFields: string
  assigneeField: string
  // Who counts, for a plugin source: a minimum permission, or named people.
  who: 'permission' | 'people'
  minimumPermission: string
  allowedActors: string
  scope: 'machine' | 'repository'
}

export const emptySourceForm = (): SourceForm => ({ id: '', via: 'mcp', repository: '', labelFields: '', assigneeField: '', who: 'permission', minimumPermission: '', allowedActors: '', scope: 'machine' })

export const PERMISSIONS = ['read', 'triage', 'write', 'maintain', 'admin'] as const
export const DEFAULT_PERMISSION = 'write'

const SOURCE_ID = /^[a-z][a-z0-9-]{0,60}$/
const list = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

// The entry a form saves, or the first thing to fix and its field. The
// backend checks again.
export function sourceEntry(form: SourceForm, taken: string[]): { id?: string; entry?: Record<string, unknown>; error?: string; field?: keyof SourceForm } {
  const id = form.id.trim()
  if (!SOURCE_ID.test(id)) return { error: 'Name the source with lowercase letters, digits and dashes.', field: 'id' }
  if (id === 'github' || id === 'local' || id === 'retro') return { error: `${id} is built in.`, field: 'id' }
  if (taken.includes(id)) return { error: `A source named ${id} already exists.`, field: 'id' }
  if (!form.repository.trim()) return { error: 'Pick the repository its work lands in.', field: 'repository' }
  const fields = list(form.labelFields)
  // Who counts applies to a plugin's items only: an MCP caller is you.
  const plugin = form.via !== 'mcp'
  const people = plugin && form.who === 'people' ? list(form.allowedActors) : []
  if (plugin && form.who === 'people' && !people.length) return { error: 'Name at least one person, or choose a permission.', field: 'allowedActors' }
  return {
    id,
    entry: {
      via: form.via,
      repository: form.repository.trim(),
      ...(fields.length ? { labelFields: fields } : {}),
      ...(form.assigneeField.trim() ? { assigneeField: form.assigneeField.trim() } : {}),
      ...(people.length ? { allowedActors: people } : {}),
      ...(plugin && form.who === 'permission' && form.minimumPermission ? { minimumPermission: form.minimumPermission } : {}),
    },
  }
}

// "Plugin ticket-tracker" or "MCP", from a source's `via`.
export function viaLabel(via: unknown): string {
  const text = String(via ?? '')
  return text.startsWith('plugin:') ? `Plugin ${text.slice(7)}` : text === 'mcp' ? 'MCP (a script or cron job sends items)' : text || 'Unknown'
}

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

export type SourceTone = 'ok' | 'off' | 'error' | 'waiting'

// A source's one status: on, off, an error, or waiting for its first item,
// with its last poll and item counts.
export function sourceStatus(row: IntakeSourceRow, plugins: PluginRow[], now = Date.now()): { tone: SourceTone; label: string; facts: string[]; problem: string | null } {
  const via = String(row.entry?.via ?? '')
  const pluginId = via.startsWith('plugin:') ? via.slice(7) : null
  const plugin = pluginId ? plugins.find((p) => p.id === pluginId) : null
  const items = row.items
  const facts: string[] = []
  if (pluginId) facts.push(row.state?.readAt ? `Polled ${relativeTime(row.state.readAt, now)}${row.state.more ? ', more next tick' : ''}` : 'Not polled yet')
  if (items) facts.push(`${items.total} item${items.total === 1 ? '' : 's'}, ${items.untriaged} untriaged`)
  if (items?.lastAt) facts.push(`newest ${relativeTime(items.lastAt, now)}`)
  const refused = row.state?.refused?.length ?? 0
  if (refused) facts.push(`${refused} refused`)
  if (row.error) return { tone: 'error', label: 'Not used', facts, problem: row.error }
  if (plugin && plugin.state !== 'approved')
    return { tone: 'off', label: 'Off', facts, problem: `Plugin ${pluginId} is ${stateLabel(plugin).label.toLowerCase()}. Turn it on in its plugin card above.` }
  if (row.state?.error) return { tone: 'error', label: 'Error', facts, problem: row.state.error }
  if (pluginId) return row.state?.readAt ? { tone: 'ok', label: 'On', facts, problem: null } : { tone: 'waiting', label: 'Waiting', facts, problem: null }
  return items?.total ? { tone: 'ok', label: 'On', facts, problem: null } : { tone: 'waiting', label: 'No item yet', facts, problem: null }
}

// What a source's items can set off (design §4.12): a plugin poll runs the
// full trigger rules if the plugin says who acted; an MCP caller's items
// meet only pause and quarantine rules.
export function sourceTriggers(row: IntakeSourceRow, plugins: PluginRow[]): { level: string; line: string } {
  const via = String(row.entry?.via ?? '')
  if (!via.startsWith('plugin:'))
    return { level: 'Untriaged only', line: 'Rules can only pause or quarantine its items. You start work with Plan this or Deliver this.' }
  const id = via.slice(7)
  const plugin = plugins.find((p) => p.id === id)
  if (plugin && !plugin.capabilities?.tracker?.includes('actor'))
    return { level: 'No rules', line: `Plugin ${id} can't say who acted, so no rule runs. Items wait in Untriaged.` }
  return { level: 'Full rules', line: 'Its rules can start, deliver, pause or quarantine work, when the person who acted counts.' }
}

// Who counts on a saved source, in words.
export function whoCounts(entry: Record<string, unknown> | null): string {
  if (!entry || entry.via === 'mcp') return 'Not used: an MCP caller is you'
  const people = strings(entry.allowedActors)
  const permission = typeof entry.minimumPermission === 'string' ? entry.minimumPermission : null
  if (people.length) return `${people.join(', ')}${permission ? `, or anyone with ${permission} or higher` : ''}`
  return `Anyone with ${permission ?? DEFAULT_PERMISSION} or higher${permission ? '' : ' (default)'}`
}

export const listText = (value: unknown) => strings(value).join(', ')

export function intakeClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    list: (workspaceId: string) => run<{ sources: IntakeSourceRow[]; github?: IntakeGitHub }>('intake.sources', {}, workspaceId),
    add: (workspaceId: string, input: { id: string; entry: Record<string, unknown>; scope: string; confirmPublic: boolean }) =>
      run<{ sources: IntakeSourceRow[] }>('intake.source.add', input, workspaceId),
    remove: (workspaceId: string, row: IntakeSourceRow) =>
      run<{ sources: IntakeSourceRow[] }>('intake.source.remove', { id: row.id, scope: row.scope }, workspaceId),
  }
}

export interface LessonsPackPreview {
  plugin: string
  version: string
  hash: string
  rows: { id: string; packId: string; finding: string; action: 'add' | 'change' | 'keep' | 'retire' }[]
}

// One line for a lessons pack preview: how many lessons each action touches.
export function lessonsPackText(preview: LessonsPackPreview): string {
  const count = (action: string) => preview.rows.filter((r) => r.action === action).length
  return `Version ${preview.version}: ${count('add')} new, ${count('change')} changed, ${count('keep')} unchanged, ${count('retire')} retired.`
}
