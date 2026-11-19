// The Workflow map: how work flows through one repository, as lanes of step
// cards built from its settings. Pure: the page draws what this returns, and
// no card holds text the settings do not give. GitHub issues and pull
// requests come in through the triage agent (triage-agent TA1 to TA9); no
// label is an order (TA11.1).
import { isGitHubMode, modeKey, type RepositoryForm } from './settings-api.ts'
import { TONE } from './ui/tones.ts'

export type Who = 'you' | 'agent' | 'avoozl' | 'github'
export const WHO_TEXT: Record<Who, string> = { you: 'You', agent: 'Triage agent', avoozl: 'Avoozl', github: 'GitHub' }
// Theme variables only, each with another existing variable as fallback.
export const WHO_COLOR: Record<Who, string> = {
  you: TONE.infoOrAccent,
  agent: TONE.purpleOrAim,
  avoozl: TONE.ok,
  github: TONE.orangeOrWarning,
}

// The one place a step's build state is written. A step missing here has no
// tag. Update a step when its proof passes or when it is built.
export type StepTag = 'fake-tested' | 'not proven live' | 'not built'
export const WORKFLOW_STATUS: Record<string, StepTag> = {}

// Where a value is set. `tab` is a repository dialog sub-tab
// (repo-edit-tabs.ts); `field` names the input the page focuses.
export type JumpField = 'mergeMethod' | 'autoMerge' | 'actors' | 'permission'
export interface Jump {
  tab: 'general' | 'landing' | 'github'
  field: JumpField
}
const TAB: Record<JumpField, Jump['tab']> = {
  mergeMethod: 'landing',
  autoMerge: 'landing',
  actors: 'github',
  permission: 'github',
}
const jump = (field: JumpField): Jump => ({ tab: TAB[field], field })

export interface Value {
  label: string
  text: string
  // set: written in .avoozl.json. default: not set, the shown default applies.
  // placeholder: the setting does not exist yet, so the name is a stand-in.
  source: 'set' | 'default' | 'placeholder'
  jump?: Jump
  // Set outside the repository dialog: where.
  elsewhere?: string
}
export interface Card {
  key: string
  who: Who
  title: string
  text: string
  values: Value[]
  tag?: StepTag
  // Why the step is off, in words. A muted card is still drawn.
  muted?: string
}
export interface Lane {
  key: 'triage' | 'spec' | 'local'
  title: string
  cards: Card[]
  // The whole lane is off: why. Its cards are still drawn, muted.
  muted?: string
}
export interface LabelRow {
  key: string
  label: string
  name: string
  source: Value['source']
  writer: Who
  jump?: Jump
}
export interface WorkflowMap {
  lanes: Lane[]
  labels: LabelRow[]
  // A line under the lanes, for example why the GitHub lanes are hidden.
  note?: string
}

export interface WorkflowInput {
  mode: string
  repository: RepositoryForm
  planningRepository?: string
}

const tag = (key: string): { tag?: StepTag } => (WORKFLOW_STATUS[key] ? { tag: WORKFLOW_STATUS[key] } : {})

export function buildWorkflowMap(input: WorkflowInput): WorkflowMap {
  const { repository, mode } = input
  const github = isGitHubMode(mode)

  const mergeMethod: Value = {
    label: 'Merge method',
    text: repository.mergeMethod.trim() || 'squash',
    source: repository.mergeMethod.trim() ? 'set' : 'default',
    jump: jump('mergeMethod'),
  }
  const actors: Value = repository.allowedActors.trim()
    ? { label: 'Allowed people', text: repository.allowedActors.trim(), source: 'set', jump: jump('actors') }
    : {
        label: 'Allowed people',
        text: `anyone with ${repository.minimumPermission.trim() || 'write'} access`,
        source: repository.minimumPermission.trim() ? 'set' : 'default',
        jump: jump('permission'),
      }
  // Who merges: the landing block's autoMerge, else auto-merge.
  const shipMode = repository.autoMerge === 'off' ? 'manual' : 'auto-merge'
  const ship: Value = {
    label: 'Merge',
    text: shipMode === 'manual' ? 'you merge' : 'auto-merge',
    source: repository.autoMerge ? 'set' : 'default',
    jump: jump('autoMerge'),
  }
  const landing: Value = { label: 'Landing branch', text: repository.baseBranch.trim() || 'main', source: repository.baseBranch.trim() ? 'set' : 'default' }

  // Local only: the one local-worker lane, and nothing for GitHub.
  if (!github) {
    return {
      lanes: [
        {
          key: 'local',
          title: 'Local tasks',
          cards: [
            { key: 'local-ready', who: 'avoozl', title: 'A task becomes ready', text: 'Everything it waits on is done. The tick starts it.', values: [] },
            { key: 'local-code', who: 'avoozl', title: 'A worker chat codes it', text: 'On its own branch, in your checkout.', values: [] },
            { key: 'local-check', who: 'avoozl', title: 'Checks and reviewer chats', text: 'A fresh chat runs the checks on that commit; reviewer chats review it.', values: [] },
            { key: 'local-merge', who: 'avoozl', title: 'It merges', text: 'The branch merges into the landing branch.', values: [landing] },
          ],
        },
      ],
      labels: [],
      note: 'The GitHub lanes are hidden in Local only mode. Give a repository a GitHub role in Repository setup to see them.',
    }
  }

  const planningRepo = input.planningRepository?.trim()
  const plansRepo = modeKey(mode) === 'plans-repo'
  const closer: Card = plansRepo
    ? { key: 'triage-close', who: 'avoozl', title: 'Merge closes the issue', text: `Avoozl closes the issue in ${planningRepo || 'the plans repository'}.`, values: [] }
    : { key: 'triage-close', who: 'github', title: 'Merge closes the issue', text: 'The pull request says Fixes #N, so GitHub closes it.', values: [] }
  const mergeCard: Card = {
    key: 'spec-merge',
    who: shipMode === 'manual' ? 'you' : 'avoozl',
    title: shipMode === 'manual' ? 'You merge' : 'Auto-merge',
    text: shipMode === 'manual' ? 'Avoozl shows a Ready to merge row once the checks pass.' : 'Avoozl arms auto-merge; GitHub merges when its rules pass.',
    values: shipMode === 'manual' ? [ship] : [ship, mergeMethod],
    ...tag('spec-merge'),
  }

  const triage: Lane = {
    key: 'triage',
    title: 'Issues and pull requests',
    cards: [
      { key: 'triage-item', who: 'github', title: 'An issue or pull request comes in', text: 'The triage agent reads it once, when it is on for this repository.', values: [] },
      {
        key: 'triage-run',
        who: 'agent',
        title: 'The triage agent sorts it',
        text: 'It answers a question, reproduces a bug, reviews a pull request, or hands it to you.',
        values: [],
      },
      {
        key: 'triage-fix',
        who: 'avoozl',
        title: 'A bounded bug becomes a fix',
        text: "Only a collaborator's issue lands without you; anyone else's waits as Fix ready.",
        values: [actors],
      },
      { ...closer, key: 'triage-close' },
    ],
  }
  const spec: Lane = {
    key: 'spec',
    title: 'Spec',
    cards: [
      { key: 'spec-approve', who: 'you', title: 'You approve a spec', text: 'In Avoozl or a chat.', values: [] },
      { key: 'spec-start', who: 'avoozl', title: 'The tick starts ready tasks in graph order', text: 'A task starts when its blockers are done.', values: [] },
      { key: 'spec-build', who: 'avoozl', title: 'Worker chats build', text: 'Each worker chat codes one task on its own branch and opens a pull request.', values: [] },
      mergeCard,
    ],
  }

  return { lanes: [triage, spec], labels: [] }
}

// The CSS selector of the input a jump lands on, inside the dialog whose ids
// start with `id`. Selectors list the input first and its container second.
export const fieldSelector = (id: string, field: JumpField): string =>
  ({
    mergeMethod: `#${id}-merge-method input:checked, #${id}-merge-method`,
    autoMerge: `#${id}-auto-merge input:checked, #${id}-auto-merge`,
    actors: `#${id}-actors`,
    permission: `#${id}-permission`,
  })[field]
