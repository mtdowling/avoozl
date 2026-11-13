// The Onboard flow (Settings > Repositories > Onboard): calls and pure
// helpers. Adding a repository goes from a folder to plans ready to approve
// in Plans. Every step reuses an existing operation; the flow's own reads
// are onboarding.inspect, onboarding.scan and plan.issues.preview. Nothing
// is written before Set up, each GitHub write there asks first, and the
// flow never approves a plan, starts an agent or pushes. Keep this module
// free of JSX and runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { ConfirmCopy } from './controls.tsx'
import type { GitHubSettings, Policy, SetupInput, SetupResult } from './settings-api.ts'
import type { PlannedWrite, SpecList, SpecSummary } from './plans-api.ts'

export type OnboardMode = 'local' | 'plans-repo' | 'single-repo'

export interface FolderFacts {
  root: string
  baseBranch: string
  currentBranch: string | null
  remote: string | null
  github: string | null
  id: string | null
  settingsFile: boolean
  specs: string[]
  registered: { id: string; localCheckout: string | null; github: string | null; baseBranch: string; planning: boolean } | null
  visibility: 'public' | 'private' | null
  githubError: string | null
}

export interface ScanFinding {
  file: string
  line: number
  set: string
  rule: string | null
  message: string
}
export interface ScanResult {
  items: { name: string; findings: ScanFinding[]; missing: boolean }[]
}

export interface IssuePreview {
  planId: string
  writes: PlannedWrite[]
  blocked?: { code: string; message: string }[]
  notes?: string[]
  previewOnly?: string[]
  simulated: boolean
}

export type StepKey = 'folder' | 'mode' | 'check' | 'setup' | 'import' | 'scan' | 'issues' | 'finish'

export const ONBOARD_STEPS: { key: StepKey; title: string; line: string }[] = [
  { key: 'folder', title: 'Pick folder', line: 'Point at a Git checkout. Avoozl reads its remote, branch, settings file and specs. Nothing is changed.' },
  { key: 'mode', title: 'Pick mode', line: 'Where tasks live. Nothing is saved until Set up.' },
  { key: 'check', title: 'Check GitHub', line: 'Avoozl reads GitHub and lists what Set up would create, change or keep. It writes nothing.' },
  { key: 'setup', title: 'Set up', line: 'The writes, in order. Each GitHub write asks first.' },
  { key: 'import', title: 'Import specs', line: 'Spec folders and their lint results. Import makes drafts; nothing is approved.' },
  { key: 'scan', title: 'Leak scan', line: 'This repository is public, so its issues are too. Avoozl checks the specs for secrets, paths on this computer and your content rules.' },
  { key: 'issues', title: 'Preview issues', line: 'The issues approving each draft would make. Nothing is made now.' },
  { key: 'finish', title: 'Finish', line: 'What was done. Approve plans in Plans when you are ready.' },
]

export interface OnboardForm {
  mode: OnboardMode
  // Plans repository mode: whether this folder is the planning repository.
  isPlanning: boolean
  planningRepository: string
  id: string
  baseBranch: string
}

export function onboardForm(found: FolderFacts, settings: GitHubSettings | null): OnboardForm {
  const github = (settings?.github ?? {}) as Policy
  const saved = typeof github.mode === 'string' ? github.mode : ''
  const planning = typeof github.planningRepository === 'string' ? github.planningRepository : ''
  const mode: OnboardMode = saved === 'plans-repo' || saved === 'single-repo' ? saved : found.github ? 'single-repo' : 'local'
  return {
    mode: saved === 'local' ? 'local' : mode,
    isPlanning: Boolean(found.github && planning && planning.toLowerCase() === found.github.toLowerCase()) || (!planning && found.specs.length > 0),
    planningRepository: planning || (found.specs.length > 0 && found.github ? found.github : ''),
    id: found.registered?.id ?? found.id ?? '',
    baseBranch: found.registered?.baseBranch ?? found.baseBranch,
  }
}

const githubMode = (mode: OnboardMode) => mode !== 'local'

// Whether issues land in this folder's repository.
export function issuesHere(form: OnboardForm): boolean {
  return form.mode === 'single-repo' || (form.mode === 'plans-repo' && form.isPlanning)
}

// The steps this flow walks, by mode and what GitHub said.
export function onboardSteps(form: OnboardForm, found: FolderFacts | null): StepKey[] {
  const keys: StepKey[] = ['folder', 'mode']
  if (githubMode(form.mode)) keys.push('check')
  keys.push('setup', 'import')
  if (githubMode(form.mode) && issuesHere(form) && found?.visibility === 'public') keys.push('scan')
  if (githubMode(form.mode)) keys.push('issues')
  keys.push('finish')
  return keys
}

// What a mode needs before the flow can go on, or null.
export function modeProblem(form: OnboardForm, found: FolderFacts): string | null {
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(form.id.trim())) return 'Give a short ID: lower-case letters, digits and dashes, starting with a letter.'
  if (!form.baseBranch.trim()) return 'Name the branch tasks land on.'
  if (form.mode === 'local') return null
  if (!found.github)
    return found.remote
      ? `${found.remote} is not a GitHub remote, so GitHub modes can't use this folder. Pick Local only.`
      : 'This folder has no GitHub remote. Pick Local only, or add a GitHub remote first.'
  if (form.mode === 'plans-repo' && !form.isPlanning && !/^[\w.-]+\/[\w.-]+$/.test(form.planningRepository.trim()))
    return 'Name the planning repository as owner/name.'
  if (form.mode === 'plans-repo' && form.isPlanning && found.visibility === 'public')
    return 'A planning repository must be private: its issues name plans and code repositories.'
  return null
}

// The Set up GitHub preview request for this folder and mode.
export function setupRequest(form: OnboardForm, found: FolderFacts, settings: GitHubSettings | null): SetupInput {
  const github = (settings?.github ?? {}) as Policy
  const known = Object.keys((github.repositories as Record<string, unknown>) ?? {})
  const planning = form.isPlanning ? found.github! : form.planningRepository.trim()
  const code = form.mode === 'plans-repo' && form.isPlanning ? known : [...known, found.github!]
  return {
    mode: form.mode,
    ...(form.mode === 'plans-repo' ? { planningRepository: planning } : {}),
    repositories: [...new Set(code.filter((id) => id && id.toLowerCase() !== (form.mode === 'plans-repo' ? planning.toLowerCase() : '')))],
  }
}

// One write of the Set up step. `confirm` is set for each GitHub write.
export interface PlannedStep {
  key: 'github' | 'settings' | 'register'
  title: string
  detail: string
  done: boolean
  confirm: ConfirmCopy | null
}

// The writes Set up makes, in order. A write already in place shows done
// and is skipped.
export function setupWrites(form: OnboardForm, found: FolderFacts, settings: GitHubSettings | null, preview: SetupResult | null): PlannedStep[] {
  const steps: PlannedStep[] = []
  const github = (settings?.github ?? {}) as Policy
  if (githubMode(form.mode)) {
    const count = preview?.writes.length ?? 0
    steps.push({
      key: 'github',
      title: count ? `Make ${count} change${count === 1 ? '' : 's'} on GitHub` : 'GitHub already has what Avoozl needs',
      detail: count ? 'The create and change items from Check GitHub. Nothing is deleted or renamed.' : 'Check GitHub found nothing to create or change.',
      done: count === 0,
      confirm: count
        ? {
            title: `Make ${count} change${count === 1 ? '' : 's'} on GitHub?`,
            body: `Avoozl creates or changes ${(preview?.writes ?? [])
              .slice(0, 4)
              .map((w) => `${w.object} ${w.name}`)
              .join(', ')}${count > 4 ? `, and ${count - 4} more` : ''}. GitHub keeps them if you stop later; remove them on GitHub to undo.`,
            action: `Make ${count} change${count === 1 ? '' : 's'}`,
          }
        : null,
    })
  }
  const settingsChange = githubMode(form.mode) ? Boolean(preview?.settings.changed) : github.mode !== 'local' && github.mode !== undefined
  steps.push({
    key: 'settings',
    title: settingsChange ? `Save the mode${githubMode(form.mode) ? ' and GitHub names' : ''} to .avoozl.json` : '.avoozl.json already matches',
    detail: githubMode(form.mode) ? 'The settings Set up GitHub proposed, shown in Check GitHub.' : 'Local only. Kept GitHub settings stay in the file, unused.',
    done: !settingsChange,
    confirm: null,
  })
  const repo = issuesHere(form) && githubMode(form.mode) ? found.github : null
  steps.push({
    key: 'register',
    title: found.registered ? `${found.registered.id} is already added` : `Add ${form.id.trim()} to this workspace`,
    detail: found.registered
      ? `Its folder is ${found.registered.localCheckout ?? 'not on this computer'}.`
      : `Tasks land on ${form.baseBranch.trim()} in ${found.root}.${repo ? ` Issues for ${repo} are read from GitHub.` : ''}`,
    done: Boolean(found.registered),
    confirm:
      repo && !found.registered
        ? {
            title: `Link ${repo} to this workspace?`,
            body: `Avoozl makes sure the labels avoozl:ready and avoozl:managed exist on ${repo}, then reads its issues. Nothing else changes on GitHub.`,
            action: 'Link it',
          }
        : null,
  })
  return steps
}

// The repositories.configure input for this folder.
export function registerInput(form: OnboardForm, found: FolderFacts, planningRegistered: boolean) {
  const repo = githubMode(form.mode) ? found.github : null
  return {
    id: form.id.trim(),
    localCheckout: found.root,
    baseBranch: form.baseBranch.trim(),
    ...(repo ? { github: repo } : {}),
    ...(repo && issuesHere(form) ? { issueAuthorization: true } : {}),
    // Local only and plans-repo mode read specs from the planning checkout.
    planning: form.mode === 'plans-repo' ? form.isPlanning : form.mode === 'local' && found.specs.length > 0 && !planningRegistered,
  }
}

// The specs this folder holds, as Avoozl reads them for the mode.
export function folderSpecs(list: SpecList | null, found: FolderFacts): (SpecSummary & { root?: string })[] {
  const items = (list?.items ?? []) as (SpecSummary & { root?: string })[]
  return items.filter((item) => !item.root || item.root === found.root || found.specs.includes(item.name))
}

export const imported = (spec: SpecSummary) => Boolean(spec.plan)

// Findings across every scanned spec.
export const scanFindings = (scan: ScanResult | null) => (scan?.items ?? []).flatMap((item) => item.findings.map((f) => ({ spec: item.name, ...f })))

// The issue titles a preview would create, per repository.
export function issueSummary(preview: IssuePreview | null) {
  const writes = preview?.writes ?? []
  return {
    create: writes.filter((w) => w.kind === 'issue.create'),
    update: writes.filter((w) => w.kind === 'issue.update'),
    other: writes.filter((w) => w.kind !== 'issue.create' && w.kind !== 'issue.update').length,
  }
}

// Every operation the flow may call. Reads come first; the writes are the
// ones Set up and Import make. Nothing here approves, starts or pushes.
export const ONBOARD_READS = ['onboarding.inspect', 'github.settings.get', 'repositories.list', 'github.setup', 'plan.specs', 'onboarding.scan', 'plan.issues.preview'] as const
export const ONBOARD_WRITES = ['github.setup', 'github.settings.update', 'repositories.configure', 'plan.create'] as const

export function onboardClient(api: AppApi) {
  const run = async <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    inspect: (w: string, folder: string) => run<FolderFacts>(w, 'onboarding.inspect', { folder }),
    settings: (w: string) => run<GitHubSettings>(w, 'github.settings.get'),
    repositories: (w: string) => run<{ items: { id: string; planning: boolean }[] }>(w, 'repositories.list'),
    // Without confirm, github.setup only reads GitHub and previews.
    checkGitHub: (w: string, input: SetupInput) => run<SetupResult>(w, 'github.setup', { ...input }),
    specs: (w: string) => run<SpecList>(w, 'plan.specs'),
    scan: (w: string, specs: string[]) => run<ScanResult>(w, 'onboarding.scan', { specs }),
    previewIssues: (w: string, planId: string) => run<IssuePreview>(w, 'plan.issues.preview', { planId }),
    // Writes: only from Set up and Import, after the person asks.
    applyGitHub: (w: string, input: SetupInput, previewHash: string) => run<SetupResult>(w, 'github.setup', { ...input, confirm: true, previewHash }),
    saveSettings: (w: string, github: Policy, expectedHash: string | null) => run<GitHubSettings>(w, 'github.settings.update', { github, expectedHash }),
    register: (w: string, input: Record<string, unknown>) => run<{ id: string }>(w, 'repositories.configure', input),
    importSpec: (w: string, spec: string) => run<{ id: string; state: string }>(w, 'plan.create', { spec }),
  }
}
export type OnboardClient = ReturnType<typeof onboardClient>
