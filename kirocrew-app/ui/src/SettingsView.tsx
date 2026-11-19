import { Component, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckRow, Field, Marker, RawKey, fieldDescribedBy, type FieldWidth } from './ui/Field.tsx'
import { Tabs, TabPanel, useTabParam } from './ui/Tabs.tsx'
import { dirtyTabs } from './tabs.ts'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import {
  REPOSITORY_FIELD_RULES,
  checkRows,
  emptyRepository,
  inspectClient,
  missingRequired,
  reviewRuleText,
  settingsClient,
  toggleCheck,
  MIRROR_DEFAULT_TEXT,
  MIRROR_FORWARD_MODES,
  MIRROR_FORWARD_TARGETS,
  type MirrorForm,
  type FieldRule,
  type RepositoryInspect,
  toForm,
  toPolicy,
  type GitHubSettings,
  type RepositoryForm,
  type ReviewRole,
  type ReviewSettings,
  type SettingsChoices,
  type SettingsForm,
  LOCAL_HIDDEN_LINE,
  isGitHubMode,
  rateLines,
  usageRows,
  sortUsage,
  nextUsageSort,
  USAGE_SORT,
  type UsageKey,
  type UsageSort,
  type RateView,
  modeKey,
  MIRROR_ROLE,
  mirrorSourceOf,
  roleLabel,
  roleOfRow,
  tasksLiveLine,
  withRepositoryEdit,
  unusedInLocal,
  SETTINGS_HOME,
  settingsTitle,
} from './settings-api.ts'
import SetupWizard from './SetupWizard.tsx'
import { AutoMergeFields, LANDING_PART_TEXT, ConflictFields, LANDING_MODES, MergeMethodFields } from './LandingFields.tsx'
import WorkflowMap, { focusField } from './WorkflowMap.tsx'
import { type Jump, type JumpField } from './workflow-map.ts'
import WorkspaceView from './WorkspaceView.tsx'
import SetupRepository from './Onboard.tsx'
import { AddRepositoryModal, REPOSITORIES_LINE, RepositoryList, repositoryRows, useReveal, type AddedRole } from './RepositoriesSettings.tsx'
import { EditRepository, ViewRepository, type EditSettings } from './RepositoryModals.tsx'
import type { EditTab } from './repo-edit-tabs.ts'
import { FieldGroup } from './ui/FieldGroup.tsx'
import IsolationPanel from './IsolationPanel.tsx'
import { githubHref, type RepositoryRow } from './repository-rows.ts'
import PluginsSettings from './PluginsSettings.tsx'
import ContentRulesSettings from './ContentRulesSettings.tsx'
import FlowSettings from './FlowSettings.tsx'
import ModelsSettings from './ModelsSettings.tsx'
import DeliverySettings from './DeliverySettings.tsx'
import { SaveFooter } from './SaveFooter.tsx'
import { useRead } from './useRead.ts'
import { errorMessage, workspaceClient, type Repository, type WorkspaceList } from './workspace-api.ts'
import { Fold } from './ui/controls.tsx'
import { AskForHelp, DangerBtn, IconLabel, SectionHeading, TipBtn, ViewHeading } from './ui/controls.tsx'
import { Plus, Trash2, Workflow, type LucideIcon } from './icons.ts'
import { linkHref } from './views-api.ts'
import { ThisComputer } from './Driver.tsx'
import { NoticesSettings } from './NoticesSettings.tsx'
import { ErrorText } from './ui/ErrorText'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { SelectField } from './ui/SelectField'
import { Switch } from './ui/Switch'
import { Box, type LookProps } from './ui/Box'
import { Hint } from './ui/Hint'
import { PlainButton, PlainLink } from './ui/Plain'

// Fields share a row and wrap; each keeps a readable width.
const grid = (min = 220) =>
  ({
    'css-display': 'grid',
    'css-gap': 12,
    'css-grid-template-columns': `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
    'css-align-items': 'start',
  }) as const satisfies LookProps

export const SETTINGS_TABS = [
  { key: 'workspaces', label: 'Workspaces' },
  // Landing, GitHub and the Workflow map are tabs of each repository's editor.
  { key: 'repositories', label: 'Repository setup' },
  { key: 'github', label: 'GitHub' },
  { key: 'plugins', label: 'Plugins' },
  { key: 'content', label: 'Content rules' },
  { key: 'flow', label: 'Flow' },
  // Avoozl's own chats only.
  { key: 'models', label: 'Models' },
  { key: 'delivery', label: 'Delivery' },
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]['key']

// One short line under each Settings heading: what it controls and when
// you would change it. Each is checked against what the code does.
export const SETTINGS_BLURBS: Record<SettingsTab, string> = {
  workspaces: 'The Avoozl workspaces on this machine, each a folder with its own task database, and the settings that stay on this computer.',
  github: 'The GitHub settings of the selected workspace, for every repository in it. Each tab is one group; one Save writes them all to .avoozl.json.',
  repositories: "Each repository's role says where its tasks live. Its Workflow map, checks and code review rule are tabs under its name. Save only writes .avoozl.json.",
  plugins: 'A plugin can bring a team’s settings pack, content rules, an intake source or workflow templates. Each one runs or imports only after you approve it on this machine.',
  content: 'Terms Avoozl must never write: in spec files, issues, comments, briefs and diffs. A match stops the write and asks you.',
  flow: 'How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode.',
  models: "Each role's harness, agent and model, in one place.",
  delivery: 'Investigate-first and pull request feedback for Avoozl worker chats. Agents and models are in Models.',
}

// Section blurbs of a repository's Edit dialog (repo-edit-tabs.ts has its tabs).
export const REPOSITORY_BLURBS = {
  map: 'The path work takes in this repository, drawn from its settings. Nothing here is edited; a value opens its field.',
  general: 'Which GitHub repository this is, and who writes the code.',
  landing: 'The branch pull requests merge into, and how verified work lands.',
  github: 'GitHub still decides who has access. This sets how much GitHub permission a person needs for an approval, a board drag or a close to count.',
  checks: "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
  reviews: "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub.",
} as const

// Every field here is the shared Field (ui/Field.tsx).
export { Marker }

function SettingField(props: { id: string; label: string; raw?: string; rule?: FieldRule; width?: FieldWidth; help?: string; children: ReactNode }) {
  return (
    <Field id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width} help={props.help}>
      {props.children}
    </Field>
  )
}

function Text(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  raw?: string
  rule?: FieldRule
  width?: FieldWidth
  type?: string
  help?: string
}) {
  return (
    <SettingField id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width} help={props.help}>
      <Input
        id={props.id}
        type={props.type}
        aria-describedby={fieldDescribedBy(props.id, props)}
        value={props.value}
        placeholder={props.placeholder}
        aria-required={props.rule?.required || undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </SettingField>
  )
}

function Choice(props: {
  id: string
  label: string
  value: string
  options: string[]
  none: string
  onChange: (value: string) => void
  raw?: string
  rule?: FieldRule
  width?: FieldWidth
}) {
  return (
    <SettingField id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width}>
      <SelectField id={props.id} value={props.value} aria-describedby={fieldDescribedBy(props.id, props)} onChange={(event) => props.onChange(event.target.value)} look="field">
        <option value="">{props.none}</option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
    </SettingField>
  )
}

function SettingHint({ children }: { children: ReactNode }) {
  return (
    <Hint as="p" mt="1" size="xs">
      {children}
    </Hint>
  )
}

// A heading with its one-line blurb, then the fields. A `sub` section is a
// group inside a card: it starts with a top border and padding, so the
// groups of one card read apart.
export function Section(props: { title: string; blurb?: string; actions?: ReactNode; children?: ReactNode; level?: 'card' | 'sub'; icon?: LucideIcon }) {
  const sub = props.level === 'sub'
  return (
    <Box
      css-border-top={sub ? '1px-solid-border' : undefined}
      css-padding-top={sub ? '12' : undefined}
      css-margin-top={sub ? '4' : undefined}
      flex
      flexCol
      gap="2.5"
      data-section={props.title}
      data-sub-section={sub ? '' : undefined}
    >
      <SectionHeading level={props.level === 'sub' ? 4 : 3} title={props.title} blurb={props.blurb} actions={props.actions} icon={props.icon} />
      {props.children}
    </Box>
  )
}

function Roles({ roles }: { roles: ReviewRole[] }) {
  return (
    <Box as="ul" mt="1" flex flexCol gap="1" size="sm">
      {roles.map((role) => (
        <li key={role.id}>
          <Box as="span" weight="medium">
            {role.id}
          </Box>{' '}
          <Hint as="span">
            {role.agent} · {role.model ?? 'agent default'} · distinct by {role.distinctFrom}
          </Hint>
          <Hint as="span" block size="xs">
            {role.focus}
          </Hint>
        </li>
      ))}
    </Box>
  )
}

// Reviewer roles come from `delivery.reviewers` in `.avoozl.json`; this page
// shows them and does not write them.
function ReviewRoles({ review, repository }: { review: ReviewSettings | undefined; repository: string }) {
  if (!review) return null
  const own = review.repositories[repository]
  const roles = own ?? review.reviewers
  return (
    <FieldGroup
      level={4}
      title="Code review chats"
      blurb="Fresh chats that review each local delivery's exact commit before it merges. Edit them under delivery.reviewers in .avoozl.json."
    >
      {review.error ? (
        <ErrorText size="sm">The delivery block is invalid: {review.error}</ErrorText>
      ) : roles.length === 0 ? (
        <Hint as="p" size="sm">
          No reviewer roles. Checks alone verify a delivery.
        </Hint>
      ) : (
        <>
          <SettingHint>
            {own ? 'Set for this repository.' : 'The workspace roles.'} Writer model {review.writerModel ?? 'not named'}.
          </SettingHint>
          <Roles roles={roles} />
        </>
      )}
    </FieldGroup>
  )
}

// The check names GitHub shows for this repository, one checkbox each;
// saved names it no longer shows are kept and marked. Without GitHub, a
// text box.
function ChecksEditor(props: { id: string; value: string; inspect: RepositoryInspect | null; repository: string; onChange: (value: string) => void }) {
  const [extra, setExtra] = useState('')
  const checks = props.inspect?.checks ?? null
  const rows = checkRows(props.value, checks)
  const named = /^[\w.-]+\/[\w.-]+$/.test(props.repository)
  const add = () => {
    const name = extra.trim()
    if (!name) return
    props.onChange(toggleCheck(props.value, name, true))
    setExtra('')
  }
  // GitHub can't be read: the names go in by hand, and the line says why.
  if (!named || (props.inspect && !checks))
    return (
      <Stack gap={2} data-checks="typed">
        <Hint as="p" size="xs" data-checks-why>
          {!named
            ? 'Name the repository as owner/name under Mode, and Avoozl lists the checks GitHub runs there.'
            : `${props.inspect?.checksError ?? props.inspect?.error ?? 'GitHub could not be read.'} Type the names instead.`}{' '}
          Names are exact and case-sensitive, separated by commas.
        </Hint>
        <Text
          id={`${props.id}-checks`}
          label="Required checks"
          raw="requiredChecks"
          rule={{ required: false, blank: 'blank: no check is required' }}
          placeholder="build, lint"
          width="lg"
          value={props.value}
          onChange={props.onChange}
        />
      </Stack>
    )
  if (!props.inspect)
    return (
      <Stack gap={2} data-checks="reading">
        <Hint as="p" size="xs">
          Reading the checks GitHub runs on {props.repository}…
        </Hint>
      </Stack>
    )
  const url = checks?.url ?? `https://github.com/${props.repository}/settings/rules`
  return (
    <Stack gap={3} data-checks="listed">
      <Hint as="p" size="xs">
        Seen on {checks!.branch}&apos;s recent commits and open pull requests. Checks the branch rule requires stay on; Avoozl&apos;s list adds to them.{' '}
        <TextLink href={linkHref(url)} target="_blank" rel="noopener noreferrer">
          Change the branch rule on GitHub
        </TextLink>
      </Hint>
      {rows.length === 0 ? (
        <Hint as="p" size="sm">
          GitHub shows no checks on {checks!.branch} or its open pull requests yet. Add a name below.
        </Hint>
      ) : (
        <Stack as="ul" gap={2} aria-label="Checks">
          {rows.map((row) => (
            <Box key={row.name} as="li" flex flexCol size="sm" data-check-row={row.name}>
              <Switch
                label={row.name}
                gap={1.5}
                checked={row.checked}
                disabled={row.branchRule}
                describedBy={`${props.id}-check-${row.name}`}
                onChange={(on) => props.onChange(toggleCheck(props.value, row.name, on))}
              >
                <code>{row.name}</code>
              </Switch>
              <Hint id={`${props.id}-check-${row.name}`} as="span" pl="5" size="xs">
                {row.where}
              </Hint>
            </Box>
          ))}
        </Stack>
      )}
      <Row gap={2} align="end">
        <Text id={`${props.id}-check-extra`} label="Add another name" placeholder="a check not run yet" width="md" value={extra} onChange={setExtra} />
        <TipBtn tooltip="Add this exact, case-sensitive check name to the list" onClick={add} disabled={!extra.trim()}>
          Add
        </TipBtn>
      </Row>
    </Stack>
  )
}

function ReviewRule(props: { inspect: RepositoryInspect | null; repository: string }) {
  const rule = props.inspect?.reviewRule
  const link = rule?.url ?? (props.repository ? `https://github.com/${props.repository}/settings/rules` : null)
  return (
    <Box flex flexCol gap="2" size="sm">
      <p>{reviewRuleText(props.inspect)}</p>
      {link && (
        <PlainLink href={linkHref(link)} target="_blank" rel="noreferrer" self="start" size="xs" underline>
          Change it on GitHub
        </PlainLink>
      )}
    </Box>
  )
}

// Private mirror (RC24.1): crews work a private copy of a public repository.
function MirrorBox(props: { id: string; mirror: MirrorForm; onChange: (mirror: MirrorForm) => void }) {
  const { mirror, id } = props
  const set = (change: Partial<MirrorForm>) => props.onChange({ ...mirror, ...change })
  return (
    <FieldGroup title="Private mirror" blurb="Crews work in a private copy. The mirror must be private. Leave both names blank for none.">
      <Box {...grid()}>
        <Text id={`${id}-source`} label="Public repository" raw="mirror.source" placeholder="owner/name" value={mirror.source} onChange={(value) => set({ source: value })} />
        <Text id={`${id}-mirror`} label="Private mirror" raw="mirror.mirror" placeholder="owner/name-private" value={mirror.mirror} onChange={(value) => set({ mirror: value })} />
        <Choice
          id={`${id}-forward`}
          label="Forward mode"
          raw="mirror.forward"
          rule={{ required: false, blank: MIRROR_DEFAULT_TEXT.forward }}
          value={mirror.forward}
          options={[...MIRROR_FORWARD_MODES]}
          none="Default (nudge)"
          onChange={(value) => set({ forward: value })}
        />
        <Choice
          id={`${id}-target`}
          label="Forward target"
          raw="mirror.forwardTarget"
          rule={{ required: false, blank: MIRROR_DEFAULT_TEXT.forwardTarget }}
          value={mirror.forwardTarget}
          options={[...MIRROR_FORWARD_TARGETS]}
          none="Default (each)"
          onChange={(value) => set({ forwardTarget: value })}
        />
        <Text
          id={`${id}-public-branch`}
          label="Public branch"
          raw="mirror.publicBranch"
          placeholder="needed for the branch target"
          value={mirror.publicBranch}
          onChange={(value) => set({ publicBranch: value })}
        />
      </Box>
      <Hint as="p" size="xs">
        each: one public pull request per merged change. branch: the same, into the public branch. batch: one public pull request when the epic is done. An epic's tasks.md
        front-matter can set its own forwardTarget and publicBranch.
      </Hint>
      <Fold id={`${id}-more`} title="Advanced: mirror">
        <Box {...grid()}>
          <Text
            id={`${id}-forward-to`}
            label="Forward to"
            raw="mirror.forwardTo"
            placeholder="source or fork:owner/name"
            value={mirror.forwardTo}
            onChange={(value) => set({ forwardTo: value })}
          />
          <Text
            id={`${id}-prefix`}
            label="Branch prefix"
            raw="mirror.branchPrefix"
            placeholder="avoozl/"
            value={mirror.branchPrefix}
            onChange={(value) => set({ branchPrefix: value })}
          />
          <Text
            id={`${id}-plans-branch`}
            label="Private specs branch"
            raw="mirror.plansBranch"
            placeholder="avoozl-plans"
            value={mirror.plansBranch}
            onChange={(value) => set({ plansBranch: value })}
          />
          <Text
            id={`${id}-max-bytes`}
            label="Largest forwarded file (bytes)"
            raw="mirror.forwardMaxFileBytes"
            placeholder={MIRROR_DEFAULT_TEXT.forwardMaxFileBytes}
            value={mirror.forwardMaxFileBytes}
            onChange={(value) => set({ forwardMaxFileBytes: value })}
          />
          <Text
            id={`${id}-exclude`}
            label="Never forward these paths"
            raw="mirror.forwardExclude"
            placeholder={MIRROR_DEFAULT_TEXT.forwardExclude}
            value={mirror.forwardExclude}
            onChange={(value) => set({ forwardExclude: value })}
          />
          <Text
            id={`${id}-allow`}
            label="Forward these paths anyway"
            raw="mirror.forwardAllow"
            placeholder={MIRROR_DEFAULT_TEXT.forwardAllow}
            value={mirror.forwardAllow}
            onChange={(value) => set({ forwardAllow: value })}
          />
          <Text
            id={`${id}-trusted`}
            label="Trusted persons"
            raw="mirror.trustedPersons"
            placeholder="login, login"
            value={mirror.trustedPersons}
            onChange={(value) => set({ trustedPersons: value })}
          />
        </Box>
        <CheckRow label="Squash into one commit" help="On by default." raw="mirror.squash" checked={mirror.squash} onChange={(squash) => set({ squash })} />
      </Fold>
    </FieldGroup>
  )
}

export function RepositoryEditor(props: {
  index: number
  repository: RepositoryForm
  choices: SettingsChoices
  review: ReviewSettings | undefined
  mode: string
  workspaceId: string
  planningRepository: string
  // The Edit dialog's open tab, and how a Workflow map value opens another.
  tab: EditTab
  onTab: (tab: EditTab) => void
  onChange: (repository: RepositoryForm) => void
}) {
  const { repository, choices, tab } = props
  const api = useAppApi()
  const inspectRepository = useMemo(() => inspectClient(api), [api])
  const [inspect, setInspect] = useState<RepositoryInspect | null>(null)
  const id = `avoozl-settings-repo-${props.index}`
  // A jump from the Workflow map: open the tab, then any closed fold
  // around the field, then focus it.
  const [pending, setPending] = useState<Jump | null>(null)
  useEffect(() => {
    if (!pending || tab !== pending.tab) return
    setPending(null)
    focusField(id, pending)
  }, [pending, tab, id])
  const set = (change: Partial<RepositoryForm>) => props.onChange({ ...repository, ...change })
  const name = repository.name.trim()
  // GitHub's rules and checks, read only when the Landing tab needs them.
  useEffect(() => {
    setInspect(null)
    if (tab !== 'landing' || !/^[\w.-]+\/[\w.-]+$/.test(name)) return
    let live = true
    inspectRepository(props.workspaceId, name, repository.baseBranch).then(
      (value) => live && setInspect(value),
      (caught: unknown) => live && setInspect({ repository: name, branch: null, reviewRule: null, checks: null, error: errorMessage(caught) }),
    )
    return () => {
      live = false
    }
  }, [tab, name, repository.baseBranch, props.workspaceId, inspectRepository])
  // Fragments: its sections are siblings of the dialog's own, so the shared
  // FieldGroup rule draws the line between them.
  return (
    <>
      {tab === 'general' && (
        <FieldGroup title="GitHub repository" blurb={REPOSITORY_BLURBS.general}>
          <Hint as="p" size="xs">
            Workspace mode:{' '}
            <Box as="span" css-color="text" weight="medium">
              {MODE_TITLES[modeKey(props.mode)]}
            </Box>
            . It follows from each repository&apos;s role in Repository setup.
          </Hint>
          <Box {...grid()}>
            <Text
              id={`${id}-name`}
              label="Repository"
              raw="key"
              rule={REPOSITORY_FIELD_RULES.name}
              placeholder="owner/name"
              value={repository.name}
              onChange={(value) => set({ name: value })}
            />
          </Box>
        </FieldGroup>
      )}
      {tab === 'landing' && (
        <>
          <FieldGroup title="Where tasks land" blurb={REPOSITORY_BLURBS.landing}>
            <Box {...grid()}>
              <Text
                id={`${id}-base`}
                label="Default branch"
                raw="baseBranch"
                rule={REPOSITORY_FIELD_RULES.baseBranch}
                placeholder="main"
                width="md"
                value={repository.baseBranch}
                onChange={(value) => set({ baseBranch: value })}
              />
            </Box>
          </FieldGroup>
          <FieldGroup title={LANDING_PART_TEXT.merge.title} blurb={LANDING_PART_TEXT.merge.blurb}>
            <Box {...grid()}>
              <Choice
                id={`${id}-landing-mode`}
                label="Landing mode"
                raw="landing.mode"
                rule={{ required: false, blank: 'blank: as avoozl setup left it' }}
                value={repository.landingMode}
                options={[...LANDING_MODES]}
                none="Not set"
                width="md"
                onChange={(value) => set({ landingMode: value })}
              />
            </Box>
            <AutoMergeFields id={id} repository={repository} set={set} />
          </FieldGroup>
          <FieldGroup title="Merge method" blurb="How a pull request merges when auto-merge is armed.">
            <MergeMethodFields id={id} repository={repository} set={set} />
          </FieldGroup>
          <FieldGroup title={LANDING_PART_TEXT.conflicts.title} blurb={LANDING_PART_TEXT.conflicts.blurb}>
            <ConflictFields id={id} repository={repository} set={set} />
          </FieldGroup>
          <FieldGroup title="Required checks" blurb={REPOSITORY_BLURBS.checks}>
            <ChecksEditor id={id} value={repository.requiredChecks} inspect={inspect} repository={name} onChange={(value) => set({ requiredChecks: value })} />
          </FieldGroup>
          <FieldGroup title="Pull-request reviews" blurb={REPOSITORY_BLURBS.reviews}>
            <ReviewRule inspect={inspect} repository={name} />
          </FieldGroup>
          <ReviewRoles review={props.review} repository={name} />
        </>
      )}
      {tab === 'github' && (
        <>
          <FieldGroup title="Who counts" blurb={REPOSITORY_BLURBS.github}>
            <Row gap={3} align="end">
              <Choice
                id={`${id}-permission`}
                label="Minimum permission"
                raw="minimumPermission"
                rule={REPOSITORY_FIELD_RULES.minimumPermission}
                value={repository.minimumPermission}
                options={choices.permissions}
                none={repository.allowedActors.trim() ? 'None' : 'Default: write'}
                width="md"
                onChange={(value) => set({ minimumPermission: value })}
              />
              <Text
                id={`${id}-actors`}
                label="Or only these people"
                raw="allowedActors"
                rule={REPOSITORY_FIELD_RULES.allowedActors}
                placeholder="login, login"
                width="md"
                value={repository.allowedActors}
                onChange={(value) => set({ allowedActors: value })}
              />
            </Row>
          </FieldGroup>
          <FieldGroup title="Priority" blurb="Ready tasks carrying a higher label here start first.">
            <Text
              id={`${id}-priority`}
              label="Priority labels, highest first"
              raw="priorityLabels"
              rule={{ required: false, blank: 'blank: graph order only' }}
              placeholder="p0, p1, p2"
              width="lg"
              value={repository.priority}
              onChange={(value) => set({ priority: value })}
            />
          </FieldGroup>
        </>
      )}
      {tab === 'mirror' && <MirrorBox id={`${id}-mirror`} mirror={repository.mirror} onChange={(mirror) => set({ mirror })} />}
      {tab === 'map' && (
        <FieldGroup title="Workflow map" blurb={REPOSITORY_BLURBS.map}>
          <WorkflowMap
            workspaceId={props.workspaceId}
            mode={props.mode}
            repository={repository}
            planningRepository={props.planningRepository}
            onJump={(jump) => {
              props.onTab(jump.tab)
              setPending(jump)
            }}
          />
        </FieldGroup>
      )}
    </>
  )
}

// The tabs the repository editor fills.
export const EDITOR_TABS: readonly EditTab[] = ['general', 'landing', 'github', 'mirror', 'map']

const MODE_TITLES: Record<string, string> = { local: 'Local only', 'plans-repo': 'Plans repository', 'single-repo': 'Single repository' }

function RepositoriesTab(props: {
  form: SettingsForm
  choices: SettingsChoices
  review: ReviewSettings | undefined
  workspaceId: string
  dirty: boolean
  // Edit one change into .avoozl.json; the reason it failed, or null.
  onCommit: (edit: (current: SettingsForm) => SettingsForm) => Promise<string | null>
  // The registry change rewrote .avoozl.json; read the form again.
  onRegistryChanged: () => Promise<unknown>
  onOpenPlans?: () => void
}) {
  const { form, choices } = props
  const api = useAppApi()
  const workspaces = useMemo(() => workspaceClient(api), [api])
  const reveal = useReveal()
  const loadCheckouts = useCallback((id: string) => workspaces.repositories(id), [workspaces])
  const { value: checkouts, reload } = useRead<Repository[]>(props.workspaceId, loadCheckouts)
  const rows = repositoryRows(checkouts ?? [], form.repositories, form.mode === 'plans-repo' ? form.planningRepository : '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const addBlocked = props.dirty ? 'Save or discard your settings changes first: adding a repository writes .avoozl.json.' : null
  const [open, setOpen] = useState<{ kind: 'view' | 'edit'; key: string } | null>(null)
  // Set up GitHub and import specs: the folder it is open for, and the folder
  // just added (offered right after Add repository).
  const [setupFolder, setSetupFolder] = useState<string | null>(null)
  const [offer, setOffer] = useState<string | null>(null)
  const setupBlocked = props.dirty ? 'Save or discard your settings changes first: setting up writes .avoozl.json.' : null
  const openRow = open ? rows.find((row) => row.key === open.key) : undefined
  const roleValue = (row: RepositoryRow) => (mirrorSourceOf(form, row.github) ? MIRROR_ROLE : roleOfRow(form, row))
  const roleText = (row: RepositoryRow) => {
    const source = mirrorSourceOf(form, row.github)
    return source ? `Private mirror of ${source}` : roleLabel(roleOfRow(form, row))
  }
  // A repository leaves the list: its checkout is unregistered, or, with no
  // checkout, its GitHub settings leave the file.
  const removeRow = async (target: RepositoryRow) => {
    setBusy(true)
    setOffer(null)
    setMessage(null)
    try {
      if (target.checkout) {
        await workspaces.removeRepository(props.workspaceId, target.checkout.id)
        await Promise.all([reload(), props.onRegistryChanged()])
        setMessage({ ok: true, text: `Removed ${target.name}. The folder and GitHub were not touched.` })
      } else {
        const failure = await props.onCommit((current) => ({ ...current, repositories: current.repositories.filter((entry) => entry.name.trim() !== target.name) }))
        setMessage(failure ? { ok: false, text: failure } : { ok: true, text: `Removed ${target.name}'s GitHub settings from .avoozl.json.` })
      }
    } catch (caught) {
      setMessage({ ok: false, text: errorMessage(caught) })
    } finally {
      setBusy(false)
    }
  }
  const added = async (id: string, role: AddedRole) => {
    await Promise.all([reload(), props.onRegistryChanged()])
    setOffer(role.folder)
    if (role.changed && role.github) {
      const failure = await props.onCommit((current) =>
        withRepositoryEdit(current, { github: role.github, branch: role.branch, policy: -1 }, { entry: null, role: role.role, source: role.source }),
      )
      if (failure) return setMessage({ ok: false, text: `Added ${id}, but its role was not saved. ${failure}` })
    }
    setMessage({ ok: true, text: `Added ${id}.` })
  }
  // The repository's own settings, inside its Edit dialog, on its open tab,
  // with the Isolation panel under Landing for a registered checkout.
  const settingsFor = (
    row: RepositoryRow,
    view: { entry: RepositoryForm | null; setEntry: (entry: RepositoryForm) => void; tab: EditTab; setTab: (tab: EditTab) => void },
  ): EditSettings => {
    const own = repositorySettings(row, view)
    if (view.tab !== 'landing' || !row.checkout) return own
    return {
      ...own,
      body: (
        <>
          {own.body}
          <IsolationPanel key={row.checkout.id} workspaceId={props.workspaceId} repositoryId={row.checkout.id} value={row.checkout.isolation} />
        </>
      ),
    }
  }
  // The editor, or what a local or settings-less repository has instead.
  const repositorySettings = (
    row: RepositoryRow,
    view: { entry: RepositoryForm | null; setEntry: (entry: RepositoryForm) => void; tab: EditTab; setTab: (tab: EditTab) => void },
  ): EditSettings => {
    const { entry, setEntry, tab } = view
    if (!isGitHubMode(form.mode))
      return { tabs: LOCAL_TABS, body: <LocalRepository row={row} review={props.review} kept={row.policy >= 0} workspaceId={props.workspaceId} tab={tab} /> }
    if (entry || row.policy >= 0)
      return {
        tabs: EDITOR_TABS,
        body: (
          <RepositoryEditor
            index={row.policy >= 0 ? row.policy : form.repositories.length}
            repository={entry ?? form.repositories[row.policy]}
            choices={choices}
            review={props.review}
            mode={form.mode}
            workspaceId={props.workspaceId}
            planningRepository={form.planningRepository}
            tab={tab}
            onTab={view.setTab}
            onChange={setEntry}
          />
        ),
      }
    if (row.github)
      return {
        tabs: [],
        body: tab === 'general' && (
          <FieldGroup title="Settings" blurb={`${row.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`}>
            <IconLabel
              icon={Plus}
              tooltip="Add an entry you can change; written when you press Save"
              onClick={() => setEntry({ ...emptyRepository(row.github!), baseBranch: row.branch })}
            >
              Add GitHub settings for {row.github}
            </IconLabel>
          </FieldGroup>
        ),
      }
    return {
      tabs: ['landing'],
      body: tab === 'landing' && (
        <FieldGroup title="Checks" blurb="A local-only repository: no GitHub remote, so the GitHub settings do not apply.">
          <Box as="p" size="sm" data-local-checks>
            Required checks apply only to GitHub pull requests. Here Avoozl runs this repository&apos;s checks for every task; a check with paths runs only when a change touches
            them.
          </Box>
        </FieldGroup>
      ),
    }
  }
  return (
    <Box flex flexCol gap="3.5">
      <Card>
        <Section
          title={`Added repositories (${rows.length})`}
          blurb={REPOSITORIES_LINE}
          actions={
            rows.length > 0 && (
              <span data-add-repository-open>
                <IconLabel icon={Plus} primary disabled={Boolean(addBlocked)} tooltip={addBlocked ?? undefined} onClick={() => setAdding(true)}>
                  Add repository
                </IconLabel>
              </span>
            )
          }
        >
          {checkouts === null ? (
            <Hint as="p" size="sm">
              Loading…
            </Hint>
          ) : (
            <RepositoryList
              rows={rows}
              roleText={roleText}
              entryOf={(row) => (row.policy >= 0 ? form.repositories[row.policy] : null)}
              mirrorOf={(row) => mirrorSourceOf(form, row.github)}
              busy={busy}
              onView={(row) => setOpen({ kind: 'view', key: row.key })}
              onEdit={(row) => setOpen({ kind: 'edit', key: row.key })}
              onRemove={(target) => void removeRow(target)}
              onSetup={(row) => setSetupFolder(row.folder)}
              setupBlocked={setupBlocked}
              onAdd={() => setAdding(true)}
              addBlocked={addBlocked}
            />
          )}
          {message && (
            <Box role={message.ok ? 'status' : 'alert'} as="p" mt="2" size="sm" tone={message.ok ? 'muted' : 'danger'}>
              {message.text}
            </Box>
          )}
          {offer && message?.ok && (
            <Box mt="2" data-setup-offer>
              <IconLabel
                icon={Workflow}
                primary
                disabled={Boolean(setupBlocked)}
                tooltip={setupBlocked ?? 'Choose its mode, set up GitHub and import its specs. Nothing is written before Set up.'}
                onClick={() => setSetupFolder(offer)}
              >
                Set up GitHub and import specs
              </IconLabel>
            </Box>
          )}
          {rows.length > 0 && (
            <Box as="p" mt="2" size="sm" data-tasks-live>
              {tasksLiveLine(form.mode, form.planningRepository)}
            </Box>
          )}
        </Section>
      </Card>
      {open?.kind === 'view' && openRow && (
        <ViewRepository
          row={openRow}
          roleText={roleText(openRow)}
          entry={openRow.policy >= 0 ? form.repositories[openRow.policy] : null}
          githubUrl={githubHref(openRow.github) ?? null}
          onReveal={(folder) => void reveal(folder).then((text) => setMessage({ ok: true, text }))}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'edit' && openRow && (
        <EditRepository
          key={openRow.key}
          row={openRow}
          workspaceId={props.workspaceId}
          role={roleValue(openRow)}
          source={mirrorSourceOf(form, openRow.github)}
          saved={openRow.policy >= 0 ? form.repositories[openRow.policy] : null}
          settings={(view) => settingsFor(openRow, view)}
          onSave={(edit) => props.onCommit((current) => withRepositoryEdit(current, openRow, edit))}
          onApplied={() => void props.onRegistryChanged()}
          onClose={() => setOpen(null)}
        />
      )}
      {setupFolder && (
        <SetupRepository
          workspaceId={props.workspaceId}
          folder={setupFolder}
          onChanged={() => Promise.all([reload(), props.onRegistryChanged()])}
          onOpenPlans={props.onOpenPlans}
          onClose={(note) => {
            setSetupFolder(null)
            setOffer(null)
            if (note) setMessage({ ok: true, text: note })
          }}
        />
      )}
      {adding && (
        <AddRepositoryModal
          workspaceId={props.workspaceId}
          mode={modeKey(form.mode)}
          planningTaken={(checkouts ?? []).some((c) => c.planning)}
          onClose={() => setAdding(false)}
          onAdded={(id, role) => void added(id, role)}
        />
      )}
    </Box>
  )
}

// Local only: what a repository uses here (landing branch, its checks,
// reviewer chats), one Edit tab at a time. Its GitHub settings, if any, are
// kept unused.
const LOCAL_TABS: readonly EditTab[] = ['general', 'landing', 'map']
function LocalRepository(props: { row: RepositoryRow; review: ReviewSettings | undefined; kept: boolean; workspaceId: string; tab: EditTab }) {
  const { row, tab } = props
  if (tab === 'general')
    return (
      <FieldGroup title="Local only" blurb="Avoozl codes, checks and merges here on this Mac.">
        {props.kept && (
          <Hint as="p" size="xs">
            Its GitHub settings are kept, not used. They apply again if a repository gets a GitHub role.
          </Hint>
        )}
      </FieldGroup>
    )
  if (tab === 'landing')
    return (
      <>
        <FieldGroup title="Where tasks land">
          <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1" size="sm">
            <Hint as="dt">Landing branch</Hint>
            <dd>
              <code>{row.branch}</code>
            </dd>
          </Box>
          <Box as="p" size="sm" data-local-checks>
            Avoozl runs this repository&apos;s checks for every task; a check with paths runs only when a change touches them.
          </Box>
        </FieldGroup>
        <ReviewRoles review={props.review} repository={row.github ?? row.name} />
      </>
    )
  if (tab === 'map')
    return (
      <FieldGroup title="Workflow map" blurb={REPOSITORY_BLURBS.map}>
        <WorkflowMap workspaceId={props.workspaceId} mode="local" repository={{ ...emptyRepository(row.name), baseBranch: row.branch }} />
      </FieldGroup>
    )
  return null
}

// The GitHub settings that belong to the whole workspace, on the GitHub page:
// what no single repository's role can say. One tab per group, the open one
// in the address (?github=<tab>); the page's one Save bar writes them all,
// and a tab with unsaved changes shows a dot. Switching a role never
// deletes a stored setting.
export const GITHUB_TABS = [
  { key: 'issues', label: 'Epic issues' },
  { key: 'sync', label: 'Sync pace' },
  { key: 'setup', label: 'Set up GitHub' },
  { key: 'calls', label: 'GitHub calls' },
] as const
export type GitHubTab = (typeof GITHUB_TABS)[number]['key']
const GITHUB_TAB_KEYS = GITHUB_TABS.map((tab) => tab.key)
// The form keys each tab edits; Set up and GitHub calls edit none.
export const GITHUB_TAB_FIELDS: Record<GitHubTab, readonly (keyof SettingsForm)[]> = {
  issues: ['epicIssueType'],
  sync: ['cacheSeconds', 'writesPerMinute', 'writesPerHour'],
  setup: [],
  calls: [],
}

function WorkspaceGitHub(props: {
  form: SettingsForm
  saved: SettingsForm
  choices: SettingsChoices
  set: (change: Partial<SettingsForm>) => void
  setup: ReactNode
  rate: RateView | undefined
}) {
  const { form, set } = props
  const [tab, pick] = useTabParam<GitHubTab>('github', GITHUB_TAB_KEYS, 'issues', 'Back to the last GitHub tab')
  const kept = unusedInLocal(form)
  if (!isGitHubMode(form.mode))
    return (
      <>
        <Card>
          <Section title="GitHub settings" blurb="They apply once a repository has a GitHub role in Repository setup.">
            <Box flex flexCol gap="1.5" size="sm" data-local-note>
              <p>{LOCAL_HIDDEN_LINE}</p>
              <Hint as="p" size="xs">
                Folders, landing branches and checks are under Repository setup. Worker and reviewer chats come from delivery in .avoozl.json.
              </Hint>
              {kept.length > 0 && (
                <Hint as="p" size="xs" data-kept>
                  Kept, not used: {kept.join(', ')}. Give a repository a GitHub role to use them again.
                </Hint>
              )}
            </Box>
          </Section>
        </Card>
        <RateBlock rate={props.rate} />
      </>
    )
  const dirty = dirtyTabs(form, props.saved, GITHUB_TAB_FIELDS)
  return (
    <Box flex minW0 flexCol gap="3.5" data-github-tabs>
      <Tabs id="avoozl-github-tab" label="GitHub settings" tabs={GITHUB_TABS.map((item) => ({ ...item, dirty: dirty.has(item.key) }))} current={tab} onPick={pick} />
      <TabPanel id="avoozl-github-tab" current={tab}>
        {tab === 'issues' && (
          <Card>
            <Section title="Epic issues" blurb="The issue type a published epic issue gets. For every repository in this workspace.">
              <Box {...grid()}>
                <Text
                  id="avoozl-settings-epic"
                  label="Epic issue type"
                  raw="epicIssueType"
                  rule={{ required: false, blank: 'blank: epics get no issue type' }}
                  placeholder="Epic"
                  width="md"
                  value={form.epicIssueType}
                  onChange={(value) => set({ epicIssueType: value })}
                />
              </Box>
            </Section>
          </Card>
        )}
        {tab === 'sync' && (
          <Card>
            <Section title="Sync pace" blurb="How long Avoozl keeps GitHub's answers, and how fast it writes. Every write from the app, CLI and tick shares these limits.">
              <Box {...grid()}>
                <Text
                  id="avoozl-settings-cache"
                  label="Keep GitHub answers (seconds)"
                  raw="cacheSeconds"
                  rule={{ required: false, blank: 'blank: 60. 0 turns the cache off' }}
                  placeholder="60"
                  type="number"
                  width="sm"
                  value={form.cacheSeconds}
                  onChange={(value) => set({ cacheSeconds: value })}
                />
                <Text
                  id="avoozl-settings-writes-minute"
                  label="GitHub writes a minute"
                  raw="writesPerMinute"
                  rule={{ required: false, blank: 'blank: 60. At most 80' }}
                  placeholder="60"
                  type="number"
                  width="sm"
                  value={form.writesPerMinute}
                  onChange={(value) => set({ writesPerMinute: value })}
                />
                <Text
                  id="avoozl-settings-writes-hour"
                  label="GitHub writes an hour"
                  raw="writesPerHour"
                  rule={{ required: false, blank: 'blank: 400. At most 500' }}
                  placeholder="400"
                  type="number"
                  width="sm"
                  value={form.writesPerHour}
                  onChange={(value) => set({ writesPerHour: value })}
                />
              </Box>
            </Section>
          </Card>
        )}
        {tab === 'setup' && (
          <Card>
            <Section title="Set up GitHub" blurb="Creates the epic issue type the other tabs name. It reads GitHub first and shows every write before making one.">
              {props.setup}
            </Section>
          </Card>
        )}
        {tab === 'calls' &&
          (rateLines(props.rate).length || usageRows(props.rate).length ? (
            <RateBlock rate={props.rate} />
          ) : (
            <Card>
              <Section title="GitHub calls" blurb="The last rate-limit numbers GitHub sent, and the calls of the last hour by source.">
                <Hint as="p" size="sm" data-empty="github-calls">
                  No GitHub calls recorded yet. They show here after the next sync.
                </Hint>
              </Section>
            </Card>
          ))}
      </TabPanel>
    </Box>
  )
}

// What Set up GitHub takes from the form above it, so each setting has one
// place: the mode, planning repository and repositories.
function sharedSetup(form: SettingsForm) {
  return {
    mode: form.mode,
    planningRepository: form.planningRepository,
    repositories: form.repositories
      .map((r) => r.name.trim())
      .filter(Boolean)
      .join(', '),
  }
}

// The tabs that edit `.avoozl.json`: one form, one Save, kept across tabs.
function PolicyEditor(props: { workspaceId: string; tab: SettingsTab; onOpenPlans?: () => void; onTab?: (tab: SettingsTab) => void }) {
  const { workspaceId, tab } = props
  const api = useAppApi()
  const client = useMemo(() => settingsClient(api), [api])
  const load = useCallback((id: string) => client.get(id), [client])
  const { value: settings, error, busy, reload } = useRead<GitHubSettings>(workspaceId, load)
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(settings ? toForm(settings.github) : null)
    setMessage(null)
  }, [settings])

  const set = (change: Partial<SettingsForm>) => form && setForm({ ...form, ...change })
  const save = async (): Promise<string | null> => {
    if (!form || !settings) return 'Settings are not loaded.'
    const missing = missingRequired(form)
    if (missing) {
      setMessage({ ok: false, text: `Not saved. ${missing}` })
      return `Not saved. ${missing}`
    }
    setSaving(true)
    try {
      await client.save(workspaceId, toPolicy(form), settings.hash)
      await reload()
      setMessage({ ok: true, text: 'Saved to .avoozl.json.' })
      return null
    } catch (caught) {
      setMessage({ ok: false, text: errorMessage(caught) })
      return errorMessage(caught)
    } finally {
      setSaving(false)
    }
  }

  // Writes one change to the file as it is now: read again, apply, save. The
  // Repository setup dialogs use it, so a save never rides on a stale hash.
  const commit = async (edit: (current: SettingsForm) => SettingsForm): Promise<string | null> => {
    try {
      const fresh = await client.get(workspaceId)
      const next = edit(toForm(fresh.github))
      const missing = missingRequired(next)
      if (missing) return `Not saved. ${missing}`
      await client.save(workspaceId, toPolicy(next), fresh.hash)
      await reload()
      return null
    } catch (caught) {
      return errorMessage(caught)
    }
  }

  const choices = settings?.choices
  if (error)
    return (
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!settings || !form || !choices)
    return (
      <Hint as="p" size="sm">
        {busy ? 'Loading…' : 'Not loaded'}
      </Hint>
    )
  const dirty = JSON.stringify(toPolicy(form)) !== JSON.stringify(toPolicy(toForm(settings.github)))
  const missing = missingRequired(form)
  return (
    <Box flex flexCol gap="3.5">
      {settings.error && (
        <ErrorText role="alert" size="sm">
          The saved settings are invalid: {settings.error}
        </ErrorText>
      )}
      {tab === 'repositories' ? (
        <RepositoriesTab
          form={form}
          choices={choices}
          review={settings.review}
          workspaceId={workspaceId}
          dirty={dirty}
          onCommit={commit}
          onRegistryChanged={reload}
          onOpenPlans={props.onOpenPlans}
        />
      ) : (
        <WorkspaceGitHub
          form={form}
          saved={toForm(settings.github)}
          choices={choices}
          set={set}
          rate={settings.rate}
          setup={<SetupWizard workspaceId={workspaceId} client={client} settings={settings} shared={sharedSetup(form)} onSaved={reload} />}
        />
      )}
      <SaveFooter
        dirty={dirty}
        saving={saving}
        problem={missing}
        error={message && !message.ok ? message.text : null}
        ok={message?.ok ? message.text : null}
        note="Writes .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => void reload()}
      />
    </Box>
  )
}

// One tab that throws while drawing shows why, instead of blanking the app.
class TabBoundary extends Component<{ label: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <ErrorText role="alert" size="sm" data-error-boundary>
        Settings › {this.props.label} could not be drawn: {this.state.error}. Reload the page. If it happens again, update Avoozl.
      </ErrorText>
    )
  }
}

function SettingsBody(
  props: { tab: SettingsTab; workspaceId: string | null; onTab: (tab: SettingsTab) => void } & Pick<
    Parameters<typeof SettingsView>[0],
    'onSelectWorkspace' | 'onListChange' | 'onOpenPlans'
  >,
) {
  const { tab, workspaceId } = props
  if (tab === 'workspaces')
    return (
      <Box flex flexCol gap="3.5">
        <WorkspaceView selected={workspaceId} onSelect={props.onSelectWorkspace} onListChange={props.onListChange} />
        <ThisComputer workspaceId={workspaceId} />
        <NoticesSettings workspaceId={workspaceId} />
      </Box>
    )
  if (!workspaceId)
    return (
      <EmptyState
        title="Pick a workspace"
        subtitle="Choose one in the header, or add one under Workspaces."
        action={<Btn onClick={() => props.onTab('workspaces')}>Open Workspaces</Btn>}
      />
    )
  if (tab === 'plugins') return <PluginsSettings workspaceId={workspaceId} onOpenGitHub={() => props.onTab('github')} onOpenRepositories={() => props.onTab('repositories')} />
  if (tab === 'content') return <ContentRulesSettings workspaceId={workspaceId} />
  if (tab === 'flow') return <FlowSettings workspaceId={workspaceId} />
  if (tab === 'models') return <ModelsSettings workspaceId={workspaceId} />
  if (tab === 'delivery') return <DeliverySettings workspaceId={workspaceId} />
  return (
    <Box flex flexCol gap="3.5">
      <PolicyEditor workspaceId={workspaceId} tab={tab} onOpenPlans={props.onOpenPlans} onTab={props.onTab} />
    </Box>
  )
}

// The last GitHub rate-limit numbers, then the calls of the last hour by
// source, all in one bordered section.
export function RateBlock({ rate }: { rate: RateView | undefined }) {
  const lines = rateLines(rate),
    rows = usageRows(rate)
  if (!lines.length && !rows.length) return null
  return (
    <Card>
      <Section
        title="GitHub calls"
        blurb="The last rate-limit numbers GitHub sent, and the calls of the last hour by source. Calls count against the limit; 304s and cached answers do not."
      >
        {lines.length > 0 && (
          <Hint as="div" flex flexCol gap="1" size="xs" data-github-rate>
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </Hint>
        )}
        {rows.length > 0 && (
          <>
            <Hint as="p" size="xs">
              {rate?.hourCalls ?? 0} calls in the last hour. Click a heading to sort.
            </Hint>
            <UsageTable rows={rows} />
          </>
        )}
      </Section>
    </Card>
  )
}

const USAGE_COLUMNS: { key: UsageKey; label: string }[] = [
  { key: 'source', label: 'Source' },
  { key: 'calls', label: 'Calls' },
  { key: 'notModified', label: '304 (free)' },
  { key: 'cached', label: 'Cached (free)' },
]

// A real table: each heading is a button that sorts by it, and the th says
// which way (aria-sort). Numbers sit right-aligned.
export function UsageTable({ rows }: { rows: ReturnType<typeof usageRows> }) {
  const [sort, setSort] = useState<UsageSort>(USAGE_SORT)
  const sorted = sortUsage(rows, sort)
  return (
    <Box css-overflow-x="auto">
      <Box data-github-usage as="table" css-width="100%" css-border-collapse="collapse" css-font-size="14">
        <thead>
          <tr>
            {USAGE_COLUMNS.map((col) => {
              const on = sort.key === col.key
              const right = col.key !== 'source'
              return (
                <Box
                  key={col.key}
                  scope="col"
                  aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  as="th"
                  css-text-align={right ? 'right' : 'left'}
                  css-padding="4px-8px"
                  css-font-weight="500"
                  css-border-bottom="1px-solid-border"
                >
                  <PlainButton
                    type="button"
                    data-sort={col.key}
                    css-background="none"
                    css-border="0"
                    css-color="inherit"
                    css-cursor="pointer"
                    css-padding="0"
                    inlineFlex
                    items="center"
                    gap="1"
                    weight="medium"
                    onClick={() => setSort(nextUsageSort(sort, col.key))}
                  >
                    {col.label}
                    <Hint aria-hidden="true" as="span" size="xs">
                      {on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </Hint>
                  </PlainButton>
                </Box>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.source} data-usage-source={row.source}>
              <Box as="td" css-padding="4px-8px">
                {row.source}
              </Box>
              <Box as="td" css-padding="4px-8px" css-text-align="right" css-font-variant-numeric="tabular-nums">
                {row.calls}
              </Box>
              <Box as="td" css-padding="4px-8px" css-text-align="right" css-font-variant-numeric="tabular-nums">
                {row.notModified}
              </Box>
              <Box as="td" css-padding="4px-8px" css-text-align="right" css-font-variant-numeric="tabular-nums">
                {row.cached}
              </Box>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  )
}

// Settings is one accordion: one section open at a time, each change of
// section a Back step.
export default function SettingsView(props: {
  workspaceId: string | null
  workspaceName?: string | null
  tab?: SettingsTab
  onTab?: (tab: SettingsTab) => void
  onSelectWorkspace?: (id: string | null) => void
  onListChange?: (list: WorkspaceList) => void
  onOpenPlans?: () => void
}) {
  const { workspaceId } = props
  const [own, setOwn] = useState<SettingsTab>(SETTINGS_HOME)
  const asked = props.tab ?? own
  // A remembered section that no longer exists falls back to Workspaces.
  const tab: SettingsTab = SETTINGS_TABS.some((t) => t.key === asked) ? (asked as SettingsTab) : SETTINGS_HOME
  const choose = (next: SettingsTab) => (props.onTab ? props.onTab(next) : setOwn(next))
  const pick = (next: SettingsTab) => choose(next)
  const renderBody = (section: (typeof SETTINGS_TABS)[number]) => (
    <Box flex flexCol gap="3" pb="4" data-settings-body={section.key}>
      <Hint as="p" size="sm" data-blurb={section.key}>
        {SETTINGS_BLURBS[section.key]}
      </Hint>
      <TabBoundary key={section.key} label={section.label}>
        <SettingsBody
          tab={section.key}
          workspaceId={workspaceId}
          onTab={pick}
          onSelectWorkspace={props.onSelectWorkspace}
          onListChange={props.onListChange}
          onOpenPlans={props.onOpenPlans}
        />
      </TabBoundary>
    </Box>
  )
  const current = SETTINGS_TABS.find((t) => t.key === tab) ?? SETTINGS_TABS[0]
  // The nav lists the sections; the page shows only the picked one.
  return (
    <Box aria-labelledby="avoozl-settings-title" as="section" flex flexCol gap="3.5">
      <ViewHeading id="avoozl-settings-title" view="settings">
        Settings
      </ViewHeading>
      <Stack data-settings-section={current.key} data-open="true" as="section" gap={2}>
        <Box as="h3" size="base" weight="semibold" breakWords data-settings-title>
          {settingsTitle(current.key, current.label, props.workspaceName)}
        </Box>
        {renderBody(current)}
      </Stack>
    </Box>
  )
}
