// The Workflow map (radar-coder RC22, design D27): how work flows through one
// repository, as lanes of step cards built from its settings. Pure: the page
// draws what this returns, and no card holds text the settings do not give.
import { isGitHubMode, modeKey, type RepositoryForm } from './settings-api.ts'
import { TONE } from './ui/tones.ts'

export type Who = 'you' | 'radar' | 'avoozl' | 'github'
export const WHO_TEXT: Record<Who, string> = { you: 'You', radar: 'Radar crew', avoozl: 'Avoozl', github: 'GitHub' }
// Theme variables only, each with another existing variable as fallback.
export const WHO_COLOR: Record<Who, string> = {
  you: TONE.accent,
  radar: TONE.purpleOrAim,
  avoozl: TONE.ok,
  github: TONE.orangeOrWarning,
}

// The one place a step's build state is written. A step missing here has no
// tag. Update a step when its proof passes (tasks.md rc-p*) or when it is built.
export type StepTag = 'fake-tested' | 'not proven live' | 'not built'
export const WORKFLOW_STATUS: Record<string, StepTag> = {
  'maint-crew': 'not proven live',
  'epic-punt': 'not proven live',
  'epic-plan-label': 'fake-tested',
  'epic-draft': 'fake-tested',
  'epic-approve': 'fake-tested',
  'epic-claim': 'fake-tested',
  'epic-start': 'fake-tested',
  'epic-merge': 'fake-tested',
  'review-chat': 'not built',
  'review-find': 'not built',
  'review-answer': 'not proven live',
}

// Where a value is set. `tab` is a repository dialog sub-tab; `field` names the
// input the page focuses.
export type JumpField = 'plan' | 'conflict' | 'onSourceConflict' | 'mergeMethod' | 'autoMerge' | 'approval' | 'ready' | 'claim' | 'needsHuman' | 'actors' | 'permission'
// `radar` is Settings › Issue Radar, a page of its own; the others are
// tabs of the repository's Edit dialog (repo-edit-tabs.ts).
export interface Jump {
  tab: 'general' | 'landing' | 'github' | 'radar'
  field: JumpField
}
const TAB: Record<JumpField, Jump['tab']> = {
  plan: 'radar',
  conflict: 'radar',
  onSourceConflict: 'landing',
  mergeMethod: 'landing',
  autoMerge: 'landing',
  approval: 'radar',
  ready: 'radar',
  claim: 'radar',
  needsHuman: 'radar',
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
  key: 'maintenance' | 'epic' | 'review' | 'local'
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
  ship: 'auto-merge' | 'manual' | null
  planningRepository?: string
}

// Default label names. Radar's two are Kiro Crew's own defaults; Avoozl's are
// the `avoozl:` names of RC21 (owner decision), each configurable. Until
// rc-20.1 moves the backend defaults, an unset repository still gets the old
// names from the backend; the map shows the decided ones.
const DEFAULTS = {
  claim: 'crew: in progress',
  needsHuman: 'crew: needs human',
  plan: 'avoozl:plan',
  ready: 'avoozl:ready',
  approval: 'avoozl:plan-approved',
  conflict: 'avoozl:merge-conflict',
  review: 'avoozl:review',
  drafted: 'avoozl:drafted',
} as const

const named = (set: string, fallback: string, label: string, field?: JumpField): Value => {
  const text = set.trim()
  return { label, text: text || fallback, source: text ? 'set' : 'default', ...(field ? { jump: jump(field) } : {}) }
}

const radarRest = (repository: RepositoryForm) => {
  const radar = repository.rest.radar
  return radar && typeof radar === 'object' && !Array.isArray(radar) ? (radar as Record<string, unknown>) : {}
}
// The review and drafted labels (RC20, RC21). Until their settings exist, a
// value an older file holds under `radar` is read as is; otherwise a placeholder.
const placeholderLabel = (repository: RepositoryForm, key: 'reviewLabel' | 'draftedLabel', fallback: string, label: string): Value => {
  const held = radarRest(repository)[key]
  return typeof held === 'string' && held.trim() ? { label, text: held.trim(), source: 'set' } : { label, text: fallback, source: 'placeholder' }
}

const tag = (key: string): { tag?: StepTag } => (WORKFLOW_STATUS[key] ? { tag: WORKFLOW_STATUS[key] } : {})

export function buildWorkflowMap(input: WorkflowInput): WorkflowMap {
  const { repository, mode } = input
  const github = isGitHubMode(mode)

  const ready = named(repository.managedLabels.ready ?? '', DEFAULTS.ready, 'Ready label', 'ready')
  const plan = named(repository.planLabel, DEFAULTS.plan, 'Planning label', 'plan')
  const approval = named(repository.approvalLabel, DEFAULTS.approval, 'Approval label', 'approval')
  const conflict = named(repository.conflictLabel, DEFAULTS.conflict, 'Conflict label', 'conflict')
  const mergeMethod: Value = {
    label: 'Merge method',
    text: repository.mergeMethod.trim() || 'squash',
    source: repository.mergeMethod.trim() ? 'set' : 'default',
    jump: jump('mergeMethod'),
  }
  const claim = named(repository.crewLabels.claim ?? '', DEFAULTS.claim, 'Claim label', 'claim')
  const needsHuman = named(repository.crewLabels.needsHuman ?? '', DEFAULTS.needsHuman, 'Escalation label', 'needsHuman')
  const review = placeholderLabel(repository, 'reviewLabel', DEFAULTS.review, 'Review label')
  const drafted = placeholderLabel(repository, 'draftedLabel', DEFAULTS.drafted, 'Drafted label')

  const actors: Value = repository.allowedActors.trim()
    ? { label: 'Allowed people', text: repository.allowedActors.trim(), source: 'set', jump: jump('actors') }
    : {
        label: 'Allowed people',
        text: `anyone with ${repository.minimumPermission.trim() || 'write'} access`,
        source: repository.minimumPermission.trim() ? 'set' : 'default',
        jump: jump('permission'),
      }
  // Who merges: the landing block's autoMerge, then the older delivery.ship.
  const shipMode = repository.autoMerge === 'off' ? 'manual' : repository.autoMerge === 'on' ? 'auto-merge' : input.ship
  const ship: Value = {
    label: 'Merge',
    text: shipMode === 'manual' ? 'you merge' : 'auto-merge',
    source: repository.autoMerge || input.ship ? 'set' : 'default',
    jump: jump('autoMerge'),
  }
  const landing: Value = { label: 'Landing branch', text: repository.baseBranch.trim() || 'main', source: repository.baseBranch.trim() ? 'set' : 'default' }

  const labels: LabelRow[] = [
    { key: 'plan', label: 'Planning', name: plan.text, source: plan.source, writer: 'you', jump: plan.jump },
    { key: 'needsHuman', label: 'Escalation', name: needsHuman.text, source: needsHuman.source, writer: 'radar', jump: needsHuman.jump },
    { key: 'claim', label: 'Claim', name: claim.text, source: claim.source, writer: 'radar', jump: claim.jump },
    { key: 'ready', label: 'Ready', name: ready.text, source: ready.source, writer: 'avoozl', jump: ready.jump },
    { key: 'approval', label: 'Approval', name: approval.text, source: approval.source, writer: 'you', jump: approval.jump },
    { key: 'conflict', label: 'Conflict (on pull requests)', name: conflict.text, source: conflict.source, writer: 'avoozl', jump: conflict.jump },
    { key: 'review', label: 'Review', name: review.text, source: review.source, writer: 'you' },
    { key: 'drafted', label: 'Drafted', name: drafted.text, source: drafted.source, writer: 'avoozl' },
  ]

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
      note: 'The GitHub lanes and labels are hidden in Local only mode. Give a repository a GitHub role in Repository setup to see them.',
    }
  }

  const planningRepo = input.planningRepository?.trim()
  const plansRepo = modeKey(mode) === 'plans-repo'
  const closer: Card = plansRepo
    ? { key: 'maint-close', who: 'avoozl', title: 'Merge closes the issue', text: `Avoozl closes the issue in ${planningRepo || 'the plans repository'}.`, values: [] }
    : { key: 'maint-close', who: 'github', title: 'Merge closes the issue', text: 'The pull request says Closes #N, so GitHub closes it.', values: [] }

  const maintenance: Lane = {
    key: 'maintenance',
    title: 'Maintenance',
    muted: 'Issue Radar crews keep maintenance of issues Avoozl did not create. Avoozl hands them no work.',
    cards: [
      { key: 'maint-issue', who: 'github', title: 'An issue comes in', text: 'Someone opens an issue. Avoozl is not involved.', values: [] },
      {
        key: 'maint-label',
        who: 'you',
        title: 'You add the crew label',
        text: "The label in the crew's scope (set in Issue Radar). Avoozl's ready label is the same name.",
        values: [ready],
      },
      { key: 'maint-crew', who: 'radar', title: 'The crew claims, fixes, opens a PR', text: 'It runs CI on the pull request.', values: [], ...tag('maint-crew') },
      { ...closer, key: 'maint-close' },
    ],
  }

  const buildCard: Card = {
    key: 'epic-build-worker',
    who: 'avoozl',
    title: 'Worker chats build',
    text: 'Each worker chat codes one task on its own branch and opens a pull request.',
    values: [],
  }
  const releaseCard: Card = {
    key: 'epic-start',
    who: 'avoozl',
    title: 'The tick starts ready tasks in graph order',
    text: 'A task starts when its blockers are done.',
    values: [],
    ...tag('epic-start'),
  }
  const mergeCard: Card = {
    key: 'epic-merge',
    who: shipMode === 'manual' ? 'you' : 'avoozl',
    title: shipMode === 'manual' ? 'You merge' : 'Auto-merge',
    text: shipMode === 'manual' ? 'Avoozl shows a Ready to merge row once the checks pass.' : 'Avoozl arms auto-merge; GitHub merges when its rules pass.',
    values: shipMode === 'manual' ? [ship] : [ship, mergeMethod],
    ...tag('epic-merge'),
  }
  const epic: Lane = {
    key: 'epic',
    title: 'Epic',
    cards: [
      { key: 'epic-request', who: 'you', title: 'A feature request comes in', text: 'An issue that is too big for one crew.', values: [] },
      { key: 'epic-punt', who: 'radar', title: 'The crew punts', text: 'It adds its escalation label and stops.', values: [needsHuman], ...tag('epic-punt') },
      {
        key: 'epic-plan-label',
        who: 'you',
        title: 'You add the planning label',
        text: 'Only people the repository allows count.',
        values: [plan, actors],
        ...tag('epic-plan-label'),
      },
      { key: 'epic-draft', who: 'avoozl', title: 'Avoozl drafts the spec', text: 'A spec with tasks and their order.', values: [], ...tag('epic-draft') },
      { key: 'epic-approve', who: 'you', title: 'You approve', text: 'Add the approval label, or approve in Avoozl or a chat.', values: [approval], ...tag('epic-approve') },
      {
        key: 'epic-claim',
        who: 'avoozl',
        title: 'Avoozl claims the parent and writes the sub-issues',
        text: 'It adds blocked-by links, so the order lives on GitHub.',
        values: [claim],
        ...tag('epic-claim'),
      },
      releaseCard,
      buildCard,
      mergeCard,
    ],
  }

  const reviewLane: Lane = {
    key: 'review',
    title: 'Review draft',
    muted: review.source === 'placeholder' ? 'The review label has no setting yet, so this lane shows the planned names. A later change reads the real setting.' : undefined,
    cards: [
      { key: 'review-pr', who: 'github', title: 'A pull request comes in', text: 'Yours to review.', values: [] },
      { key: 'review-label', who: 'you', title: 'You add the review label', text: 'Only people the repository allows count, and it must be your login.', values: [review, actors] },
      {
        key: 'review-chat',
        who: 'avoozl',
        title: 'A review chat reads the pull request',
        text: 'Read only. It posts one pending review under your login and swaps the label.',
        values: [drafted],
        ...tag('review-chat'),
      },
      {
        key: 'review-find',
        who: 'you',
        title: 'You find the draft',
        text: 'In Needs you here, or on GitHub with a search for the drafted label.',
        values: [drafted],
        ...tag('review-find'),
      },
      { key: 'review-submit', who: 'you', title: 'You edit and submit it', text: 'Avoozl never submits a review.', values: [] },
      { key: 'review-answer', who: 'radar', title: 'The crew answers on its pull request', text: 'Only when a crew opened it.', values: [], ...tag('review-answer') },
    ],
  }

  return { lanes: [maintenance, epic, reviewLane], labels }
}

// The CSS selector of the input a jump lands on, inside the dialog whose ids
// start with `id`. Selectors list the input first and its container second.
export const fieldSelector = (id: string, field: JumpField): string =>
  ({
    plan: '#' + id + '-label-planLabel',
    conflict: `#${id}-label-conflictLabel`,
    onSourceConflict: `#${id}-on-source-conflict input:checked, #${id}-on-source-conflict`,
    mergeMethod: `#${id}-merge-method input:checked, #${id}-merge-method`,
    autoMerge: `#${id}-auto-merge input:checked, #${id}-auto-merge`,
    approval: `#${id}-label-approvalLabel`,
    ready: `#${id}-label-ready`,
    claim: `#${id}-crew-claim`,
    needsHuman: `#${id}-crew-needsHuman`,
    actors: `#${id}-actors`,
    permission: `#${id}-permission`,
  })[field]
