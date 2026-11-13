// Calls and pure helpers for the Routing page (design §8.3, R42, R53.11).
// The backend (src/app/routing.mjs) evaluates placement; this module only
// reads, formats, and builds the edits. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface Reading {
  source: string
  measuredAt: string | null
  memFreeGb: number | null
  diskFreeGb: number | null
  loadPerCpu: number | null
}

export interface Crew {
  id: string
  name: string
  tags: string[]
  trust: 'local' | 'remote'
  gitHosts: string[]
  chatLimit: number
  chatLimitSet: boolean
  delivery: 'handback' | 'push' | null
  sshHost: string | null
  worktreeRoot: string | null
  configured: boolean
  reading: Reading | null
  ageSeconds: number | null
  running: number
  available: boolean
  why: string | null
}

export interface SessionChoice {
  agent?: string
  model?: string
  weight?: number
}
export interface Session {
  agent?: string
  model?: string
  choices?: SessionChoice[]
}

export interface Rule {
  id: string
  when?: Partial<Record<'labels' | 'kinds' | 'roles' | 'repositories' | 'categories' | 'paths', string[]>>
  route?: string
  on?: string
  requireTags?: string[]
  forbidTags?: string[]
  keepLocal?: boolean
  session?: Session
  source?: 'workspace' | 'repository' | 'machine'
  repository?: string
  sessionApplies?: boolean
}

export interface Routing {
  rules?: Rule[]
  pick?: { preset?: string; weights?: Record<string, number> }
  router?: { enabled?: boolean; model?: string | null; timeoutSeconds?: number; instructions?: string }
}

export interface RoutingView {
  crews: Crew[]
  staleSeconds: number | null
  machineHash: string | null
  configHash: string | null
  rules: Rule[]
  workspace: Routing
  repositories: Record<string, Routing>
  machine: Routing
  pick: { preset: string; weights: Record<string, number> }
  router: { enabled: boolean; model: string | null; timeoutSeconds: number; hasInstructions: boolean }
  instructions: string | null
  mc10: boolean
  remoteDispatch: boolean
  noFit: { taskId: string; why: string; text: string }[]
  labels: string[]
}

export interface PreviewItem {
  taskId: string
  title: string
  route: string
  crew: string | null
  agent: string | null
  model: string | null
  sessionReason: string | null
  reason: string
  noFit: boolean
  whyNot: { crew: string; by: string }[]
}

export const DEFAULT_CHAT_LIMIT = { local: 3, remote: 2 }
export const DEFAULT_STALE_SECONDS = 120
export const TAG_KEYS = ['os', 'arch', 'tools', 'trust'] as const
export const ROLES = ['worker', 'checks', 'reviewer'] as const
export const MC10_LINE = 'Remote placement waits on Kiro Crew (MC-10). Every chat runs on local.'
export const PRESETS = [
  { key: 'balanced', title: 'Balanced', line: 'Weigh free chats, memory, disk, and load, with a small lean to this machine.', when: 'mixed work on a few crews (the default).' },
  { key: 'keep-local', title: 'Keep local', line: 'Run here unless this machine is full.', when: 'remote crews are for overflow only.' },
  { key: 'spread-out', title: 'Spread out', line: 'Spread sessions across every allowed crew.', when: 'many independent leaves.' },
] as const
export const WEIGHT_LABELS: Record<string, string> = {
  slots: 'Free chats',
  memory: 'Free memory',
  disk: 'Free disk',
  load: 'Low load',
  avoozl: 'Avoozl chats already there (minus)',
  local: 'This machine',
}

const list = (values?: string[]) => (values && values.length ? values.join(', ') : '')

// "When <match>" for a rule row.
export function whenText(rule: Rule): string {
  const w = rule.when || {}
  const parts = [
    w.labels?.length ? `label ${list(w.labels)}` : '',
    w.kinds?.length ? `kind ${list(w.kinds)}` : '',
    w.roles?.length ? `role ${w.roles.join('/')}` : '',
    w.repositories?.length ? `repository ${list(w.repositories)}` : '',
    w.categories?.length ? `category ${list(w.categories)}` : '',
    w.paths?.length ? list(w.paths) : '',
  ].filter(Boolean)
  return parts.length ? `When ${parts.join(', ')}` : 'Every task'
}

export function routeText(route?: string): string {
  if (!route || route === 'local') return 'local worker'
  if (route === 'github') return 'GitHub route'
  return route
}

export function onText(rule: Rule): string {
  if (rule.keepLocal) return 'local only'
  const on = rule.on || 'local'
  const tags = [...(rule.requireTags || []).map((t) => t), ...(rule.forbidTags || []).map((t) => `not ${t}`)]
  const base = on === 'any' ? 'any crew' : on.startsWith('tags:') ? on.slice(5).split(',').join(' ') : on
  return tags.length ? `${base} (${tags.join(', ')})` : base
}

export function sessionText(session?: Session): string {
  if (!session) return ''
  if (session.choices) return `as ${session.choices.length} choices`
  const parts = [session.agent, session.model].filter(Boolean)
  return parts.length ? `as ${parts.join(' / ')}` : ''
}

// One rule row: "When <match> -> <route> on <crews> as <agent / model>".
export function ruleText(rule: Rule): string {
  return [whenText(rule), '->', routeText(rule.route), 'on', onText(rule), sessionText(rule.session)].filter(Boolean).join(' ')
}

// Issue Radar and plugin routes open no Avoozl session, so `session` does
// not apply (R53.12).
export const sessionNote = (rule: Rule) =>
  rule.route && rule.route !== 'local' ? 'Session does not apply: this route opens no Avoozl session.' : null

export function readingText(crew: Crew): { load: string; mem: string; disk: string; health: string } {
  const r = crew.reading
  const n = (v: number | null | undefined, unit: string, digits = 0) => (v === null || v === undefined ? '–' : `${v.toFixed(digits)}${unit}`)
  const age = crew.ageSeconds === null ? '' : crew.ageSeconds < 90 ? `${crew.ageSeconds}s` : `${Math.round(crew.ageSeconds / 60)}m`
  return {
    load: n(r?.loadPerCpu, '', 1),
    mem: n(r?.memFreeGb, ' GB'),
    disk: n(r?.diskFreeGb, ' GB'),
    health: crew.available ? `ok ${age}`.trim() : /stale/.test(crew.why || '') ? `stale ${age}`.trim() : (crew.why ?? 'unavailable'),
  }
}

export const chatPlaceholder = (crew: Pick<Crew, 'id'>) =>
  String(crew.id === 'local' ? DEFAULT_CHAT_LIMIT.local : DEFAULT_CHAT_LIMIT.remote)

// The side form for a crew's settings, as text fields.
export interface CrewForm {
  tags: string
  trust: 'local' | 'remote'
  gitHosts: string
  chatLimit: string
  delivery: '' | 'handback' | 'push'
  sshHost: string
  worktreeRoot: string
}

export function toCrewForm(crew: Crew): CrewForm {
  return {
    tags: crew.tags.filter((t) => !t.startsWith('trust:')).join(' '),
    trust: crew.trust,
    gitHosts: crew.gitHosts.join(' '),
    chatLimit: crew.chatLimitSet ? String(crew.chatLimit) : '',
    delivery: crew.id === 'local' || !crew.configured ? '' : (crew.delivery ?? ''),
    sshHost: crew.sshHost ?? '',
    worktreeRoot: crew.worktreeRoot ?? '',
  }
}

const words = (text: string) => text.split(/[\s,]+/).filter(Boolean)

// One crew's machine-local entry, or an error naming the field.
export function toCrewEntry(id: string, form: CrewForm): { entry?: Record<string, unknown>; error?: string } {
  const tags = words(form.tags)
  for (const tag of tags) {
    const key = tag.split(':')[0]
    if (!tag.includes(':') || !(TAG_KEYS as readonly string[]).includes(key))
      return { error: `Tag ${tag}: use key:value with key ${TAG_KEYS.join(', ')}.` }
  }
  const entry: Record<string, unknown> = { tags: [...tags.filter((t) => !t.startsWith('trust:')), `trust:${id === 'local' ? 'local' : form.trust}`] }
  const hosts = words(form.gitHosts)
  if (hosts.length) entry.gitHosts = hosts
  if (form.chatLimit.trim()) {
    const n = Number(form.chatLimit)
    if (!Number.isInteger(n) || n < 0 || n > 32) return { error: 'Chat limit is a whole number 0–32.' }
    entry.chatLimit = n
  }
  if (id !== 'local') {
    if (form.delivery) entry.delivery = form.delivery
    if (form.sshHost.trim()) entry.sshHost = form.sshHost.trim()
    if (form.worktreeRoot.trim()) {
      if (!form.worktreeRoot.trim().startsWith('/')) return { error: 'Worktree folder is an absolute folder on that crew.' }
      entry.worktreeRoot = form.worktreeRoot.trim()
    }
  }
  return { entry }
}

// Every crew's current machine entry, from the view, for a whole-map save.
export function crewMap(crews: Crew[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const crew of crews) {
    if (!crew.configured) continue
    const built = toCrewEntry(crew.id, toCrewForm(crew))
    if (built.entry) out[crew.id] = built.entry
  }
  return out
}

// The rule side form.
export interface RuleForm {
  id: string
  saveIn: string // workspace | machine | repository:<id>
  labels: string[]
  kinds: string
  roles: string[]
  repositories: string
  categories: string
  paths: string
  route: string
  on: string // local | any | tags | <crew id>
  onTags: string[]
  requireTags: string[]
  forbidTags: string[]
  keepLocal: boolean
  agent: string
  model: string
  choices: { agent: string; model: string; weight: string }[]
}

export const emptyRuleForm = (): RuleForm => ({
  id: '',
  saveIn: 'workspace',
  labels: [],
  kinds: '',
  roles: [],
  repositories: '',
  categories: '',
  paths: '',
  route: '',
  on: '',
  onTags: [],
  requireTags: [],
  forbidTags: [],
  keepLocal: false,
  agent: '',
  model: '',
  choices: [],
})

export function toRuleForm(rule: Rule): RuleForm {
  const w = rule.when || {}
  const on = rule.on || ''
  return {
    id: rule.id,
    saveIn: rule.source === 'machine' ? 'machine' : rule.source === 'repository' ? `repository:${rule.repository}` : 'workspace',
    labels: w.labels || [],
    kinds: list(w.kinds),
    roles: w.roles || [],
    repositories: list(w.repositories),
    categories: list(w.categories),
    paths: list(w.paths),
    route: rule.route || '',
    on: on.startsWith('tags:') ? 'tags' : on,
    onTags: on.startsWith('tags:') ? on.slice(5).split(',') : [],
    requireTags: rule.requireTags || [],
    forbidTags: rule.forbidTags || [],
    keepLocal: Boolean(rule.keepLocal),
    agent: rule.session && !rule.session.choices ? (rule.session.agent ?? '') : '',
    model: rule.session && !rule.session.choices ? (rule.session.model ?? '') : '',
    choices: (rule.session?.choices || []).map((c) => ({ agent: c.agent ?? '', model: c.model ?? '', weight: c.weight ? String(c.weight) : '' })),
  }
}

const csv = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean)

export function toRule(form: RuleForm): { rule?: Rule; error?: string } {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(form.id)) return { error: 'Name is required: lowercase letters, digits, or -.' }
  const when: NonNullable<Rule['when']> = {}
  if (form.labels.length) when.labels = form.labels
  if (csv(form.kinds).length) when.kinds = csv(form.kinds)
  if (form.roles.length) when.roles = form.roles
  if (csv(form.repositories).length) when.repositories = csv(form.repositories)
  if (csv(form.categories).length) when.categories = csv(form.categories)
  if (csv(form.paths).length) when.paths = csv(form.paths)
  const rule: Rule = { id: form.id }
  if (Object.keys(when).length) rule.when = when
  if (form.route) rule.route = form.route
  if (form.on === 'tags') {
    if (!form.onTags.length) return { error: 'Run on tags: pick at least one tag.' }
    rule.on = `tags:${form.onTags.join(',')}`
  } else if (form.on) {
    if (!['local', 'any'].includes(form.on) && form.saveIn !== 'machine')
      return { error: 'A crew name is allowed only when Save in is this machine.' }
    rule.on = form.on
  }
  if (form.requireTags.length) rule.requireTags = form.requireTags
  if (form.forbidTags.length) rule.forbidTags = form.forbidTags
  if (form.keepLocal) rule.keepLocal = true
  if (form.choices.length) {
    if (form.choices.length > 10) return { error: 'At most 10 choices.' }
    const choices: SessionChoice[] = []
    for (const [i, c] of form.choices.entries()) {
      const choice: SessionChoice = {}
      if (c.agent.trim()) choice.agent = c.agent.trim()
      if (c.model.trim()) choice.model = c.model.trim()
      if (c.weight.trim()) {
        const n = Number(c.weight)
        if (!Number.isInteger(n) || n < 1 || n > 100) return { error: `Choice ${i + 1}: weight is a whole number 1–100.` }
        choice.weight = n
      }
      choices.push(choice)
    }
    rule.session = { choices }
  } else if (form.agent.trim() || form.model.trim()) {
    rule.session = {
      ...(form.agent.trim() ? { agent: form.agent.trim() } : {}),
      ...(form.model.trim() ? { model: form.model.trim() } : {}),
    }
  }
  return { rule }
}

const strip = (rule: Rule): Rule => {
  const { source, repository, sessionApplies, ...rest } = rule
  void source
  void repository
  void sessionApplies
  return rest
}

// The rules of one source, as saved, from the merged view.
export function rulesIn(view: RoutingView, saveIn: string): Rule[] {
  return view.rules
    .filter((r) =>
      saveIn === 'machine'
        ? r.source === 'machine'
        : saveIn === 'workspace'
          ? r.source === 'workspace'
          : r.source === 'repository' && `repository:${r.repository}` === saveIn,
    )
    .map(strip)
}

// The `routing` object for one source after replacing its rules, keeping
// its pick and router.
export function withRules(view: RoutingView, saveIn: string, rules: Rule[]): Routing {
  const base: Routing =
    saveIn === 'machine' ? { ...view.machine } : saveIn === 'workspace' ? { ...view.workspace } : { ...(view.repositories[saveIn.slice(11)] || {}) }
  const next: Routing = { ...base, rules }
  if (!rules.length) delete next.rules
  if (next.pick && !Object.keys(next.pick).length) delete next.pick
  if (next.router && !Object.keys(next.router).length) delete next.router
  return next
}

// Move one rule within its source (drag to reorder).
export function moveRule(rules: Rule[], from: number, to: number): Rule[] {
  const out = [...rules]
  const [item] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item)
  return out
}

export function routingClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string) => run<RoutingView>(workspaceId, 'routing.view'),
    preview: (workspaceId: string) => run<{ mc10: boolean; items: PreviewItem[] }>(workspaceId, 'routing.preview'),
    save: (workspaceId: string, input: { where: string; routing: Routing; expectedHash: string | null }) =>
      run<{ hash: string }>(workspaceId, 'routing.update', input),
    saveCrews: (workspaceId: string, input: { crews?: Record<string, unknown>; staleSeconds?: number | null; expectedHash: string | null }) =>
      run(workspaceId, 'crews.update', input),
    pickAgain: (workspaceId: string, taskId: string) => run(workspaceId, 'delivery.pickAgain', { taskId }),
  }
}
