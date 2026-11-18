import { Component, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckRow, FieldRow, Marker, RawKey, fieldDescribedBy, type FieldWidth } from './FieldRow.tsx'
import { Tabs, TabPanel, useTabParam } from './ui/Tabs.tsx'
import { dirtyTabs } from './tabs.ts'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { RoleHelp } from './RoleHelp.tsx'
import {
  MANAGED_LABEL_TEXT,
  PROJECT_DEFAULTS,
  PROJECT_FIELD_RULES,
  REPOSITORY_FIELD_RULES,
  checkRows,
  emptyRepository,
  emptyRule,
  inspectClient,
  MATCH_HELP,
  matchChips,
  matchClient,
  type MatchPreview,
  missingRequired,
  reviewRuleText,
  settingsClient,
  toggleCheck,
  untriagedDefault,
  MIRROR_DEFAULT_TEXT,
  MIRROR_FORWARD_MODES, MIRROR_FORWARD_TARGETS,
  type MirrorForm,
  type UntriagedForm,
  type FieldRule,
  type RepositoryInspect,
  toForm,
  toPolicy,
  type GitHubSettings,
  type RepositoryForm,
  type ReviewRole,
  type ReviewSettings,
  type RuleForm,
  type SettingsChoices,
  type SettingsForm,
  LOCAL_HIDDEN_LINE,
  SUB_ISSUE_LINE,
  OLD_LABEL_NOTE,
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
  visibleSettings,
  SETTINGS_HOME,
  settingsTitle,
} from './settings-api.ts'
import SetupWizard from './SetupWizard.tsx'
import { AVOOZL_LABELS_LINE, AutoMergeFields, AvoozlLabelFields, CREW_PART_TEXT, ConflictFields, LANDING_MODES, MergeMethodFields, ReviewRulesFields } from './CrewsRulesSettings.tsx'
import WorkflowMap, { focusField } from './WorkflowMap.tsx'
import { type Jump, type JumpField } from './workflow-map.ts'
import WorkspaceView from './WorkspaceView.tsx'
import SetupRepository from './Onboard.tsx'
import { AddRepository, REPOSITORIES_LINE, RepositoryList, repositoryRows, useReveal, type AddedRole } from './RepositoriesSettings.tsx'
import { EditRepository, ViewRepository, type EditSettings } from './RepositoryModals.tsx'
import type { EditTab } from './repo-edit-tabs.ts'
import { FormSection } from './FormSection.tsx'
import { githubHref, type RepositoryRow } from './repository-rows.ts'
import PluginsSettings from './PluginsSettings.tsx'
import ContentRulesSettings from './ContentRulesSettings.tsx'
import FlowSettings from './FlowSettings.tsx'
import ModelsSettings from './ModelsSettings.tsx'
import DeliverySettings from './DeliverySettings.tsx'
import { SaveFooter } from './SaveFooter.tsx'
import { useRead } from './useRead.ts'
import { labelsClient, triageRows, type RepositoryLabels } from './untriaged-api.ts'
import { COMMAND_PATH, errorMessage, workspaceClient, type Repository, type WorkspaceList } from './workspace-api.ts'
import type { DeliverySettings as DeliveryRead } from './delivery-api.ts'
import { Fold } from './ui/controls.tsx'
import { AskForHelp, DangerBtn, IconLabel, SectionHeading, TipBtn, ViewHeading, dangerStyle } from './ui/controls.tsx'
import { Plus, Trash2, Workflow, type LucideIcon } from './icons.ts'
import { linkHref } from './views-api.ts'
import { ThisComputer } from './Driver.tsx'
import { ApiKeySettings } from './ApiKeySettings.tsx'
import { ErrorText } from './ui/ErrorText'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { SelectField } from './ui/SelectField'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

// Fields share a row and wrap; each keeps a readable width.
const grid = (min = 220): CSSProperties => ({
  display: 'grid',
  gap: 12,
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
  alignItems: 'start',
})

// Release N (release.capacity): how many issues get the ready label at once.
export const RELEASE_N_HELP = 'How many ready tasks are released at once.'

export const SETTINGS_TABS = [
  { key: 'workspaces', label: 'Workspaces' },
  // Labels, Crews and rules and the Workflow map are tabs of each repository's editor.
  { key: 'repositories', label: 'Repository setup' },
  { key: 'github', label: 'GitHub' },
  // Everything Avoozl and Issue Radar crews share. Radar is an intake source only (R91.6).
  { key: 'radar', label: 'Issue Radar' },
  { key: 'plugins', label: 'Plugins' },
  { key: 'content', label: 'Content rules' },
  { key: 'flow', label: 'Flow' },
  // Avoozl's own chats only; Radar crews pick their own model.
  { key: 'models', label: 'Models' },
  { key: 'delivery', label: 'Delivery' },
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]['key']

// One short line under each Settings heading: what it controls and when
// you would change it. Each is checked against what the code does.
export const SETTINGS_BLURBS: Record<SettingsTab, string> = {
  workspaces: 'The Avoozl workspaces on this machine, each a folder with its own task database, and the settings that stay on this computer.',
  github:
    'The GitHub settings of the selected workspace, for every repository in it. Each tab is one group; one Save writes them all to .avoozl.json.',
  radar:
    'The labels Avoozl reads from Issue Radar crews and the handoff they use to pass issues to Avoozl, one repository at a time. Save only writes .avoozl.json.',
  repositories:
    "Each repository's role says where its tasks live. Its labels, Workflow map, checks and reviews are tabs under its name. Issue Radar settings have their own page. Save only writes .avoozl.json.",
  plugins:
    'A plugin can bring a team’s settings pack, content rules, a tracker, an intake source or a delivery route. Each one runs or imports only after you approve it on this machine.',
  content:
    'Terms Avoozl must never write: in spec files, issues, comments, briefs and diffs. A match stops the write and asks you.',
  flow: 'How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode.',
  models: "Each role's harness, agent and model, in one place. Issue Radar crews pick their own.",
  delivery:
    'Investigate-first and pull request feedback for Avoozl worker chats. Agents and models are in Models.',
}

// Section blurbs of a repository's Edit dialog (repo-edit-tabs.ts has its tabs).
export const REPOSITORY_BLURBS = {
  map: 'The path work takes in this repository, drawn from its settings. Nothing here is edited; a value opens its field.',
  general: 'Which GitHub repository this is, and who writes the code.',
  landing: 'The branch pull requests merge into, and how many tasks are ready at once.',
  github: "A rule starts its action when an allowed person's label makes an issue match its line. No label name is built in.",
  checks:
    "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
  reviews:
    "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub.",
} as const

const FIELD_LABELS: Record<string, string> = {
  status: 'Status field',
  release: 'Release field',
  wave: 'Wave field',
  iteration: 'Iteration field',
  avoozlState: 'Avoozl state field',
}
// The escalation label is Issue Radar's "needs-human label" setting. A crew
// adds it when it gives an issue up, and Avoozl takes such an issue in, so
// the name Avoozl recommends does not say a person is needed.
export const RECOMMENDED_ESCALATION_LABEL = 'crew: needs avoozl'
const RADAR_LABELS_BLURB = `Labels Issue Radar puts on issues it claims or gives up. Avoozl only reads them. Recommended escalation label: ${RECOMMENDED_ESCALATION_LABEL}. Give Issue Radar's needs-human label for this repository the same name, and keep the crew: prefix so other crews skip the issue.`
const CREW_LABELS: Record<string, string> = {
  claim: 'Claim label',
  needsHuman: 'Escalation label',
}
const STATUS_LABELS: Record<string, string> = {
  todo: 'Ready option',
  inProgress: 'In progress option',
  done: 'Done option',
  deferred: 'Deferred option',
}

// Every field here is the shared FieldRow (FieldRow.tsx).
export { Marker }

function Field(props: { id: string; label: string; raw?: string; rule?: FieldRule; width?: FieldWidth; help?: string; children: ReactNode }) {
  return (
    <FieldRow id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width} help={props.help}>
      {props.children}
    </FieldRow>
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
    <Field id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width} help={props.help}>
      <Input
        id={props.id}
        type={props.type}
        aria-describedby={fieldDescribedBy(props.id, props)}
        value={props.value}
        placeholder={props.placeholder}
        aria-required={props.rule?.required || undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
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
    <Field id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width}>
      <SelectField
        id={props.id}
        value={props.value}
        aria-describedby={fieldDescribedBy(props.id, props)}
        onChange={(event) => props.onChange(event.target.value)} look="field"
      >
        <option value="">{props.none}</option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
    </Field>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <Box as="p" mt="1" size="xs" tone="muted">{children}</Box>
}

// A heading with its one-line blurb, then the fields. A `sub` section is a
// group inside a card: it starts with a top border and padding, so the
// groups of one card read apart.
export function Section(props: { title: string; blurb?: string; actions?: ReactNode; children?: ReactNode; level?: 'card' | 'sub'; icon?: LucideIcon }) {
  const sub = props.level === 'sub'
  return (
    <div className="flex flex-col gap-2.5" data-section={props.title} data-sub-section={sub ? '' : undefined} style={sub ? { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 } : undefined}>
      <SectionHeading level={props.level === 'sub' ? 4 : 3} title={props.title} blurb={props.blurb} actions={props.actions} icon={props.icon} />
      {props.children}
    </div>
  )
}

const CHIP_TEXT = { all: 'has all', any: 'has any', none: 'has none', assignee: 'assigned to' } as const

// One rule's `match` line: monospace text, the parsed terms as chips, the
// refused token inline, and the open issues it matches now. The backend
// parses (github.trigger.preview), so the page and the tick read one grammar.
function MatchField(props: {
  id: string
  value: string
  repository: string
  workspaceId: string
  onChange: (value: string) => void
  // The Untriaged filter reuses this field: its own label, a placeholder
  // standing for the blank line, and no label: term needed.
  untriaged?: { placeholder: string }
}) {
  const api = useAppApi()
  const preview = useMemo(() => matchClient(api), [api])
  const [shown, setShown] = useState<MatchPreview | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const untriaged = Boolean(props.untriaged)
  const line = props.value.trim() || props.untriaged?.placeholder.trim() || ''
  useEffect(() => {
    if (!line) {
      setShown(null)
      setFailed(null)
      return
    }
    let live = true
    // Wait for typing to pause before asking GitHub.
    const timer = setTimeout(() => {
      preview(props.workspaceId, props.repository, line, untriaged).then(
        (result) => live && (setShown(result), setFailed(null)),
        (error) => live && setFailed(errorMessage(error)),
      )
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [line, props.repository, props.workspaceId, preview, untriaged])
  const current = shown && shown.match === line ? shown : null
  const errorId = `${props.id}-error`
  return (
    <Box flex minW0 flexCol gap="1" size="sm">
      <Field
        id={props.id}
        label={untriaged ? 'Untriaged filter' : 'Matches issues'}
        raw={untriaged ? 'untriaged.filter' : 'match'}
        rule={untriaged ? { required: false, blank: 'blank: leaves out the triage labels below' } : { required: true }}
        width={untriaged ? 'lg' : undefined}
      >
        <Input
          id={props.id}
          value={props.value}
          placeholder={props.untriaged ? props.untriaged.placeholder || 'no:assignee' : 'label:agent:go -label:hold'}
          aria-required={!untriaged || undefined}
          aria-invalid={current?.error ? true : undefined}
          aria-describedby={current?.error ? errorId : undefined}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
          style={{ fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)' }}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <Box as="span" size="xs" tone="muted">{MATCH_HELP}</Box>
      </Field>
      {!line && (
        <Box as="span" size="xs" tone="muted">
          {untriaged
            ? 'Blank with no triage labels: every open issue and pull request counts, less rule matches and tasks.'
            : 'Type a line such as label:agent:go to see what it matches.'}
        </Box>
      )}
      {failed && <ErrorText as="span" size="xs">The line could not be checked: {failed}</ErrorText>}
      {current?.error && (
        <ErrorText id={errorId} role="alert" as="span" size="xs">
          {current.error.replace(/ Same syntax as GitHub's issue search\..*$/, '').replace(/^match cannot use /, "Can't use ")}
        </ErrorText>
      )}
      {current?.parsed && (
        <Box flex flexWrap items="center" gap="1.5" data-match-chips>
          {matchChips(current.parsed).map((group) => (
            <Row key={group.kind} as="span" gap={1}>
              <Box as="span" size="xs" tone="muted">{CHIP_TEXT[group.kind]}</Box>
              {group.values.map((value) => (
                <Badge key={value} variant={group.kind === 'none' ? undefined : 'info'}>
                  {value}
                </Badge>
              ))}
            </Row>
          ))}
        </Box>
      )}
      {current?.parsed && <MatchIssues preview={current} untriaged={untriaged} />}
    </Box>
  )
}

function MatchIssues({ preview, untriaged = false }: { preview: MatchPreview; untriaged?: boolean }) {
  const noun = untriaged ? ['item', 'items'] : ['issue', 'issues']
  if (!preview.repository) return <Box as="span" size="xs" tone="muted">Name the repository to see which open {noun[1]} match.</Box>
  if (preview.searchError) return <Box as="span" size="xs" tone="muted">{preview.searchError}</Box>
  if (preview.total === null) return null
  const count =
    preview.total === 0
      ? `No open ${noun[0]} matches now.`
      : `${preview.total} open ${preview.total === 1 ? `${noun[0]} matches` : `${noun[1]} match`} now${untriaged ? ', before rules and tasks are left out' : ''}`
  if (!preview.issues.length) return <Box as="span" size="xs" tone="muted" data-match-issues>{count}</Box>
  // Closed by default, so a page of rules stays short.
  return (
    <Box as="details" size="xs" data-match-issues>
      <Box as="summary" cursorPointer tone="muted">
        {count}
        {preview.total > preview.issues.length ? ` (newest ${preview.issues.length})` : ''}
      </Box>
      <Box as="ul" mt="1" flex flexCol gap="0.5">
        {preview.issues.map((issue) => (
          <Box key={issue.number} as="li" minW0 truncate>
            <TextLink href={linkHref(issue.url)} target="_blank" rel="noopener noreferrer">
              #{issue.number}
            </TextLink>{' '}
            <span>{issue.title}</span>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// Settings › Repositories › Triggers and labels › Untriaged (design §8.5):
// what the Untriaged filter for Needs you › Triage leaves out here, and its notice.
function UntriagedSettings(props: { id: string; value: UntriagedForm; repository: string; workspaceId: string; onChange: (value: UntriagedForm) => void }) {
  const api = useAppApi()
  const readLabels = useMemo(() => labelsClient(api), [api])
  const [labels, setLabels] = useState<RepositoryLabels | null>(null)
  const { id, value, repository } = props
  const set = (change: Partial<UntriagedForm>) => props.onChange({ ...value, ...change })
  const named = /^[\w.-]+\/[\w.-]+$/.test(repository)
  useEffect(() => {
    setLabels(null)
    if (!named) return
    let live = true
    readLabels(props.workspaceId, repository).then(
      (result) => live && setLabels(result),
      (caught: unknown) => live && setLabels({ repository, labels: null, error: errorMessage(caught) }),
    )
    return () => {
      live = false
    }
  }, [named, repository, props.workspaceId, readLabels])
  const rows = triageRows(value.triageLabels, labels?.labels ?? null)
  const toggle = (name: string, on: boolean) =>
    set({ triageLabels: on ? [...value.triageLabels, name] : value.triageLabels.filter((label) => label.toLocaleLowerCase() !== name.toLocaleLowerCase()) })
  return (
    <FormSection
      level={4}
      title="Untriaged"
      blurb="What Needs you › Triage lists for this repository: open issues and pull requests no rule, triage label or task covers."
    >
      <MatchField
        id={`${id}-untriaged-filter`}
        value={value.filter}
        repository={repository}
        workspaceId={props.workspaceId}
        onChange={(filter) => set({ filter })}
        untriaged={{ placeholder: untriagedDefault(value.triageLabels) }}
      />
      <Box as="fieldset" flex flexCol gap="1" size="sm" data-triage-labels>
        <Box as="legend" flex flexWrap items="baseline" gapX="2">
          <Box as="span" weight="medium">Triage labels</Box>
          <Marker rule={{ required: false }} />
        </Box>
        <Box as="span" size="xs" tone="muted">An item with any of these counts as triaged and leaves the list.</Box>
        {!named ? (
          <Box as="span" size="xs" tone="muted">Name the repository as owner/name under Mode, and its labels show here.</Box>
        ) : !labels ? (
          <Box as="span" size="xs" tone="muted">Reading {repository}&apos;s labels…</Box>
        ) : labels.error ? (
          <Box as="span" size="xs" tone="muted">{labels.error}</Box>
        ) : null}
        {rows.length > 0 && (
          <Box as="ul" flex flexWrap gapX="4" gapY="1" aria-label="Triage labels">
            {rows.map((row) => (
              <li key={row.name}>
                <Switch label={row.name} gap={1.5} checked={row.checked} onChange={(on) => toggle(row.name, on)}>
                  <code>{row.name}</code>
                  {row.missing && <Box as="span" size="xs" tone="muted">(not on GitHub)</Box>}
                </Switch>
              </li>
            ))}
          </Box>
        )}
        {labels?.labels && rows.length === 0 && <Box as="span" size="xs" tone="muted">{repository} has no labels yet.</Box>}
        <RawKey name="untriaged.triageLabels" />
      </Box>
      <Row gap={3} align="end">
        <Text
          id={`${id}-untriaged-days`}
          label="Ignore older than, in days"
          raw="untriaged.ignoreOlderThanDays"
          rule={{ required: false, blank: 'blank: every age' }}
          placeholder="any"
          type="number"
          width="md"
          value={value.ignoreOlderThanDays}
          onChange={(ignoreOlderThanDays) => set({ ignoreOlderThanDays })}
        />
        <CheckRow
          label="Notify me when the count goes up"
          help="At most one Kiro Crew notice an hour, with the counts. Off by default."
          raw="untriaged.notify"
          checked={value.notify}
          onChange={(notify) => set({ notify })}
        />
      </Row>
    </FormSection>
  )
}

function RuleEditor(props: {
  id: string
  rule: RuleForm
  actions: string[]
  repository: string
  workspaceId: string
  onChange: (rule: RuleForm) => void
  onRemove: () => void
}) {
  const { rule, id } = props
  const set = (change: Partial<RuleForm>) => props.onChange({ ...rule, ...change })
  return (
    <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <div style={grid(180)}>
        <Text id={`${id}-id`} label="Rule name" raw="id" rule={{ required: true }} placeholder="deliver-ready" value={rule.id} onChange={(value) => set({ id: value })} />
        <Choice id={`${id}-action`} label="Action" raw="action" rule={{ required: true }} value={rule.action} options={props.actions} none="Choose" onChange={(value) => set({ action: value })} />
        <Text id={`${id}-author`} label="Opened by" raw="author" placeholder="anyone" value={rule.author} onChange={(value) => set({ author: value })} />
      </div>
      <MatchField id={`${id}-match`} value={rule.match} repository={props.repository} workspaceId={props.workspaceId} onChange={(value) => set({ match: value })} />
      <Row gap={3}>
        <CheckRow label="Publish a clean breakdown's sub-issues without a re-label" raw="autoPublishChildren" checked={rule.autoPublishChildren} onChange={(autoPublishChildren) => set({ autoPublishChildren })} />
        <Box as="span" ml="auto">
          <DangerBtn
            icon={Trash2}
            confirm={{
              title: `Remove the rule ${rule.id || 'without a name'}?`,
              body: 'Labels stop starting its action once you save. Discard changes before saving brings it back.',
              action: 'Remove rule',
            }}
            onConfirm={props.onRemove}
          >
            Remove rule
          </DangerBtn>
        </Box>
      </Row>
    </div>
  )
}

function Roles({ roles }: { roles: ReviewRole[] }) {
  return (
    <Box as="ul" mt="1" flex flexCol gap="1" size="sm">
      {roles.map((role) => (
        <li key={role.id}>
          <Box as="span" weight="medium">{role.id}</Box>{' '}
          <Box as="span" tone="muted">
            {role.agent} · {role.model ?? 'agent default'} · distinct by {role.distinctFrom}
          </Box>
          <Box as="span" block size="xs" tone="muted">{role.focus}</Box>
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
    <FormSection
      level={4}
      title="Avoozl reviewer chats"
      blurb="Fresh chats that review each local delivery's exact commit before it merges. Edit them under delivery.reviewers in .avoozl.json."
    >
      {review.error ? (
        <ErrorText size="sm">The delivery block is invalid: {review.error}</ErrorText>
      ) : roles.length === 0 ? (
        <Box as="p" size="sm" tone="muted">No reviewer roles. Checks alone verify a delivery.</Box>
      ) : (
        <>
          <Hint>
            {own ? 'Set for this repository.' : 'The workspace roles.'} Writer model {review.writerModel ?? 'not named'}.
          </Hint>
          <Roles roles={roles} />
        </>
      )}
    </FormSection>
  )
}

// The check names GitHub shows for this repository, one checkbox each;
// saved names it no longer shows are kept and marked. Without GitHub, a
// text box.
function ChecksEditor(props: {
  id: string
  value: string
  inspect: RepositoryInspect | null
  repository: string
  onChange: (value: string) => void
}) {
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
        <Box as="p" size="xs" tone="muted" data-checks-why>
          {!named
            ? 'Name the repository as owner/name under Mode, and Avoozl lists the checks GitHub runs there.'
            : `${props.inspect?.checksError ?? props.inspect?.error ?? 'GitHub could not be read.'} Type the names instead.`}{' '}
          Names are exact and case-sensitive, separated by commas.
        </Box>
        <Text id={`${props.id}-checks`} label="Required checks" raw="requiredChecks" rule={{ required: false, blank: 'blank: no check is required' }} placeholder="build, lint" width="lg" value={props.value} onChange={props.onChange} />
      </Stack>
    )
  if (!props.inspect)
    return (
      <Stack gap={2} data-checks="reading">
        <Box as="p" size="xs" tone="muted">Reading the checks GitHub runs on {props.repository}…</Box>
      </Stack>
    )
  const url = checks?.url ?? `https://github.com/${props.repository}/settings/rules`
  return (
    <Stack gap={3} data-checks="listed">
      <Box as="p" size="xs" tone="muted">
        Seen on {checks!.branch}&apos;s recent commits and open pull requests. Checks the branch rule requires stay on; Avoozl&apos;s list adds to
        them.{' '}
        <TextLink href={linkHref(url)} target="_blank" rel="noopener noreferrer">
          Change the branch rule on GitHub
        </TextLink>
      </Box>
      {rows.length === 0 ? (
        <Box as="p" size="sm" tone="muted">GitHub shows no checks on {checks!.branch} or its open pull requests yet. Add a name below.</Box>
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
              <Box id={`${props.id}-check-${row.name}`} as="span" pl="5" size="xs" tone="muted">
                {row.where}
              </Box>
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

function ReviewRule(props: { inspect: RepositoryInspect | null; repository: string; deprecated: boolean; onDropDeprecated: () => void; approvals: string }) {
  const rule = props.inspect?.reviewRule
  const link = rule?.url ?? (props.repository ? `https://github.com/${props.repository}/settings/rules` : null)
  return (
    <Box flex flexCol gap="2" size="sm">
      <p>{reviewRuleText(props.inspect)}</p>
      {link && (
        <a href={linkHref(link)} target="_blank" rel="noreferrer" className="self-start text-xs underline">
          Change it on GitHub
        </a>
      )}
      {props.deprecated && (
        <div className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          <Badge>deprecated</Badge>
          <Box as="span" tone="muted">
            .avoozl.json still sets <code>pullRequestReviews</code>
            {props.approvals ? ` (${props.approvals} approvals)` : ''}. It counts only when GitHub&apos;s rule can&apos;t be read
            or names no count.
          </Box>
          <Box as="span" ml="auto">
            <DangerBtn
              confirm={{
                title: 'Remove pullRequestReviews from .avoozl.json?',
                body: "Once you save, Avoozl counts only GitHub's own review rule. If GitHub's rule can't be read, no approval count applies.",
                action: 'Remove',
              }}
              onConfirm={props.onDropDeprecated}
            >
              Remove the old setting
            </DangerBtn>
          </Box>
        </div>
      )}
    </Box>
  )
}

// Private mirror (RC24.1): crews work a private copy of a public repository.
function MirrorBox(props: { id: string; mirror: MirrorForm; onChange: (mirror: MirrorForm) => void }) {
  const { mirror, id } = props
  const set = (change: Partial<MirrorForm>) => props.onChange({ ...mirror, ...change })
  return (
    <FormSection title="Private mirror" blurb="Crews work in a private copy. The mirror must be private. Leave both names blank for none.">
      <div style={grid()}>
        <Text id={`${id}-source`} label="Public repository" raw="mirror.source" placeholder="owner/name" value={mirror.source} onChange={(value) => set({ source: value })} />
        <Text id={`${id}-mirror`} label="Private mirror" raw="mirror.mirror" placeholder="owner/name-private" value={mirror.mirror} onChange={(value) => set({ mirror: value })} />
        <Choice id={`${id}-forward`} label="Forward mode" raw="mirror.forward" rule={{ required: false, blank: MIRROR_DEFAULT_TEXT.forward }} value={mirror.forward} options={[...MIRROR_FORWARD_MODES]} none="Default (nudge)" onChange={(value) => set({ forward: value })} />
        <Choice id={`${id}-target`} label="Forward target" raw="mirror.forwardTarget" rule={{ required: false, blank: MIRROR_DEFAULT_TEXT.forwardTarget }} value={mirror.forwardTarget} options={[...MIRROR_FORWARD_TARGETS]} none="Default (each)" onChange={(value) => set({ forwardTarget: value })} />
        <Text id={`${id}-public-branch`} label="Public branch" raw="mirror.publicBranch" placeholder="needed for the branch target" value={mirror.publicBranch} onChange={(value) => set({ publicBranch: value })} />
      </div>
      <Box as="p" size="xs" tone="muted">each: one public pull request per merged change. branch: the same, into the public branch. batch: one public pull request when the epic is done. An epic's tasks.md front-matter can set its own forwardTarget and publicBranch.</Box>
      <Fold id={`${id}-more`} title="Advanced: mirror">
        <div style={grid()}>
          <Text id={`${id}-forward-to`} label="Forward to" raw="mirror.forwardTo" placeholder="source or fork:owner/name" value={mirror.forwardTo} onChange={(value) => set({ forwardTo: value })} />
          <Text id={`${id}-prefix`} label="Branch prefix" raw="mirror.branchPrefix" placeholder="avoozl/" value={mirror.branchPrefix} onChange={(value) => set({ branchPrefix: value })} />
          <Text id={`${id}-plans-branch`} label="Private specs branch" raw="mirror.plansBranch" placeholder="avoozl-plans" value={mirror.plansBranch} onChange={(value) => set({ plansBranch: value })} />
          <Text id={`${id}-max-bytes`} label="Largest forwarded file (bytes)" raw="mirror.forwardMaxFileBytes" placeholder={MIRROR_DEFAULT_TEXT.forwardMaxFileBytes} value={mirror.forwardMaxFileBytes} onChange={(value) => set({ forwardMaxFileBytes: value })} />
          <Text id={`${id}-exclude`} label="Never forward these paths" raw="mirror.forwardExclude" placeholder={MIRROR_DEFAULT_TEXT.forwardExclude} value={mirror.forwardExclude} onChange={(value) => set({ forwardExclude: value })} />
          <Text id={`${id}-allow`} label="Forward these paths anyway" raw="mirror.forwardAllow" placeholder={MIRROR_DEFAULT_TEXT.forwardAllow} value={mirror.forwardAllow} onChange={(value) => set({ forwardAllow: value })} />
          <Text id={`${id}-trusted`} label="Trusted persons" raw="mirror.trustedPersons" placeholder="login, login" value={mirror.trustedPersons} onChange={(value) => set({ trustedPersons: value })} />
        </div>
        <CheckRow label="Squash into one commit" help="On by default." raw="mirror.squash" checked={mirror.squash} onChange={(squash) => set({ squash })} />
      </Fold>
    </FormSection>
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
  // A Workflow map value that lives on Settings › Issue Radar.
  onOpenRadar?: (jump: RadarJump) => void
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
    if (!pending || pending.tab === 'radar' || tab !== pending.tab) return
    setPending(null)
    focusField(id, pending)
  }, [pending, tab, id])
  const set = (change: Partial<RepositoryForm>) => props.onChange({ ...repository, ...change })
  const setRule = (at: number, rule: RuleForm) =>
    set({ rules: repository.rules.map((item, index) => (index === at ? rule : item)) })
  const name = repository.name.trim()
  // The older workspace delivery.ship, which a repository that sets no
  // landing.autoMerge follows (§4.25); read only on the Landing tab.
  const [inheritedShip, setInheritedShip] = useState<string | null>(null)
  useEffect(() => {
    if (tab !== 'landing') return
    let live = true
    api
      .post<{ result: DeliveryRead }>(COMMAND_PATH, { operation: 'delivery.settings.get', input: {}, workspaceId: props.workspaceId })
      .then(
        (reply) => live && setInheritedShip(reply.result?.delivery?.ship ?? null),
        () => live && setInheritedShip(null),
      )
    return () => {
      live = false
    }
  }, [tab, api, props.workspaceId])
  // GitHub's rules and checks, read only when the Landing tab needs them.
  useEffect(() => {
    setInspect(null)
    if (tab !== 'landing' || !/^[\w.-]+\/[\w.-]+$/.test(name)) return
    let live = true
    inspectRepository(props.workspaceId, name, repository.baseBranch).then(
      (value) => live && setInspect(value),
      (caught: unknown) =>
        live && setInspect({ repository: name, branch: null, reviewRule: null, checks: null, error: errorMessage(caught) }),
    )
    return () => {
      live = false
    }
  }, [tab, name, repository.baseBranch, props.workspaceId, inspectRepository])
  // Fragments: its sections are siblings of the dialog's own, so the shared
  // FormSection rule draws the line between them.
  return (
    <>
      {tab === 'general' && (
        <FormSection title="GitHub repository" blurb={REPOSITORY_BLURBS.general}>
          <Box as="p" size="xs" tone="muted">
            Workspace mode: <span className="font-medium" style={{ color: 'var(--text)' }}>{MODE_TITLES[modeKey(props.mode)]}</span>. It follows from each repository&apos;s role in Repository setup.
          </Box>
          <div style={grid()}>
            <Text id={`${id}-name`} label="Repository" raw="key" rule={REPOSITORY_FIELD_RULES.name} placeholder="owner/name" value={repository.name} onChange={(value) => set({ name: value })} />
          </div>
        </FormSection>
      )}
      {tab === 'landing' && (
        <>
          <FormSection title="Where tasks land" blurb={REPOSITORY_BLURBS.landing}>
            <div style={grid()}>
              <Text id={`${id}-base`} label="Default branch" raw="baseBranch" rule={REPOSITORY_FIELD_RULES.baseBranch} placeholder="main" width="md" value={repository.baseBranch} onChange={(value) => set({ baseBranch: value })} />
              <Text id={`${id}-release-capacity`} label="Release N" raw="release.capacity" rule={REPOSITORY_FIELD_RULES.releaseCapacity} help={RELEASE_N_HELP} placeholder="no limit" type="number" width="sm" value={repository.releaseCapacity} onChange={(value) => set({ releaseCapacity: value })} />
            </div>
          </FormSection>
          <FormSection title={CREW_PART_TEXT.merge.title} blurb={CREW_PART_TEXT.merge.blurb}>
            <div style={grid()}>
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
            </div>
            <AutoMergeFields id={id} repository={repository} set={set} inherited={inheritedShip} />
          </FormSection>
          <FormSection title="Merge method" blurb="How a pull request merges when auto-merge is armed.">
            <MergeMethodFields id={id} repository={repository} set={set} />
          </FormSection>
          <FormSection title={CREW_PART_TEXT.conflicts.title} blurb={CREW_PART_TEXT.conflicts.blurb}>
            <ConflictFields id={id} repository={repository} set={set} />
          </FormSection>
          <FormSection title="Required checks" blurb={REPOSITORY_BLURBS.checks}>
            <ChecksEditor id={id} value={repository.requiredChecks} inspect={inspect} repository={name} onChange={(value) => set({ requiredChecks: value })} />
          </FormSection>
          <FormSection title="Pull-request reviews" blurb={REPOSITORY_BLURBS.reviews}>
            <ReviewRule
              inspect={inspect}
              repository={name}
              deprecated={repository.pullRequestReviews}
              approvals={repository.reviewApprovals}
              onDropDeprecated={() => set({ pullRequestReviews: false, reviewApprovals: '' })}
            />
          </FormSection>
          <ReviewRoles review={props.review} repository={name} />
        </>
      )}
      {tab === 'github' && (
        <>
          <FormSection title="Sync" blurb="How long Avoozl keeps GitHub's answers about this repository before it asks again.">
            <div style={grid()}>
              <Text id={`${id}-cache`} label="Keep GitHub answers (seconds)" raw="cacheSeconds" rule={REPOSITORY_FIELD_RULES.cacheSeconds} placeholder="workspace value" type="number" width="sm" value={repository.cacheSeconds} onChange={(value) => set({ cacheSeconds: value })} />
            </div>
          </FormSection>
          <FormSection title="Label rules" blurb={REPOSITORY_BLURBS.github}>
            {repository.rules.length === 0 && (
              <Box as="p" flex flexWrap items="center" gapX="3" gapY="1" size="sm" tone="muted">
                <span>No rules yet, so labels start nothing. Add one to let a label start work.</span>
                <AskForHelp
                  workspaceId={props.workspaceId}
                  help={{
                    page: 'Settings › Repository setup › Edit › GitHub',
                    section: 'Label rules',
                    says: 'No rules yet, so labels start nothing. Add one to let a label start work.',
                    settings: [
                      { key: 'mode', value: props.mode },
                      { key: 'rules', value: 'none' },
                    ],
                    docs: 'README.md, section Deliver through GitHub',
                  }}
                />
              </Box>
            )}
            {repository.rules.map((rule, index) => (
              <RuleEditor
                key={index}
                id={`${id}-rule-${index}`}
                rule={rule}
                actions={choices.actions}
                repository={name}
                workspaceId={props.workspaceId}
                onChange={(next) => setRule(index, next)}
                onRemove={() => set({ rules: repository.rules.filter((_, at) => at !== index) })}
              />
            ))}
            <div>
              <Btn onClick={() => set({ rules: [...repository.rules, emptyRule()] })}>Add rule</Btn>
            </div>
          </FormSection>
          <FormSection
            title="Managed labels"
            blurb="Labels Avoozl itself adds and removes on issues to show their state. Don't edit them by hand: a hand edit shows as a conflict."
          >
            <div style={grid(200)}>
              {/* Ready is edited with Avoozl's other labels in Crews and rules. */}
              {choices.managedLabels.filter((key) => key !== 'ready').map((key) => (
                <Text
                  key={key}
                  id={`${id}-label-${key}`}
                  label={MANAGED_LABEL_TEXT[key] ?? key}
                  raw={`managedLabels.${key}`}
                  rule={REPOSITORY_FIELD_RULES[key]}
                  value={repository.managedLabels[key] ?? ''}
                  onChange={(value) => set({ managedLabels: { ...repository.managedLabels, [key]: value } })}
                />
              ))}
            </div>
          </FormSection>
          <UntriagedSettings
            id={id}
            value={repository.untriaged}
            repository={name}
            workspaceId={props.workspaceId}
            onChange={(untriaged) => set({ untriaged })}
          />
          <FormSection
            title="Who counts"
            blurb="GitHub still decides who has access. This sets how much GitHub permission a person needs for a label, a board drag or a close to count."
          >
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
          </FormSection>
          <FormSection title="Priority" blurb="Ready tasks carrying a higher label here start first.">
            <Text id={`${id}-priority`} label="Priority labels, highest first" raw="priority" rule={{ required: false, blank: 'blank: graph order only' }} placeholder="p0, p1, p2" width="lg" value={repository.priority} onChange={(value) => set({ priority: value })} />
          </FormSection>
        </>
      )}
      {tab === 'mirror' && <MirrorBox id={`${id}-mirror`} mirror={repository.mirror} onChange={(mirror) => set({ mirror })} />}
      {tab === 'map' && (
        <FormSection title="Workflow map" blurb={REPOSITORY_BLURBS.map}>
          <WorkflowMap
            workspaceId={props.workspaceId}
            mode={props.mode}
            repository={repository}
            planningRepository={props.planningRepository}
            onJump={(jump) => {
              if (jump.tab === 'radar') return props.onOpenRadar?.({ repository: name, field: jump.field })
              props.onTab(jump.tab)
              setPending(jump)
            }}
          />
        </FormSection>
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
  // The file's own mode when the roles disagree (R105.8).
  rolesNote?: string | null
  onOpenRadar?: (jump: RadarJump) => void
}) {
  const { form, choices, rolesNote } = props
  const api = useAppApi()
  const workspaces = useMemo(() => workspaceClient(api), [api])
  const reveal = useReveal()
  const loadCheckouts = useCallback((id: string) => workspaces.repositories(id), [workspaces])
  const { value: checkouts, reload } = useRead<Repository[]>(props.workspaceId, loadCheckouts)
  const rows = repositoryRows(checkouts ?? [], form.repositories, form.mode === 'plans-repo' ? form.planningRepository : '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const addBox = useRef<HTMLDivElement>(null)
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
      const failure = await props.onCommit((current) => withRepositoryEdit(current, { github: role.github, branch: role.branch, policy: -1 }, { entry: null, role: role.role, source: role.source }))
      if (failure) return setMessage({ ok: false, text: `Added ${id}, but its role was not saved. ${failure}` })
    }
    setMessage({ ok: true, text: `Added ${id}.` })
  }
  // The repository's own settings, inside its Edit dialog, on its open tab:
  // the editor, or what a local or settings-less repository has instead.
  const settingsFor = (row: RepositoryRow, view: { entry: RepositoryForm | null; setEntry: (entry: RepositoryForm) => void; tab: EditTab; setTab: (tab: EditTab) => void }): EditSettings => {
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
            onOpenRadar={props.onOpenRadar}
          />
        ),
      }
    if (row.github)
      return {
        tabs: [],
        body: tab === 'general' && (
          <FormSection title="Settings" blurb={`${row.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`}>
            <IconLabel icon={Plus} tooltip="Add an entry you can change; written when you press Save" onClick={() => setEntry({ ...emptyRepository(row.github!), baseBranch: row.branch })}>
              Add GitHub settings for {row.github}
            </IconLabel>
          </FormSection>
        ),
      }
    return {
      tabs: ['landing'],
      body: tab === 'landing' && (
        <FormSection title="Checks" blurb="A local-only repository: no GitHub remote, so the GitHub settings do not apply.">
          <Box as="p" size="sm" data-local-checks>
            Required checks apply only to GitHub pull requests. Here Avoozl runs each task&apos;s own checks from its facts in tasks.md, or this
            repository&apos;s checks when a task names none.
          </Box>
        </FormSection>
      ),
    }
  }
  return (
    <Box flex flexCol gap="3.5">
      <Card>
        <Section title={`Added repositories (${rows.length})`} blurb={REPOSITORIES_LINE}>
          {checkouts === null ? (
            <Box as="p" size="sm" tone="muted">Loading…</Box>
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
              onAdd={() => addBox.current?.querySelector('input')?.focus()}
            />
          )}
          {message && (
            <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-muted' : 'text-danger'}`}>
              {message.text}
            </p>
          )}
          {offer && message?.ok && (
            <Box mt="2" data-setup-offer>
              <IconLabel icon={Workflow} primary disabled={Boolean(setupBlocked)} tooltip={setupBlocked ?? 'Choose its mode, set up GitHub and import its specs. Nothing is written before Set up.'} onClick={() => setSetupFolder(offer)}>
                Set up GitHub and import specs
              </IconLabel>
            </Box>
          )}
          {rows.length > 0 && (
            <Box as="p" mt="2" size="sm" data-tasks-live>
              {tasksLiveLine(form.mode, form.planningRepository)}
            </Box>
          )}
          {rolesNote && (
            <Box as="p" mt="1" size="xs" tone="muted" data-roles-note>
              {rolesNote}
            </Box>
          )}
          <Box mt="2">
            <RoleHelp />
          </Box>
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
      <Card>
        <div ref={addBox}>
          <AddRepository
            workspaceId={props.workspaceId}
            mode={modeKey(form.mode)}
            disabled={props.dirty ? 'Save or discard your settings changes first: adding a repository writes .avoozl.json.' : null}
            onAdded={(id, role) => void added(id, role)}
          />
        </div>
      </Card>
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
      <FormSection title="Local only" blurb="Avoozl codes, checks and merges here on this Mac.">
        {props.kept && <Box as="p" size="xs" tone="muted">Its GitHub settings are kept, not used. They apply again if a repository gets a GitHub role.</Box>}
      </FormSection>
    )
  if (tab === 'landing')
    return (
      <>
        <FormSection title="Where tasks land">
          <dl className="grid gap-x-3 gap-y-1 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }}>
            <Box as="dt" tone="muted">Landing branch</Box>
            <dd>
              <code>{row.branch}</code>
            </dd>
          </dl>
          <Box as="p" size="sm" data-local-checks>
            Avoozl runs each task&apos;s own checks from its facts in tasks.md, or this repository&apos;s checks when a task names none.
          </Box>
        </FormSection>
        <ReviewRoles review={props.review} repository={row.github ?? row.name} />
      </>
    )
  if (tab === 'map')
    return (
      <FormSection title="Workflow map" blurb={REPOSITORY_BLURBS.map}>
        <WorkflowMap workspaceId={props.workspaceId} mode="local" repository={{ ...emptyRepository(row.name), baseBranch: row.branch }} />
      </FormSection>
    )
  return null
}

// The GitHub settings that belong to the whole workspace, on the GitHub page:
// what no single repository's role can say. One tab per group, the open one
// in the address (?github=<tab>); the page's one Save bar writes them all,
// and a tab with unsaved changes shows a dot. Switching a role never
// deletes a stored setting.
export const GITHUB_TABS = [
  { key: 'issues', label: 'New tasks' },
  { key: 'sync', label: 'Sync pace' },
  { key: 'project', label: 'Project' },
  { key: 'setup', label: 'Set up GitHub' },
  { key: 'calls', label: 'GitHub calls' },
] as const
export type GitHubTab = (typeof GITHUB_TABS)[number]['key']
const GITHUB_TAB_KEYS = GITHUB_TABS.map((tab) => tab.key)
// The form keys each tab edits; Set up and GitHub calls edit none.
export const GITHUB_TAB_FIELDS: Record<GitHubTab, readonly (keyof SettingsForm)[]> = {
  issues: ['defaultAuthority', 'epicIssueType', 'maxPerParent', 'includeDone'],
  sync: ['cacheSeconds', 'writesPerMinute', 'writesPerHour'],
  project: ['projectOwner', 'projectNumber', 'fields', 'statusValues'],
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
  const { form, choices, set } = props
  const [tab, pick] = useTabParam<GitHubTab>('github', GITHUB_TAB_KEYS, 'issues', 'Back to the last GitHub tab')
  const shown = visibleSettings(form.mode)
  const kept = unusedInLocal(form)
  if (!isGitHubMode(form.mode))
    return (
      <>
        <Card>
          <Section title="GitHub settings" blurb="They apply once a repository has a GitHub role in Repository setup.">
            <Box flex flexCol gap="1.5" size="sm" data-local-note>
              <p>{LOCAL_HIDDEN_LINE}</p>
              <Box as="p" size="xs" tone="muted">
                Folders, landing branches and checks are under Repository setup. Worker and reviewer chats come from delivery in .avoozl.json.
              </Box>
              {kept.length > 0 && <Box as="p" size="xs" tone="muted" data-kept>Kept, not used: {kept.join(', ')}. Give a repository a GitHub role to use them again.</Box>}
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
            <Section title="New tasks and issues" blurb="Who owns a new task, and how its GitHub issue is made. For every repository in this workspace.">
              <div style={grid()}>
                <Choice
                  id="avoozl-settings-authority"
                  label="New tasks belong to"
                  raw="defaultAuthority"
                  rule={{ required: false, blank: form.mode ? 'blank: github' : 'blank: local' }}
                  value={form.defaultAuthority}
                  options={choices.authorities}
                  none={`Default: ${form.mode ? 'github' : 'local'}`}
                  width="md"
                  onChange={(value) => set({ defaultAuthority: value })}
                />
                <Text id="avoozl-settings-epic" label="Epic issue type" raw="epicIssueType" rule={{ required: false, blank: 'blank: epics get no issue type' }} placeholder="Epic" width="md" value={form.epicIssueType} onChange={(value) => set({ epicIssueType: value })} />
                {shown.has('subIssueCap') && (
                  <Text id="avoozl-settings-sub-issues" label="Sub-issues per parent" raw="subIssues.maxPerParent" rule={{ required: false, blank: SUB_ISSUE_LINE }} placeholder="100" type="number" width="sm" value={form.maxPerParent} onChange={(value) => set({ maxPerParent: value })} />
                )}
              </div>
              <CheckRow label="Make issues for tasks already done when a spec is approved" help="Off: only open tasks get issues." raw="issues.includeDone" checked={form.includeDone} onChange={(includeDone) => set({ includeDone })} />
            </Section>
          </Card>
        )}
        {tab === 'sync' && (
          <Card>
            <Section title="Sync pace" blurb="How long Avoozl keeps GitHub's answers, and how fast it writes. Every write from the app, CLI and tick shares these limits.">
              <div style={grid()}>
                <Text id="avoozl-settings-cache" label="Keep GitHub answers (seconds)" raw="cacheSeconds" rule={{ required: false, blank: 'blank: 60. 0 turns the cache off' }} placeholder="60" type="number" width="sm" value={form.cacheSeconds} onChange={(value) => set({ cacheSeconds: value })} />
                <Text id="avoozl-settings-writes-minute" label="GitHub writes a minute" raw="writesPerMinute" rule={{ required: false, blank: 'blank: 60. At most 80' }} placeholder="60" type="number" width="sm" value={form.writesPerMinute} onChange={(value) => set({ writesPerMinute: value })} />
                <Text id="avoozl-settings-writes-hour" label="GitHub writes an hour" raw="writesPerHour" rule={{ required: false, blank: 'blank: 400. At most 500' }} placeholder="400" type="number" width="sm" value={form.writesPerHour} onChange={(value) => set({ writesPerHour: value })} />
              </div>
            </Section>
          </Card>
        )}
        {tab === 'project' && (
          <Card>
            <ProjectFields form={form} choices={choices} set={set} />
          </Card>
        )}
        {tab === 'setup' && (
          <Card>
            <Section title="Set up GitHub" blurb="Creates the labels, Project and fields the other tabs name. It reads GitHub first and shows every write before making one.">
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
                <Box as="p" size="sm" tone="muted" data-empty="github-calls">
                  No GitHub calls recorded yet. They show here after the next sync.
                </Box>
              </Section>
            </Card>
          ))}
      </TabPanel>
    </Box>
  )
}

// A jump from the Workflow map to a field on Settings › Issue Radar. Kept
// here until the page opens, so the page can pick the repository and focus it.
export interface RadarJump {
  repository: string
  field: JumpField
}
let radarJump: RadarJump | null = null

// Settings › Issue Radar: what Avoozl and Issue Radar crews share, for one
// repository at a time. It edits the same form as the GitHub page, so the
// one Save bar writes it. The labels Radar writes are read, never
// written: only the person enters them in Issue Radar.
function RadarSettings(props: { form: SettingsForm; settings: GitHubSettings; workspaceId: string; set: (change: Partial<SettingsForm>) => void }) {
  const { form, settings, set } = props
  const names = form.repositories.map((r) => r.name.trim())
  const [picked, setPicked] = useState(() => (radarJump && names.includes(radarJump.repository) ? radarJump.repository : (names[0] ?? '')))
  const field = useRef(radarJump?.field ?? null)
  radarJump = null
  const index = Math.max(0, names.indexOf(picked))
  const repository = form.repositories[index]
  const id = `avoozl-settings-repo-${index}`
  useEffect(() => {
    if (!field.current) return
    const jump: Jump = { tab: 'radar', field: field.current }
    field.current = null
    focusField(id, jump)
  }, [id])
  if (!isGitHubMode(form.mode) || !repository)
    return (
      <Card>
        <Section title="Issue Radar" blurb="Issue Radar crews work GitHub issues and can hand one to Avoozl. These settings apply once a repository has a GitHub role in Repository setup.">
          {null}
        </Section>
      </Card>
    )
  const setRepository = (change: Partial<RepositoryForm>) => set({ repositories: form.repositories.map((entry, at) => (at === index ? { ...entry, ...change } : entry)) })
  const part = { id, repository, set: setRepository }
  return (
    <Box flex flexCol gap="3.5" data-radar-settings>
      {names.length > 1 && (
        <Card>
          <Section title="Repository" blurb="Each repository has its own Issue Radar settings. Pick the one to edit.">
            <Box as="label" flex flexWrap items="center" gap="2" size="sm" htmlFor="avoozl-radar-repository">
              Repository
              <SelectField id="avoozl-radar-repository" value={names[index]} onChange={(event) => setPicked(event.target.value)} look="plain">
                {names.map((name, at) => (
                  <option key={`${name}-${at}`} value={name}>
                    {name || '(no name yet)'}
                  </option>
                ))}
              </SelectField>
            </Box>
          </Section>
        </Card>
      )}
      <Card>
        <Section title="Handoff to Avoozl" blurb={`${AVOOZL_LABELS_LINE} ${OLD_LABEL_NOTE}`}>
          <AvoozlLabelFields {...part} note={false} />
        </Section>
      </Card>
      <Card>
        <Section title="Labels Radar uses" blurb={RADAR_LABELS_BLURB}>
          <div style={grid(200)}>
            {settings.choices.crewLabels.map((key) => (
              <Text
                key={key}
                id={`${id}-crew-${key}`}
                label={CREW_LABELS[key] ?? key}
                raw={`crewLabels.${key}`}
                rule={{ required: false, blank: "blank: Issue Radar's default" }}
                value={repository.crewLabels[key] ?? ''}
                onChange={(value) => setRepository({ crewLabels: { ...repository.crewLabels, [key]: value } })}
              />
            ))}
          </div>
        </Section>
      </Card>
      <Card>
        <Section title="Crew review rules" blurb={CREW_PART_TEXT.rules.blurb}>
          <ReviewRulesFields {...part} />
        </Section>
      </Card>
    </Box>
  )
}

// The Project board Avoozl adds issues to and fills. One Project serves
// every repository in the workspace.
export function ProjectFields({ form, choices, set }: { form: SettingsForm; choices: SettingsChoices; set: (change: Partial<SettingsForm>) => void }) {
  return (
    <div>
      <Section
        title="Project fields"
        blurb="The GitHub Project board Avoozl adds managed issues to and fills with Release, Wave and Avoozl state. People move Status; Avoozl never writes it. Leave every field blank to turn Project sync off."
      >
        <div style={grid(180)}>
          <Text id="avoozl-settings-project-owner" label="Owner" raw="project.owner" rule={PROJECT_FIELD_RULES.owner} placeholder="org or user" width="md" value={form.projectOwner} onChange={(value) => set({ projectOwner: value })} />
          <Text id="avoozl-settings-project-number" label="Number" raw="project.number" rule={PROJECT_FIELD_RULES.number} placeholder="2" type="number" width="md" value={form.projectNumber} onChange={(value) => set({ projectNumber: value })} />
        </div>
        {choices.fields.length > 0 && (
        <Section level="sub" title="Field names" blurb="The names of the Project's fields Avoozl fills. Blank uses the name shown.">
        <div style={grid(180)}>
          {choices.fields.map((key) => (
            <Text
              key={key}
              id={`avoozl-settings-field-${key}`}
              label={FIELD_LABELS[key] ?? key}
              raw={`project.fields.${key}`}
              rule={PROJECT_FIELD_RULES[key]}
              placeholder={PROJECT_DEFAULTS[key] || 'none'}
              value={form.fields[key] ?? ''}
              onChange={(value) => set({ fields: { ...form.fields, [key]: value } })}
            />
          ))}
        </div>
        </Section>
        )}
        {choices.statusValues.length > 0 && (
        <Section level="sub" title="Status options" blurb="The Status options Avoozl reads. Blank uses the name shown.">
        <div style={grid(180)}>
          {choices.statusValues.map((key) => (
            <Text
              key={key}
              id={`avoozl-settings-status-${key}`}
              label={STATUS_LABELS[key] ?? key}
              raw={`project.statusValues.${key}`}
              rule={PROJECT_FIELD_RULES[key]}
              placeholder={PROJECT_DEFAULTS[key]}
              value={form.statusValues[key] ?? ''}
              onChange={(value) => set({ statusValues: { ...form.statusValues, [key]: value } })}
            />
          ))}
        </div>
        </Section>
        )}
      </Section>
    </div>
  )
}

// What Set up GitHub takes from the form above it, so each setting has one
// place: the mode, planning repository, repositories and Project.
function sharedSetup(form: SettingsForm) {
  return {
    mode: form.mode,
    planningRepository: form.planningRepository,
    repositories: form.repositories.map((r) => r.name.trim()).filter(Boolean).join(', '),
    projectOwner: form.projectOwner,
    projectNumber: form.projectNumber,
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
  if (!settings || !form || !choices) return <Box as="p" size="sm" tone="muted">{busy ? 'Loading…' : 'Not loaded'}</Box>
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
          rolesNote={settings.rolesNote}
          onOpenRadar={(jump) => {
            radarJump = jump
            props.onTab?.('radar')
          }}
        />
      ) : tab === 'radar' ? (
        <RadarSettings form={form} settings={settings} workspaceId={workspaceId} set={set} />
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

function SettingsBody(props: { tab: SettingsTab; workspaceId: string | null; onTab: (tab: SettingsTab) => void } & Pick<Parameters<typeof SettingsView>[0], 'onSelectWorkspace' | 'onListChange' | 'onOpenPlans'>) {
  const { tab, workspaceId } = props
  if (tab === 'workspaces')
    return (
      <Box flex flexCol gap="3.5">
        <WorkspaceView selected={workspaceId} onSelect={props.onSelectWorkspace} onListChange={props.onListChange} />
        <ThisComputer workspaceId={workspaceId} />
        <ApiKeySettings workspaceId={workspaceId} />
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
      <Section title="GitHub calls" blurb="The last rate-limit numbers GitHub sent, and the calls of the last hour by source. Calls count against the limit; 304s and cached answers do not.">
        {lines.length > 0 && (
          <Box flex flexCol gap="1" size="xs" tone="muted" data-github-rate>
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </Box>
        )}
        {rows.length > 0 && (
          <>
            <Box as="p" size="xs" tone="muted">{rate?.hourCalls ?? 0} calls in the last hour. Click a heading to sort.</Box>
            <UsageTable rows={rows} />
          </>
        )}
      </Section>
    </Card>
  )
}

const CELL: CSSProperties = { padding: '4px 8px' }
const NUM: CSSProperties = { ...CELL, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
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
    <div style={{ overflowX: 'auto' }}>
      <table data-github-usage style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {USAGE_COLUMNS.map((col) => {
              const on = sort.key === col.key
              const right = col.key !== 'source'
              return (
                <th key={col.key} scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ textAlign: right ? 'right' : 'left', padding: '4px 8px', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
                  <button type="button" data-sort={col.key} className="inline-flex items-center gap-1 font-medium" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }} onClick={() => setSort(nextUsageSort(sort, col.key))}>
                    {col.label}
                    <Box aria-hidden="true" as="span" size="xs" tone="muted">{on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</Box>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.source} data-usage-source={row.source}>
              <td style={CELL}>{row.source}</td>
              <td style={NUM}>{row.calls}</td>
              <td style={NUM}>{row.notModified}</td>
              <td style={NUM}>{row.cached}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <Box as="p" size="sm" tone="muted" data-blurb={section.key}>
        {SETTINGS_BLURBS[section.key]}
      </Box>
      <TabBoundary key={section.key} label={section.label}>
        <SettingsBody tab={section.key} workspaceId={workspaceId} onTab={pick} onSelectWorkspace={props.onSelectWorkspace} onListChange={props.onListChange} onOpenPlans={props.onOpenPlans} />
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
