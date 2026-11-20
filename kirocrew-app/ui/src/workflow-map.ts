// The Workflow map: how work flows through one repository, as lanes of step
// cards built from its settings. Pure: the page draws what this returns, and
// no card holds text the settings do not give. No label is an order.
import { isGitHubMode, type RepositoryForm } from './settings-api.ts'
import { TONE } from './ui/tones.ts'

export type Who = 'you' | 'avoozl' | 'github'
export const WHO_TEXT: Record<Who, string> = { you: 'You', avoozl: 'Avoozl', github: 'GitHub' }
// Theme variables only, each with another existing variable as fallback.
export const WHO_COLOR: Record<Who, string> = {
  you: TONE.infoOrAccent,
  avoozl: TONE.ok,
  github: TONE.orangeOrWarning,
}

// The one place a step's build state is written. A step missing here has no
// tag. Update a step when its proof passes or when it is built.
export type StepTag = 'fake-tested' | 'not proven live' | 'not built'
export const WORKFLOW_STATUS: Record<string, StepTag> = {}

// Where a value is set. `tab` is a repository dialog sub-tab
// (repo-edit-tabs.ts); `field` names the input the page focuses.
export type JumpField = 'mergeMethod' | 'prMode' | 'actors' | 'permission'
export interface Jump {
  tab: 'general' | 'landing' | 'github'
  field: JumpField
}
const TAB: Record<JumpField, Jump['tab']> = {
  mergeMethod: 'landing',
  prMode: 'landing',
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
  key: 'spec' | 'local'
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
  // Who merges: the landing block's landing.pr, else the workspace's.
  const pr = repository.prMode.trim()
  const ship: Value = {
    label: 'Pull requests',
    text: pr || "the workspace's",
    source: pr ? 'set' : 'default',
    jump: jump('prMode'),
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

  const mergeCard: Card = {
    key: 'spec-merge',
    who: pr === 'auto' ? 'avoozl' : 'you',
    title: pr === 'auto' ? 'Avoozl merges' : 'You merge',
    text: pr === 'auto' ? 'Avoozl merges once the checks pass on the exact head.' : 'Needs you shows a row with Merge once the checks pass.',
    values: [ship, mergeMethod],
    ...tag('spec-merge'),
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

  return { lanes: [spec], labels: [] }
}

// The CSS selector of the input a jump lands on, inside the dialog whose ids
// start with `id`. Selectors list the input first and its container second.
export const fieldSelector = (id: string, field: JumpField): string =>
  ({
    mergeMethod: `#${id}-merge-method input:checked, #${id}-merge-method`,
    prMode: `#${id}-pr-mode input:checked, #${id}-pr-mode`,
    actors: `#${id}-actors`,
    permission: `#${id}-permission`,
  })[field]
