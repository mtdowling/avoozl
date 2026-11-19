// Calls and pure helpers for the Settings view: the GitHub policy in
// `.avoozl.json` (design §4.4). The backend validates and writes; this module
// only turns the policy into form fields and back. Keep it free of JSX and
// runtime imports so node can test it directly.
import { relativeTime } from './task-api.ts'
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type Policy = Record<string, unknown>

export interface SettingsChoices {
  modes: string[]
  authorities: string[]
  permissions: string[]
  actions: string[]
  managedLabels: string[]
  crewLabels: string[]
}

export interface ReviewRole {
  id: string
  focus: string
  agent: string
  model: string | null
  distinctFrom: string
}

// Review roles from `.avoozl.json` `delivery`; read only on this page.
export interface ReviewSettings {
  error: string | null
  writerModel: string | null
  reviewers: ReviewRole[]
  repositories: Record<string, ReviewRole[]>
}

// A projection that stopped at GitHub's write limits and carries on by itself.
export interface WriteRun {
  planId: string
  done: number
  total: number
  resumeAt: string | null
}

// '312 of 1,740 writes, resumes at 14:00'.
export function writeRunText(run: WriteRun): string {
  const time = run.resumeAt ? new Date(run.resumeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  return `${run.done.toLocaleString('en-US')} of ${run.total.toLocaleString('en-US')} writes${time ? `, resumes at ${time}` : ''}`
}

// The last GitHub rate-limit numbers Avoozl saw (github-rate.mjs).
export interface RateView {
  // The effective github.cacheSeconds: how long Avoozl reuses a GitHub answer.
  cacheSeconds?: number
  resources: Record<string, { limit: number; remaining: number; resetAt: string }>
  limitedUntil: string | null
  limitedResource: string | null
  calls: number
  notModified: number
  notModifiedShare: number | null
  // The write pace in force, and the projection waiting on it, if any
  // (github-pacer.mjs).
  writes?: { perMinute: number; perHour: number; run: WriteRun | null }
  // Calls in the last hour by source, and their total (github-rate.mjs).
  bySource?: Record<string, { calls: number; notModified: number; cached: number }>
  hourCalls?: number
}

// One row per source for the last hour, the busiest first. Calls cost the
// limit; 304s and cache answers do not.
export function usageRows(rate: RateView | undefined | null) {
  return Object.entries(rate?.bySource ?? {})
    .map(([source, row]) => ({ source, ...row }))
    .sort((a, b) => b.calls - a.calls || a.source.localeCompare(b.source))
}

export type UsageKey = 'source' | 'calls' | 'notModified' | 'cached'
export type UsageSort = { key: UsageKey; dir: 'asc' | 'desc' }
// The default order: most calls first.
export const USAGE_SORT: UsageSort = { key: 'calls', dir: 'desc' }
// Sort the rows by one column. Ties fall back to the source name, so the
// order is stable. A new column starts descending for numbers, ascending for names.
export function sortUsage<T extends { source: string; calls: number; notModified: number; cached: number }>(rows: T[], sort: UsageSort): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const order = sort.key === 'source' ? a.source.localeCompare(b.source) : a[sort.key] - b[sort.key]
    return sign * order || a.source.localeCompare(b.source)
  })
}
export const nextUsageSort = (current: UsageSort, key: UsageKey): UsageSort =>
  current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'source' ? 'asc' : 'desc' }

// One short line per resource, then the share of calls GitHub answered with
// a free 304. Empty before Avoozl has made a call.
export function rateLines(rate: RateView | undefined | null): string[] {
  if (!rate) return []
  const lines = Object.entries(rate.resources).map(
    ([name, r]) => `${name}: ${r.remaining} of ${r.limit} left, resets ${new Date(r.resetAt).toLocaleTimeString()}`,
  )
  if (rate.limitedUntil) lines.unshift(`Limit reached (${rate.limitedResource}). Calls resume at ${new Date(rate.limitedUntil).toLocaleTimeString()}.`)
  if (rate.writes?.run)
    lines.unshift(`Projecting to GitHub: ${writeRunText(rate.writes.run)}. Writes are paced at ${rate.writes.perMinute} a minute and ${rate.writes.perHour} an hour.`)
  if (rate.notModifiedShare !== null) lines.push(`${Math.round(rate.notModifiedShare * 100)}% of ${rate.calls} calls answered 304 (free)`)
  return lines
}

export interface GitHubSettings {
  filename: string
  exists: boolean
  hash: string | null
  github: Policy
  effective: Policy | null
  error: string | null
  rate?: RateView
  review?: ReviewSettings
  choices: SettingsChoices
  // The file's own mode when it disagrees with the roles, else null (R105.8).
  rolesNote?: string | null
}

export interface Validation {
  valid: boolean
  error: string | null
}

export function settingsClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    get: (workspaceId: string) => run<GitHubSettings>('github.settings.get', {}, workspaceId),
    validate: (workspaceId: string, github: Policy) =>
      run<Validation>('github.settings.validate', { github }, workspaceId),
    save: (workspaceId: string, github: Policy, expectedHash: string | null) =>
      run<GitHubSettings>('github.settings.update', { github, expectedHash }, workspaceId),
    setup: (workspaceId: string, input: SetupInput) => run<SetupResult>('github.setup', { ...input }, workspaceId),
    // Stops a running apply before its next write.
    cancelSetup: (workspaceId: string, previewHash: string) => run<{ cancelled: boolean }>('github.setup.cancel', { previewHash }, workspaceId),
  }
}

// Set up GitHub wizard (design §8.2). The backend reads GitHub, previews
// every write, and writes only on confirm with the preview's hash.
export interface SetupInput {
  mode: string
  planningRepository?: string
  repositories?: string[]
  epic?: boolean
  confirm?: boolean
  previewHash?: string
}

export interface SetupWrite {
  step: string
  action: string
  object: string
  owner: string
  name: string
  visibility: string | null
  detail: string
}

export interface SetupStep {
  id: string
  title: string
  status: string
  notes: string[]
  reason: string | null
  fix: string | null
}

export interface SetupResult {
  writes: SetupWrite[]
  previewHash: string
  nothingToChange: boolean
  applied: boolean
  results?: (SetupWrite & { status: string; reason?: string })[]
  steps: SetupStep[]
  checklist: { id: string; text: string; link: string | null }[]
  settings: {
    github: Policy
    expectedHash: string | null
    changed: boolean
    diff: string
    error: string | null
  }
}

export interface SetupForm {
  mode: string
  planningRepository: string
  repositories: string
  epic: boolean
}

// Wizard defaults from the saved settings.
export function setupForm(github: Policy): SetupForm {
  return {
    mode: str(github.mode) || 'plans-repo',
    planningRepository: str(github.planningRepository),
    repositories: Object.keys(record(github.repositories)).join(', '),
    epic: true,
  }
}

// The operation input.
export function setupInput(form: SetupForm): SetupInput {
  return compact({
    mode: form.mode,
    planningRepository: form.mode === 'plans-repo' ? blank(form.planningRepository) : undefined,
    repositories: splitList(form.repositories),
    epic: form.epic,
  }) as unknown as SetupInput
}

// The `match` line for a legacy rule, written as the backend's formatMatch
// does, so Settings saves `match` from now on.
// shortcut: a label containing a double quote cannot be written in `match`;
// it is kept as typed and the backend refuses it on save. Rare on GitHub.
const quoteTerm = (value: string) => (/[\s,"]/.test(value) ? `"${value}"` : value)
export function legacyMatch(rule: Record<string, unknown>): string {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()) : [])
  const all = list(rule.labelsAll),
    any = list(rule.labelsAny),
    none = list(rule.labelsNone),
    assignee = typeof rule.assignee === 'string' ? rule.assignee.trim() : ''
  return [
    ...all.map((value) => `label:${quoteTerm(value)}`),
    ...(any.length ? [`label:${any.map(quoteTerm).join(',')}`] : []),
    ...(none.length ? [`-label:${none.map(quoteTerm).join(',')}`] : []),
    ...(assignee ? [`assignee:${assignee}`] : []),
  ].join(' ')
}

// What one `match` line means, and the open issues it matches now
// (`github.trigger.preview`, read only).
export interface MatchPreview {
  repository: string | null
  match: string
  parsed: { labelsAll: string[]; labelsAny: string[]; labelsNone: string[]; assignee: string | null; unassigned: boolean } | null
  error: string | null
  total: number | null
  issues: { number: number; title: string; url: string }[]
  searchError: string | null
}

export const MATCH_HELP = "Same syntax as GitHub's issue search. Supported: label:, -label:, assignee:, no:assignee."

// `untriaged` previews an Untriaged filter: no label: term needed, and pull
// requests count too.
export const matchClient = (api: AppApi) => (workspaceId: string, repository: string, match: string, untriaged = false) =>
  api
    .post<{ result: MatchPreview }>(COMMAND_PATH, {
      operation: 'github.trigger.preview',
      input: { match, ...(repository.trim() ? { repository: repository.trim() } : {}), ...(untriaged ? { untriaged: true } : {}) },
      workspaceId,
    })
    .then((reply) => reply.result)

// The parsed terms as chip groups, in the order the line reads them.
export function matchChips(parsed: MatchPreview['parsed']): { kind: 'all' | 'any' | 'none' | 'assignee'; values: string[] }[] {
  if (!parsed) return []
  return [
    { kind: 'all' as const, values: parsed.labelsAll },
    { kind: 'any' as const, values: parsed.labelsAny },
    { kind: 'none' as const, values: parsed.labelsNone },
    { kind: 'assignee' as const, values: parsed.unassigned ? ['nobody'] : parsed.assignee ? [parsed.assignee] : [] },
  ].filter((group) => group.values.length > 0)
}

export interface RuleForm {
  id: string
  action: string
  // One GitHub issue-search line (src/app/issue-match.mjs). A legacy rule's
  // labelsAll/labelsAny/labelsNone/assignee are converted into it on load.
  match: string
  author: string
}

export interface RepositoryForm {
  name: string
  baseBranch: string
  // local, code, planning or both (design §4.34); blank until chosen.
  role: string
  allowedActors: string
  minimumPermission: string
  requiredChecks: string
  // github.repositories.<id>.cacheSeconds; blank follows the workspace value.
  cacheSeconds: string
  // Release (RC4.5): the mode, and how many crews work the repository.
  releaseMode: string
  releaseCapacity: string
  priority: string
  // GitHub pull-request reviews as the review verdict (task 9.10): on, and how
  // many approvals from people the repository policy allows (1 to 10).
  pullRequestReviews: boolean
  reviewApprovals: string
  managedLabels: Record<string, string>
  crewLabels: Record<string, string>
  // The label that approves a drafted plan (radar.approvalLabel); blank is the default.
  approvalLabel: string
  // Issue Radar crew settings (radar.planLabel, radar.conflictLabel,
  // radar.reviewRules); blank is the shown default.
  planLabel: string
  conflictLabel: string
  // conflicts.onSourceConflict (fix or ask) and conflicts.maxAttempts; blank is the default.
  onSourceConflict: string
  maxAttempts: string
  // The landing block (design §4.25): landing.mode (direct, pr, train,
  // off), landing.autoMerge ('on', 'off') and landing.method (squash or
  // merge, older key merge.method). Blank reads the older key or default.
  landingMode: string
  autoMerge: string
  mergeMethod: string
  // Review drafts by label (RC20): radar.reviewLabel, radar.draftedLabel.
  reviewLabel: string
  draftedLabel: string
  // Waiting on tracker (RC23.4): radar.trackerLabel.
  trackerLabel: string
  reviewRules: string
  rules: RuleForm[]
  // The Untriaged list (design §8.5), each optional.
  untriaged: UntriagedForm
  // The private mirror (RC24.1); blank source and mirror mean none.
  mirror: MirrorForm
  // Settings this form does not show (checkout, folder),
  // written back unchanged.
  rest: Record<string, unknown>
}

export interface MirrorForm {
  source: string
  mirror: string
  forwardTo: string
  forward: string
  branchPrefix: string
  squash: boolean
  trustedPersons: string
  plansBranch: string
  forwardTarget: string
  publicBranch: string
  forwardMaxFileBytes: string
  forwardExclude: string
  forwardAllow: string
}

export const emptyMirror = (): MirrorForm => ({
  source: '',
  mirror: '',
  forwardTo: '',
  forward: '',
  branchPrefix: '',
  squash: true,
  trustedPersons: '',
  plansBranch: '',
  forwardTarget: '',
  publicBranch: '',
  forwardMaxFileBytes: '',
  forwardExclude: '',
  forwardAllow: '',
})

// What a blank mirror field means (src/app/mirror-policy.mjs MIRROR_DEFAULTS).
export const MIRROR_FORWARD_MODES = ['off', 'nudge', 'auto'] as const
export const MIRROR_FORWARD_TARGETS = ['each', 'branch', 'batch'] as const
export const MIRROR_DEFAULT_TEXT = {
  forwardMaxFileBytes: 'blank: 1000000 bytes (1 MB)',
  forwardTarget: 'blank: each, one public pull request per merged change',
  forward: 'blank: nudge, a Forward button you press',
  forwardTo: 'blank: the public repository',
  branchPrefix: 'blank: avoozl/',
  trustedPersons: 'blank: nobody, so Auto stays off',
  plansBranch: 'blank: avoozl-plans',
  forwardExclude: 'blank: only the built-in exclusions (.kiro/, AGENTS.md, steering, the specs branch)',
  forwardAllow: 'blank: nothing is allowed past the exclusions',
}

function mirrorPolicy(form: MirrorForm) {
  if (!form.source.trim() && !form.mirror.trim()) return undefined
  return compact({
    source: blank(form.source),
    mirror: blank(form.mirror),
    forwardTo: blank(form.forwardTo),
    forward: blank(form.forward),
    branchPrefix: blank(form.branchPrefix),
    squash: form.squash ? undefined : false,
    trustedPersons: splitList(form.trustedPersons),
    plansBranch: blank(form.plansBranch),
    forwardTarget: blank(form.forwardTarget),
    publicBranch: blank(form.publicBranch),
    forwardMaxFileBytes: form.forwardMaxFileBytes.trim() ? Number(form.forwardMaxFileBytes) : undefined,
    forwardExclude: splitList(form.forwardExclude),
    forwardAllow: splitList(form.forwardAllow),
  })
}

export interface UntriagedForm {
  filter: string
  triageLabels: string[]
  ignoreOlderThanDays: string
  notify: boolean
}

export const emptyUntriaged = (): UntriagedForm => ({ filter: '', triageLabels: [], ignoreOlderThanDays: '', notify: false })

// The line a blank Untriaged filter stands for (src/app/untriaged.mjs
// defaultFilter): one -label: term per triage label.
export const untriagedDefault = (labels: string[]) => labels.map((label) => `-label:${quoteTerm(label)}`).join(' ')

function untriagedPolicy(form: UntriagedForm) {
  const kept = compact({
    filter: blank(form.filter),
    triageLabels: form.triageLabels.length ? form.triageLabels : undefined,
    ignoreOlderThanDays: count(form.ignoreOlderThanDays),
    notify: form.notify || undefined,
  })
  return Object.keys(kept).length ? kept : undefined
}

export interface SettingsForm {
  mode: string
  planningRepository: string
  epicIssueType: string
  // github.cacheSeconds; blank is 60.
  cacheSeconds: string
  // github.writesPerMinute and github.writesPerHour; blank is 60 and 400.
  writesPerMinute: string
  writesPerHour: string
  repositories: RepositoryForm[]
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const str = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
const joined = (value: unknown) => (Array.isArray(value) ? value.map(str).join(', ') : '')
const strings = (value: unknown) =>
  Object.fromEntries(Object.entries(record(value)).map(([key, entry]) => [key, str(entry)]))

// "a, b\nc" -> ["a", "b", "c"]; empty -> undefined so the key is left out.
export function splitList(text: string): string[] | undefined {
  const items = text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

const blank = (text: string) => (text.trim() ? text.trim() : undefined)

// A whole number stays a number; anything else is sent as typed so the
// backend's validation names the setting.
function count(text: string): number | string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed
}

const SHOWN = new Set([
  'role',
  'baseBranch',
  'allowedActors',
  'minimumPermission',
  'requiredChecks',
  'cacheSeconds',
  'priority',
  'pullRequestReviews',
  'managedLabels',
  'crewLabels',
  'rules',
  'untriaged',
  'mirror',
  'conflicts',
  'merge',
  'landing',
])

export function emptyRule(): RuleForm {
  return {
    id: '',
    action: 'respond',
    match: '',
    author: '',
  }
}

export function emptyRepository(name = ''): RepositoryForm {
  return {
    name,
    baseBranch: 'main',
    role: '',
    allowedActors: '',
    minimumPermission: '',
    requiredChecks: '',
    cacheSeconds: '',
    releaseMode: '',
    releaseCapacity: '',
    priority: '',
    pullRequestReviews: false,
    reviewApprovals: '',
    managedLabels: {},
    crewLabels: {},
    approvalLabel: '',
    planLabel: '',
    conflictLabel: '',
    onSourceConflict: '',
    maxAttempts: '',
    landingMode: '',
    autoMerge: '',
    mergeMethod: '',
    reviewLabel: '',
    draftedLabel: '',
    trackerLabel: '',
    reviewRules: '',
    rules: [],
    untriaged: emptyUntriaged(),
    mirror: emptyMirror(),
    rest: {},
  }
}

export function toForm(github: Policy): SettingsForm {
  return {
    mode: str(github.mode),
    planningRepository: str(github.planningRepository),
    epicIssueType: str(github.epicIssueType),
    cacheSeconds: str(github.cacheSeconds),
    writesPerMinute: str(github.writesPerMinute),
    writesPerHour: str(github.writesPerHour),
    repositories: Object.entries(record(github.repositories)).map(([name, value]) => {
      const entry = record(value)
      const reviews = entry.pullRequestReviews
      return {
        name,
        baseBranch: str(entry.baseBranch),
        role: str(entry.role),
        allowedActors: joined(entry.allowedActors),
        minimumPermission: str(entry.minimumPermission),
        requiredChecks: joined(entry.requiredChecks),
        cacheSeconds: str(entry.cacheSeconds),
        releaseMode: str(record(entry.release).mode),
        releaseCapacity: str(record(entry.release).capacity),
        priority: joined(entry.priority),
        pullRequestReviews: reviews !== undefined && reviews !== null,
        reviewApprovals: str(record(reviews).approvals),
        managedLabels: strings(entry.managedLabels),
        crewLabels: strings(entry.crewLabels),
        approvalLabel: str(record(entry.radar).approvalLabel),
        planLabel: str(record(entry.radar).planLabel),
        conflictLabel: str(record(entry.radar).conflictLabel),
        onSourceConflict: str(record(entry.conflicts).onSourceConflict),
        maxAttempts: str(record(entry.conflicts).maxAttempts),
        landingMode: str(record(entry.landing).mode),
        autoMerge: (() => {
          const on = record(entry.landing).autoMerge
          return typeof on === 'boolean' ? (on ? 'on' : 'off') : on === undefined || on === null ? '' : String(on)
        })(),
        mergeMethod: str(record(entry.landing).method ?? record(entry.merge).method),
        reviewLabel: str(record(entry.radar).reviewLabel),
        draftedLabel: str(record(entry.radar).draftedLabel),
        trackerLabel: str(record(entry.radar).trackerLabel),
        reviewRules: str(record(entry.radar).reviewRules),
        rules: (Array.isArray(entry.rules) ? entry.rules : []).map((item) => {
          const rule = record(item)
          return {
            id: str(rule.id),
            action: str(rule.action),
            match: typeof rule.match === 'string' ? rule.match : legacyMatch(rule),
            author: str(rule.author),
          }
        }),
        untriaged: (() => {
          const untriaged = record(entry.untriaged)
          return {
            filter: str(untriaged.filter),
            triageLabels: Array.isArray(untriaged.triageLabels) ? untriaged.triageLabels.map(str).filter(Boolean) : [],
            ignoreOlderThanDays: str(untriaged.ignoreOlderThanDays),
            notify: untriaged.notify === true,
          }
        })(),
        mirror: (() => {
          const mirror = record(entry.mirror)
          return {
            source: str(mirror.source),
            mirror: str(mirror.mirror),
            forwardTo: str(mirror.forwardTo),
            forward: str(mirror.forward),
            branchPrefix: str(mirror.branchPrefix),
            squash: mirror.squash !== false,
            trustedPersons: joined(mirror.trustedPersons),
            plansBranch: str(mirror.plansBranch),
            forwardTarget: str(mirror.forwardTarget),
            publicBranch: str(mirror.publicBranch),
            forwardMaxFileBytes: str(mirror.forwardMaxFileBytes),
            forwardExclude: joined(mirror.forwardExclude),
            forwardAllow: joined(mirror.forwardAllow),
          }
        })(),
        // radar keeps its other keys (planLabel, conflictLabel, clearPlanLabel).
        rest: Object.fromEntries(Object.entries(entry).filter(([key]) => !SHOWN.has(key))),
      }
    }),
  }
}

// Drop keys whose value is undefined, so a cleared field leaves the file.
function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

function named(values: Record<string, string>) {
  const kept = compact(Object.fromEntries(Object.entries(values).map(([key, text]) => [key, blank(text)])))
  return Object.keys(kept).length ? kept : undefined
}

// Every top-level policy key is present; null clears it on save.
export function toPolicy(form: SettingsForm): Policy {
  return {
    mode: blank(form.mode) ?? null,
    planningRepository: blank(form.planningRepository) ?? null,
    epicIssueType: blank(form.epicIssueType) ?? null,
    cacheSeconds: count(form.cacheSeconds) ?? null,
    writesPerMinute: count(form.writesPerMinute) ?? null,
    writesPerHour: count(form.writesPerHour) ?? null,
    repositories: form.repositories.length
      ? Object.fromEntries(
          form.repositories.map((repository) => [
            repository.name.trim(),
            compact({
              ...repository.rest,
              baseBranch: blank(repository.baseBranch),
              role: blank(repository.role),
              allowedActors: splitList(repository.allowedActors),
              minimumPermission: blank(repository.minimumPermission),
              requiredChecks: splitList(repository.requiredChecks),
              cacheSeconds: count(repository.cacheSeconds),
              // The mode and capacity are shown; scopes pass through unchanged.
              release: (() => {
                const release = compact({ ...record(repository.rest.release), mode: blank(repository.releaseMode), capacity: count(repository.releaseCapacity) })
                return Object.keys(release).length ? release : undefined
              })(),
              priority: splitList(repository.priority),
              // Present means on; a blank count leaves the backend's default (1).
              pullRequestReviews: repository.pullRequestReviews
                ? compact({ approvals: count(repository.reviewApprovals) })
                : undefined,
              managedLabels: named(repository.managedLabels),
              crewLabels: named(repository.crewLabels),
              radar: (() => {
                const radar = compact({
                  ...record(repository.rest.radar),
                  approvalLabel: blank(repository.approvalLabel),
                  planLabel: blank(repository.planLabel),
                  conflictLabel: blank(repository.conflictLabel),
                  reviewLabel: blank(repository.reviewLabel),
                  draftedLabel: blank(repository.draftedLabel),
                  trackerLabel: blank(repository.trackerLabel),
                  reviewRules: blank(repository.reviewRules),
                })
                return Object.keys(radar).length ? radar : undefined
              })(),
              conflicts: (() => {
                const conflicts = compact({ ...record(repository.rest.conflicts), onSourceConflict: blank(repository.onSourceConflict), maxAttempts: count(repository.maxAttempts) })
                return Object.keys(conflicts).length ? conflicts : undefined
              })(),
              // One landing block; the older merge.method moves into it.
              landing: (() => {
                const landing = compact({
                  ...record(repository.rest.landing),
                  mode: blank(repository.landingMode),
                  // A value it does not know is sent as typed, so the backend names it.
                  autoMerge: repository.autoMerge === 'on' ? true : repository.autoMerge === 'off' ? false : blank(repository.autoMerge),
                  method: blank(repository.mergeMethod),
                })
                return Object.keys(landing).length ? landing : undefined
              })(),
              rules: repository.rules.map((rule) =>
                compact({
                  id: rule.id.trim(),
                  action: rule.action,
                  match: blank(rule.match),
                  author: blank(rule.author),
                }),
              ),
              untriaged: untriagedPolicy(repository.untriaged),
              mirror: mirrorPolicy(repository.mirror),
            }),
          ]),
        )
      : null,
  }
}

// Required or optional, and what a blank field means, as the validator
// (src/app/github-policy.mjs) treats it. `when` names the condition a "required" holds under.
export interface FieldRule {
  required: boolean
  when?: string
  blank?: string
}

export const REPOSITORY_FIELD_RULES: Record<string, FieldRule> = {
  name: { required: true },
  baseBranch: { required: true, when: 'with a GitHub mode' },
  cacheSeconds: { required: false, blank: 'blank: the workspace value' },
  releaseCapacity: { required: false, blank: 'blank: no limit' },
  allowedActors: { required: false, blank: 'blank: anyone with the minimum permission' },
  minimumPermission: { required: false, blank: 'blank: write, unless actors are named' },
  managed: { required: true, when: 'to create issues' },
  ready: { required: true, when: 'to create issues' },
  responding: { required: false, blank: 'needed only for a respond rule' },
  planning: { required: false, blank: 'blank: Avoozl adds none' },
  stale: { required: false, blank: 'blank: Avoozl adds none' },
  decision: { required: false, blank: 'blank: Avoozl adds none' },
}

// What managed label each state shows, in plain words.
export const MANAGED_LABEL_TEXT: Record<string, string> = {
  managed: 'Managed issue',
  ready: 'Ready to code',
  responding: 'Responding',
  planning: 'Planning',
  stale: 'Stale claim',
  decision: 'Needs a decision',
}

// The first required setting the form leaves blank, as a sentence, or null.
// Save is blocked while one is missing, so the message names what to fill.
export function missingRequired(form: SettingsForm): string | null {
  if (form.mode === 'plans-repo' && !form.planningRepository.trim())
    return 'A code repository needs a planning repository: give one repository the planning role in Repository setup.'
  // Local only reads no repository GitHub setting.
  if (!isGitHubMode(form.mode)) return null
  for (const [index, repository] of form.repositories.entries()) {
    const name = repository.name.trim() || `Repository ${index + 1}`
    if (!repository.name.trim()) return `${name} needs its owner/name (Repositories › Mode and branch).`
    if (isGitHubMode(form.mode) && !repository.baseBranch.trim())
      return `${name} needs its default branch (Repositories › Mode and branch).`
  }
  return null
}

// The Checks tab's rows: every check GitHub shows for the repository, plus
// saved names it no longer shows, each with whether it is required here.
export interface CheckRow {
  name: string
  // In Avoozl's own list, or required by GitHub's branch rule (shown
  // checked and read-only: GitHub already enforces it on merge).
  checked: boolean
  seen: boolean
  branchRule: boolean
  // Where GitHub showed it, for the line under the checkbox.
  where: string
}

export type CheckSources = Record<string, { source: string; at: string | null }>

// "GitHub Actions · last run 2 days ago", "Required by GitHub branch rule",
// or "Not seen on recent commits or open pull requests".
export function checkWhere(name: string, sources: CheckSources, rule: boolean, now = Date.now()): string {
  const seen = sources[name]
  const parts = []
  if (rule) parts.push('Required by GitHub branch rule')
  if (seen) parts.push(seen.at ? `${seen.source} · last run ${relativeTime(seen.at, now)}` : seen.source)
  return parts.join(' · ') || 'Not seen on recent commits or open pull requests'
}

export function checkRows(
  saved: string,
  inspect: { seen: string[]; required: string[]; sources?: CheckSources } | null,
  now = Date.now(),
): CheckRow[] {
  const chosen = splitList(saved) ?? []
  const sources = inspect?.sources ?? {}
  const seen = new Set(inspect?.seen ?? [])
  const rule = new Set(inspect?.required ?? [])
  const names = [...new Set([...(inspect?.seen ?? []), ...chosen])]
  return names
    .map((name) => ({
      name,
      checked: rule.has(name) || chosen.includes(name),
      seen: seen.has(name),
      branchRule: rule.has(name),
      where: checkWhere(name, sources, rule.has(name), now),
    }))
    .sort((a, b) => Number(b.branchRule) - Number(a.branchRule) || Number(b.seen) - Number(a.seen) || a.name.localeCompare(b.name))
}

// The saved list with one check turned on or off, order kept.
export function toggleCheck(saved: string, name: string, on: boolean): string {
  const chosen = splitList(saved) ?? []
  const next = on ? [...new Set([...chosen, name])] : chosen.filter((item) => item !== name)
  return next.join(', ')
}

// What the base branch's rules on GitHub say about reviews
// (`github.repository.inspect`).
export interface RepositoryInspect {
  repository: string
  branch: string | null
  // `hidden`: classic protection is on but GitHub shows it only to admins,
  // so `approvals` is a floor and the real count is unknown.
  reviewRule: { approvals: number; dismissStale: boolean; sources: string[]; url: string; hidden?: boolean; hiddenReason?: string | null } | null
  checks: { branch: string; seen: string[]; required: string[]; sources?: CheckSources; url?: string } | null
  error: string | null
  // Set when only that part could not be read; the other part still shows.
  reviewError?: string | null
  checksError?: string | null
}

export const inspectClient = (api: AppApi) => (workspaceId: string, repository: string, baseBranch: string) =>
  api
    .post<{ result: RepositoryInspect }>(COMMAND_PATH, {
      operation: 'github.repository.inspect',
      input: { repository, ...(baseBranch.trim() ? { baseBranch: baseBranch.trim() } : {}) },
      workspaceId,
    })
    .then((reply) => reply.result)

// One line for the Reviews tab.
export function reviewRuleText(inspect: RepositoryInspect | null): string {
  if (!inspect) return 'Reading the branch rules…'
  if (inspect.error || !inspect.reviewRule) return inspect.reviewError ?? inspect.error ?? 'The branch rules could not be read.'
  const rule = inspect.reviewRule
  if (rule.hidden)
    return `${rule.hiddenReason ?? 'GitHub hides the classic protection rule from this account.'} The approval count is unknown${
      rule.approvals ? `, at least ${rule.approvals} from a ruleset` : ''
    }. GitHub still enforces it on merge. ${
      rule.approvals
        ? `Avoozl waits for ${rule.approvals} approval${rule.approvals === 1 ? '' : 's'} meanwhile.`
        : "Avoozl's reviewer chats stay the review gate."
    }`
  if (!rule.approvals) return "No branch rule asks for approvals; Avoozl's reviewer chats are the review gate."
  return `${inspect.branch} needs ${rule.approvals} approving review${rule.approvals === 1 ? '' : 's'} (${rule.sources.join(' and ')})${
    rule.dismissStale ? ', and a new push dismisses old approvals' : ''
  }. Avoozl waits for that many from allowed people on the pull request's head commit.`
}

// The three modes, as the mode panes explain them, in the order they show.
// Each claim matches the code and design: github-policy.mjs (`local` is no
// GitHub mode and keeps the stored GitHub settings unused; planning
// repository required),
// github-linked-branches.mjs (the linked branch closes the planning issue),
// delivery.mjs (local delivery merges verified work into the landing
// branch; no closing keyword in plans-repo pull requests), and design §6.6.
export const MODE_CARDS = [
  {
    mode: 'local',
    title: 'Local only',
    line: "Tasks stay in this workspace's database on this Mac. Nothing goes to GitHub.",
    useWhen: ['You work alone or offline', 'No GitHub issues or board wanted', 'Trying Avoozl out'],
    facts: [
      ['Who closes tasks', 'Avoozl, once checks and reviewer chats pass and the work merges into the landing branch'],
      ['Pull request text', 'None: work lands on the branch in your checkout'],
      ['Limit', 'No issues, labels, Project board or GitHub checks'],
    ],
  },
  {
    mode: 'plans-repo',
    title: 'Plans repository',
    line: 'Specs and their related issues live in a private planning repository; code and pull requests live in the code repositories.',
    useWhen: ['Planning stays private', 'Code repositories are public or shared', 'One plan spans several code repositories'],
    facts: [
      ['Who closes issues', 'GitHub, when the pull request from the linked branch Avoozl made merges'],
      ['Pull request text', 'The task only; never the planning repository'],
      ['Limit', 'Issues and sub-issues live only in the planning repository'],
    ],
  },
  {
    mode: 'single-repo',
    title: 'Single repository',
    line: 'Specs, issues and pull requests all live in the code repository.',
    useWhen: ['One repository', 'Open planning is fine', 'The simplest setup'],
    facts: [
      ['Who closes issues', 'GitHub, from "Closes #N" when the pull request merges'],
      ['Pull request text', 'Names its issue with Closes #N'],
      ['Limit', 'Issues and plans are visible to everyone who can see the repository'],
    ],
  },
] as const

// The saved mode as a pane key: no mode is Local only.
export const modeKey = (mode: string) => (mode === 'plans-repo' || mode === 'single-repo' ? mode : 'local')
export const isGitHubMode = (mode: string) => modeKey(mode) !== 'local'

// Repository roles (design §4.34, R105). The backend decides the mode from
// them (repository-roles.mjs); this file only draws them and builds the edit.
export const ROLE_OPTIONS = [
  { value: 'local', label: 'Local only', line: "Tasks stay in this workspace's database. Nothing goes to GitHub." },
  { value: 'code', label: 'Code repository', line: 'Pull requests land here. Its issues live in the planning repository.' },
  { value: 'planning', label: 'Planning repository', line: 'Holds the issues, sub-issues and specs. No code pull requests land here.' },
  { value: 'both', label: 'Code and planning', line: 'Pull requests land here, and its own issues and specs live here too.' },
] as const

export const roleLabel = (role: string) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? 'Local only'

const sameRepository = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()

// The role a stored mode gives a repository that has none (R105.7).
export function roleFromMode(mode: string, github: string | null, planningRepository: string): string {
  if (!github) return 'local'
  if (mode === 'plans-repo') return sameRepository(github, planningRepository) ? 'planning' : 'code'
  return mode === 'single-repo' ? 'both' : 'local'
}

export interface RoleRow {
  policy: number
  github: string | null
}

// A row's role: the one saved on its entry, else the one the mode gives.
export function roleOfRow(form: Pick<SettingsForm, 'mode' | 'planningRepository' | 'repositories'>, row: RoleRow): string {
  if (!row.github) return 'local'
  const saved = row.policy >= 0 ? form.repositories[row.policy]?.role : ''
  return saved || roleFromMode(modeKey(form.mode), row.github, form.planningRepository)
}

// The mode the roles make, for the form's own checks until the save derives it.
export function modeFromRoles(roles: string[]): string {
  if (roles.includes('both')) return 'single-repo'
  return roles.includes('planning') || roles.includes('code') ? 'plans-repo' : ''
}

// The form after one repository gets a role. A repository with no entry gets
// one. Choosing planning turns the old planning repository into code, the one
// consequence nobody wants to click twice. A mix the roles cannot make is the
// backend's to refuse, with its one line.
export function withRole(form: SettingsForm, row: RoleRow & { branch: string }, role: string): SettingsForm {
  if (!row.github) return form
  const repositories = form.repositories.map((entry, index) => ({ ...entry, role: roleOfRow(form, { policy: index, github: entry.name.trim() }) }))
  let at = row.policy
  if (at < 0) {
    repositories.push({ ...emptyRepository(row.github), baseBranch: row.branch, role })
    at = repositories.length - 1
  }
  repositories[at].role = role
  if (role === 'planning') for (const [index, entry] of repositories.entries()) if (index !== at && entry.role === 'planning') entry.role = 'code'
  const planning = repositories.find((entry) => entry.role === 'planning')?.name.trim() || form.planningRepository
  return { ...form, repositories, mode: modeFromRoles(repositories.map((entry) => entry.role)), planningRepository: planning }
}

// A private mirror is a role a repository can have besides the four above: it
// is the private copy crews work in, of a public repository. It is stored as
// the public repository's `mirror` setting (source = the public one, mirror =
// this one), the same config the old Mirror box wrote.
export const MIRROR_ROLE = 'mirror'
export const MIRROR_ROLE_LABEL = 'Private mirror of a public repository'
export const MIRROR_ROLE_LINE = 'Crews work in this private copy of a public repository. It must be private.'
const REPOSITORY_NAME = /^[\w.-]+\/[\w.-]+$/

// The public repository this one mirrors, or '' when it mirrors none.
export function mirrorSourceOf(form: Pick<SettingsForm, 'repositories'>, github: string | null): string {
  if (!github) return ''
  return form.repositories.find((entry) => entry.mirror.source && entry.mirror.mirror && sameRepository(entry.mirror.mirror, github))?.mirror.source ?? ''
}

// What is wrong with the public repository's name, or null.
export function mirrorSourceProblem(source: string, github: string | null): string | null {
  if (!REPOSITORY_NAME.test(source.trim())) return 'Name the public repository as owner/name.'
  if (github && sameRepository(source, github)) return 'The public repository must be a different repository.'
  return null
}

function withoutMirror(form: SettingsForm, github: string): SettingsForm {
  return {
    ...form,
    repositories: form.repositories.map((entry) => (entry.mirror.mirror && sameRepository(entry.mirror.mirror, github) ? { ...entry, mirror: emptyMirror() } : entry)),
  }
}

// Make `github` the private mirror of `source`: the public repository's entry
// (added when it has none) names both.
function withMirror(form: SettingsForm, github: string, source: string): SettingsForm {
  const cleared = withoutMirror(form, github)
  const name = source.trim()
  const at = cleared.repositories.findIndex((entry) => sameRepository(entry.name, name))
  const repositories = cleared.repositories.slice()
  if (at < 0) repositories.push({ ...emptyRepository(name), mirror: { ...emptyMirror(), source: name, mirror: github } })
  else repositories[at] = { ...repositories[at], mirror: { ...repositories[at].mirror, source: name, mirror: github } }
  return { ...cleared, repositories }
}

export interface RepositoryEdit {
  // New settings for the repository's own entry, if the person changed any.
  entry: RepositoryForm | null
  // A role value, or MIRROR_ROLE with its public repository in `source`.
  role: string
  source: string
}

// The form after one repository's Edit is saved. The row is found by its name,
// so the edit applies to a form read after the dialog opened.
export function withRepositoryEdit(form: SettingsForm, row: { github: string | null; branch: string; policy: number }, edit: RepositoryEdit): SettingsForm {
  const find = (next: SettingsForm) => (row.github ? next.repositories.findIndex((entry) => sameRepository(entry.name, row.github!)) : row.policy)
  let next = form
  if (edit.entry) {
    const at = find(next)
    next = { ...next, repositories: at >= 0 ? next.repositories.map((entry, index) => (index === at ? edit.entry! : entry)) : [...next.repositories, edit.entry] }
  }
  if (!row.github) return next
  const target = { github: row.github, branch: row.branch, policy: find(next) }
  if (edit.role === MIRROR_ROLE) return sameRepository(mirrorSourceOf(next, row.github), edit.source) ? next : withMirror(next, row.github, edit.source)
  if (mirrorSourceOf(next, row.github)) next = withoutMirror(next, row.github)
  return edit.role === roleOfRow(next, target) ? next : withRole(next, target, edit.role)
}

// The one line above the repository list: where tasks live as a result.
export function tasksLiveLine(mode: string, planningRepository: string): string {
  if (mode === 'plans-repo') return `Tasks live in ${planningRepository || 'the planning repository'}, a planning repository for the code repositories.`
  if (mode === 'single-repo') return "Tasks live in each repository's own issues."
  return "Tasks live in this workspace's database on this Mac."
}

// Which settings each mode reads, so Settings shows only those. Checked in
// code: local delivery reads the checkout folder, landing branch, worker
// chats (delivery), reviewer roles and each repository's checks
// (delivery.mjs declaredChecks); every github.* setting is read only with a
// GitHub mode (github-policy.mjs, github-sync.mjs). Content rules, plugins
// and workspaces apply in every mode.
export type SettingKey =
  | 'planningRepository'
  | 'epicIssueType'
  | 'setupGitHub'
  | 'triggers'
  | 'requiredChecks'
  | 'pullRequestReviews'
  | 'reviewerChats'
  | 'localChecks'
  | 'landingBranch'
  | 'workerChats'

export function visibleSettings(mode: string): Set<SettingKey> {
  const key = modeKey(mode)
  const always: SettingKey[] = ['reviewerChats', 'landingBranch', 'workerChats']
  if (key === 'local') return new Set([...always, 'localChecks'])
  const github: SettingKey[] = ['epicIssueType', 'setupGitHub', 'triggers', 'requiredChecks', 'pullRequestReviews']
  if (key === 'plans-repo') return new Set([...always, ...github, 'planningRepository'])
  return new Set([...always, ...github])
}

export const LOCAL_HIDDEN_LINE = 'Labels, checks and reviews only apply to GitHub modes.'

// Saved GitHub settings that Local only keeps but does not use.
export function unusedInLocal(form: SettingsForm): string[] {
  const kept: string[] = []
  if (form.planningRepository.trim()) kept.push('planning repository')
  if (form.repositories.length) kept.push(`${form.repositories.length} repository GitHub setting${form.repositories.length === 1 ? '' : 's'}`)
  if (form.epicIssueType.trim()) kept.push('epic issue type')
  return kept
}

// Set up GitHub (SetupWizard.tsx): pure helpers.
// Each write's group in the review step, by the wizard's step id.
export const SETUP_GROUPS: { key: string; title: string; steps: string[] }[] = [
  { key: 'repository', title: 'Repository', steps: ['token', 'repository', 'issues'] },
  { key: 'epic', title: 'Epic issue type', steps: ['epic'] },
  { key: 'labels', title: 'Labels', steps: ['labels'] },
  { key: 'settings', title: 'Settings file', steps: ['settings'] },
]

// create, change or keep, from the write's action.
export const writeBadge = (write: Pick<SetupWrite, 'action'>) =>
  /^create|^enable/.test(write.action) ? 'create' : /^keep/.test(write.action) ? 'keep' : 'change'

export function groupWrites(writes: SetupWrite[]) {
  return SETUP_GROUPS.map((group) => ({ ...group, writes: writes.filter((w) => group.steps.includes(w.step)) })).filter((g) => g.writes.length)
}

// Whether the button shows: only when the read-only preview finds a change.
export type SetupState =
  | { kind: 'checking' }
  | { kind: 'error'; reason: string; fix: string | null }
  | { kind: 'set-up'; at: string }
  | { kind: 'changes'; count: number; at: string }

export function setupState(result: SetupResult | null, error: string | null, at: string): SetupState {
  if (error) return { kind: 'error', reason: error, fix: null }
  if (!result) return { kind: 'checking' }
  // A failed step (no gh, a missing scope) means the preview could not read
  // what it needs: say why and how to fix it.
  const blocked = result.steps.find((s) => s.status === 'failed')
  if (blocked && !result.writes.length) return { kind: 'error', reason: `${blocked.title}: ${blocked.reason}`, fix: blocked.fix }
  if (result.writes.length || result.settings.changed) return { kind: 'changes', count: result.writes.length + (result.settings.changed ? 1 : 0), at }
  return { kind: 'set-up', at }
}


// Settings opens on Workspaces. The inner tab is kept only while the person
// stays in Settings: each new visit, and any tab that no longer exists,
// starts over on Workspaces.
export const SETTINGS_HOME = 'workspaces'
export function settingsTabOnEnter<T extends string>(from: string, to: string, current: string, valid: readonly T[]): T {
  const home = SETTINGS_HOME as T
  if (to === 'settings' && from !== 'settings') return home
  return valid.includes(current as T) ? (current as T) : home
}


// Issue Radar crew settings (radar-coder RC7.6). A blank field is the default,
// and each line says where the shown value comes from and what it is.
// Avoozl's own labels (RC21), as src/app/github-policy.mjs RADAR_DEFAULTS and
// READY_LABEL_DEFAULT name them.
export const RADAR_DEFAULTS_SHOWN = {
  planLabel: 'avoozl:plan',
  ready: 'avoozl:ready',
  approvalLabel: 'avoozl:plan-approved',
  conflictLabel: 'avoozl:merge-conflict',
  reviewLabel: 'avoozl:review',
  draftedLabel: 'avoozl:drafted',
  trackerLabel: 'avoozl:waiting-on-tracker',
} as const

// The seven Avoozl labels in Settings: what each does and who writes it (RC21.4).
export const AVOOZL_LABELS = [
  { key: 'planLabel', label: 'Planning', raw: 'radar.planLabel', job: 'Asks Avoozl to plan an issue.', writer: 'A person you trust adds it.' },
  { key: 'ready', label: 'Ready', raw: 'managedLabels.ready', job: "Marks an issue a crew may take. Set the crew's label scope to it.", writer: 'Avoozl adds and removes it.' },
  { key: 'approvalLabel', label: 'Plan approved', raw: 'radar.approvalLabel', job: 'Approves the drafted plan of the issue it is on.', writer: 'A person you trust, or Avoozl after an approval.' },
  { key: 'conflictLabel', label: 'Merge conflict', raw: 'radar.conflictLabel', job: 'Shows a pull request has a merge conflict.', writer: 'Avoozl adds and removes it.' },
  { key: 'reviewLabel', label: 'Review', raw: 'radar.reviewLabel', job: 'Asks Avoozl to draft a review of a pull request for you.', writer: 'A person you trust adds it.' },
  { key: 'draftedLabel', label: 'Drafted', raw: 'radar.draftedLabel', job: 'Shows a draft review waits for you to submit.', writer: 'Avoozl adds and removes it.' },
  { key: 'trackerLabel', label: 'Waiting on tracker', raw: 'radar.trackerLabel', job: 'Shows a task waits on an item in another tracker.', writer: 'Avoozl adds and removes it.' },
] as const

// What Avoozl does with a crew's pull request that conflicts in source code (RC28.5).
export const CONFLICT_ACTIONS = ['fix', 'ask'] as const
export const CONFLICT_DEFAULTS = { onSourceConflict: 'fix', maxAttempts: '2' } as const
export const CONFLICT_ACTION_TEXT: Record<(typeof CONFLICT_ACTIONS)[number], string> = {
  fix: 'A resolver chat merges the base into the branch and keeps both sides',
  ask: 'Only ask me; write nothing',
}

// How a crew pull request lands when Avoozl arms auto-merge (RC28.7).
export const MERGE_METHODS = ['squash', 'merge'] as const
export const MERGE_METHOD_TEXT: Record<(typeof MERGE_METHODS)[number], { title: string; line: string }> = {
  squash: { title: 'Squash', line: 'One commit per pull request on the base, with its title and body. The repository must allow squash merging.' },
  merge: { title: 'Merge commit', line: 'The branch lands with a merge commit. The repository must allow merge commits.' },
}

export const OLD_LABEL_NOTE =
  'The defaults now start with avoozl:. A repository that used the old names (to plan, ready, plan approved, merge conflict) without setting them reads the new names now; type the old name here to keep it.'

export const valueSource = (value: string, fallback: string, unit = '') =>
  value.trim() ? `Set on this repository: ${value.trim()}${unit}.` : `Not set on this repository. Using the default (${fallback}${unit}).`

export const rulesMode = (form: Pick<RepositoryForm, 'reviewRules'>): 'default' | 'custom' => (form.reviewRules.trim() ? 'custom' : 'default')

// Every page but Workspaces reads and writes the selected workspace's own
// settings, so its title names that workspace. Workspaces lists the machine's.
export function settingsTitle(tab: string, label: string, workspaceName?: string | null): string {
  return tab === 'workspaces' || !workspaceName ? label : `${workspaceName}: ${label}`
}
