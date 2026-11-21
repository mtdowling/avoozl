// Calls and pure helpers for Settings > Plugins (design §4.8, R34.4, R34.9).
// The backend inspects, validates and writes; this module only shapes the
// list and the Add plugin form. Keep it free of JSX and runtime imports so
// node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { relativeTime } from './task-api.ts'
import type { PluginChecksPart } from './plugin-checks-api.ts'
import type { ContextPart } from './context-api.ts'

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
  // A git plugin's source and the commit this machine pinned it to (R34.13).
  git?: { url: string; ref: string; subdir?: string }
  commit?: string
  config?: Record<string, unknown>
  state: PluginState
  reason: string | null
  // A credentials part's claim: the hosts and owners it signs Avoozl in to.
  credentials?: { hosts: string[]; owners: string[] | null }
  approval?: { version: string; hash: string; commit?: string; approvedAt: string }
  health: PluginHealth | null
  // A checks part: its checks, prompts and servers (plugin-checks PK7.2).
  checks?: PluginChecksPart
  // A context part: skills, reads and MCP servers for its owner's own work.
  context?: ContextPart
  // The newest update check (R34.17), or null before one.
  update?: PluginUpdate | null
}

// What the daily update check found. It never fetches or installs.
export interface PluginUpdate {
  state: 'newer' | 'current' | 'failed'
  kind?: 'commit' | 'tag' | 'version' | 'files'
  current?: string
  latest?: string
  moved?: string
  reason?: string
  checkedAt: string
}

export interface PluginList {
  supportedContracts: number[]
  plugins: PluginRow[]
  credentialsPick?: Record<string, string>
  // The daily update check's switch, kept in this machine's plugins.json.
  updateChecks?: { enabled: boolean }
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

// What plugin.preview found before anything was declared.
export interface PluginPreview {
  error?: string
  location?: string
  id?: string
  version?: string
  contract?: number
  provides?: string[]
  kinds?: string[]
  capabilities?: Record<string, string[]>
  credentials?: { hosts: string[]; owners: string[] | null }
  context?: ContextPart
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
  rules: { title: 'Content rules', line: 'Rule sets supplied while Avoozl runs. The terms never go into Git.' },
  credentials: { title: 'GitHub sign-in', line: 'Hands Avoozl short-lived GitHub tokens, one per job, from a process of its own.' },
  context: { title: 'Epic context', line: 'Skills, read folders and MCP servers a worker gets on its owner’s own approved spec tasks. Kept on this machine.' },
  checks: { title: 'Checks', line: 'Checks Avoozl runs on the repositories they name, kept on this machine. Results never go to GitHub.' },
}

// What a credentials plugin claims (plugin-credentials PC2.3), one line per
// host: "acme-github will sign Avoozl in to github.com for acme, acme-labs."
export function signInClaims(row: { id: string | null; credentials?: { hosts: string[]; owners: string[] | null } }): string[] {
  if (!row.credentials) return []
  const owners = row.credentials.owners
  return row.credentials.hosts.map(
    (host) =>
      `${row.id} will sign Avoozl in to ${host}${owners ? ` for ${owners.join(', ')}` : ''}. Every GitHub call Avoozl makes there${owners ? ' for them' : ''} will use its tokens.`,
  )
}

// Hosts where two or more approved credentials plugins claim one owner
// (PC2.5): each needs a pick, kept in this machine's plugins.json.
export function signInClashes(rows: PluginRow[]): { host: string; plugins: string[] }[] {
  const claiming = rows.filter((row) => row.credentials && row.source === 'machine' && row.state !== 'disabled' && row.approval)
  const out: { host: string; plugins: string[] }[] = []
  const hosts = new Set(claiming.flatMap((row) => row.credentials!.hosts))
  for (const host of hosts) {
    const here = claiming.filter((row) => row.credentials!.hosts.includes(host))
    const overlap = here.filter((a) =>
      here.some(
        (b) =>
          b !== a &&
          (!a.credentials!.owners || !b.credentials!.owners || a.credentials!.owners.some((o) => b.credentials!.owners!.some((p) => p.toLowerCase() === o.toLowerCase()))),
      ),
    )
    if (overlap.length > 1) out.push({ host, plugins: overlap.map((row) => row.id ?? '') })
  }
  return out
}

// A row's parts; a plugin from before `provides` has one part per kind.
export const partsOf = (row: { provides?: string[]; kinds?: string[] }) => row.provides ?? row.kinds ?? []
export const partTitles = (row: { provides?: string[]; kinds?: string[] }) => partsOf(row).map((part) => PLUGIN_PARTS[part]?.title ?? part)

// Each code part runs in a Node child process, so the runtime is node; a
// plugin of data parts only runs nothing.
export const runsAs = (kinds: string[] | undefined): string | undefined => (kinds === undefined ? undefined : kinds.length ? 'node' : 'nothing: settings only')

// Each kind with its optional features: "rules", or "rules, x".
export const capabilityLine = (capabilities: Record<string, string[]> | undefined): string | undefined =>
  capabilities
    ? Object.entries(capabilities)
        .map(([kind, list]) => [kind, ...list].join(', '))
        .join('; ') || undefined
    : undefined

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
  if (want && preview.version && want !== preview.version) return `The installed package is version ${preview.version}, not ${want}. Install ${want} or clear the version.`
  return null
}

// Shared needs a folder written relative to the repository.
export function sharedBlocked(form: PluginForm): string | null {
  if (form.where === 'path' && /^(?:\/|~|[A-Za-z]:[\\/])/.test(form.path.trim())) return 'A shared folder must be a path inside the repository, written relative to it.'
  return null
}

// The plugin.add input for a form, or the first problem a person must fix.
// The backend checks everything again.
export function addInput(form: PluginForm, confirmPublic = false): { input?: Record<string, unknown>; error?: string } {
  const id = form.id.trim()
  if (!/^[a-z][a-z0-9-]{0,60}$/.test(id)) return { error: 'Give the plugin a lowercase id.' }
  if (id === 'local' || id === 'github') return { error: `${id} is a reserved id.` }
  const location = locationOf(form)
  if (!location)
    return {
      error: form.where === 'path' ? 'Name the plugin folder.' : form.where === 'git' ? 'Give the git URL.' : 'Name the package.',
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
  if (row.state === 'approved') return row.health?.state === 'unavailable' ? { label: 'Unavailable', attention: true } : { label: 'Approved', attention: false }
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

// The update badge: "Update available: v1.2.0 (was v1.0.0)", or null.
export function updateBadge(update: PluginUpdate | null | undefined): string | null {
  if (update?.state !== 'newer') return null
  if (update.kind === 'tag' || update.kind === 'version') return `Update available: ${update.latest} (was ${update.current})`
  if (update.kind === 'files') return 'Update available: files changed on disk'
  return `Update available: new commit ${String(update.latest ?? '').slice(0, 7)}`
}

// The quiet line under a plugin: when it was last checked, or why it
// couldn't be.
export function updateLine(update: PluginUpdate | null | undefined, now = Date.now()): string | null {
  if (!update) return null
  if (update.state === 'failed') return `Couldn't check for updates ${relativeTime(update.checkedAt, now)}: ${update.reason ?? 'no answer'}`
  if (update.state === 'newer') {
    const next =
      update.kind === 'version' ? 'Install it into the plugin folder, then approve it.' : update.kind === 'files' ? 'Approve it to run the new files.' : 'Update, then approve it.'
    return `Checked ${relativeTime(update.checkedAt, now)}. ${next} Nothing new runs until you approve.`
  }
  return `Up to date, checked ${relativeTime(update.checkedAt, now)}`
}

// Approve is offered only for a plugin Avoozl could hash and can load.
export const canApprove = (row: PluginRow) => Boolean(row.hash) && (row.state === 'unapproved' || row.state === 'changed')

// The 409 the backend returns before writing a plugin into .avoozl.json.
export const publicWarning = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('body' in error)) return null
  try {
    const parsed = JSON.parse(String((error as { body: unknown }).body))
    return parsed?.code === 'plugin-public-repository' || /publish this plugin/.test(parsed?.error ?? '') ? String(parsed.error) : null
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
    // What a source holds, before anything is declared. Reads only.
    preview: (workspaceId: string, input: Record<string, unknown>) => run<PluginPreview>('plugin.preview', input, workspaceId),
    add: (workspaceId: string, input: Record<string, unknown>) => run<PluginRow>('plugin.add', input, workspaceId),
    // The exact version, hash and, for git, commit the person was shown (R34.4, R34.14).
    approve: (workspaceId: string, row: PluginRow) =>
      run<PluginRow>('plugin.approve', { id: row.id, version: row.version, hash: row.hash, ...(row.commit ? { commit: row.commit } : {}) }, workspaceId),
    // A git plugin: resolve its ref again and fetch that commit.
    update: (workspaceId: string, id: string) => run<PluginRow>('plugin.update', { id }, workspaceId),
    disable: (workspaceId: string, id: string, disabled: boolean) => run<PluginRow>('plugin.disable', { id, disabled }, workspaceId),
    remove: (workspaceId: string, id: string) => run<{ id: string; removed: boolean }>('plugin.remove', { id }, workspaceId),
    // Check now: ask whether something newer exists, for one plugin or all.
    // It fetches nothing.
    checkUpdates: (workspaceId: string, id?: string) => run<Record<string, PluginUpdate>>('plugin.updates.check', id ? { id } : {}, workspaceId),
    configureUpdates: (workspaceId: string, enabled: boolean) => run<{ enabled: boolean }>('plugin.updates.configure', { enabled }, workspaceId),
    // Use this one: the credentials plugin that serves a host where two claim one owner.
    pick: (workspaceId: string, host: string, id: string) => run<{ host: string; id: string }>('plugin.credentials.pick', { host, id }, workspaceId),
  }
}
