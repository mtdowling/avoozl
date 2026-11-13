import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, EmptyState, Input, SegmentedControl } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { ModePicker } from './ModePicker.tsx'
import {
  type CrewScope,
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
  isGitHubMode,
  modeKey,
  unusedInLocal,
  visibleSettings,
  SETTINGS_HOME,
} from './settings-api.ts'
import { CoderPicker } from './CoderPicker.tsx'
import SetupWizard from './SetupWizard.tsx'
import WorkspaceView from './WorkspaceView.tsx'
import Onboard from './Onboard.tsx'
import { AddRepository, REPOSITORIES_LINE, RepositoryDialog, RepositoryList, repositoryRows, useReveal, type RepositoryRow } from './RepositoriesSettings.tsx'
import PluginsSettings from './PluginsSettings.tsx'
import ContentRulesSettings from './ContentRulesSettings.tsx'
import FlowSettings from './FlowSettings.tsx'
import { BudgetSettings, PricesSettings } from './BudgetSettings.tsx'
import DeliverySettings from './DeliverySettings.tsx'
import ProvidersSettings from './ProvidersSettings.tsx'
import { useSteppedState } from './NavHistory.tsx'
import { useRead } from './useRead.ts'
import { labelsClient, triageRows, type RepositoryLabels } from './untriaged-api.ts'
import { errorMessage, workspaceClient, type Repository, type WorkspaceList } from './workspace-api.ts'
import { DangerBtn, IconLabel, SectionHeading, TipBtn, ViewHeading, dangerStyle } from './controls.tsx'
import { Plus, Trash2 } from './icons.ts'
import { linkHref } from './views-api.ts'
import { ThisComputer } from './Driver.tsx'

const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }
// Fields share a row and wrap; each keeps a readable width.
const grid = (min = 220): CSSProperties => ({
  display: 'grid',
  gap: 12,
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
  alignItems: 'start',
})
const WIDTH = { sm: '9rem', md: '18rem', lg: '28rem' } as const

export const SETTINGS_TABS = [
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'repositories', label: 'Repositories' },
  { key: 'github', label: 'Where tasks live' },
  { key: 'plugins', label: 'Plugins' },
  { key: 'content', label: 'Content rules' },
  { key: 'flow', label: 'Flow' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'prices', label: 'Prices' },
  { key: 'providers', label: 'Providers' },
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]['key']

// One short line under each Settings heading: what it controls and when
// you would change it. Each is checked against what the code does.
// The Where tasks live note in Local only, with no GitHub clause.
export const LOCAL_TAB_BLURB = 'The mode for this workspace. Save only writes .avoozl.json.'

export const SETTINGS_BLURBS: Record<SettingsTab, string> = {
  workspaces:
    'The Avoozl workspaces on this machine, each a folder with its own task database. Add one for each set of specs you keep apart.',
  repositories:
    'The code checkouts tasks change and land in, with their GitHub settings. Save only writes .avoozl.json.',
  github:
    "The mode, planning repository and Project board. Save only writes .avoozl.json; Set up GitHub creates what's missing, after showing each change.",
  plugins:
    'A plugin can bring a team’s settings pack, content rules, a tracker, an intake source or a delivery route. Each one runs or imports only after you approve it on this machine.',
  content:
    'Terms Avoozl must never write: in spec files, issues, comments, briefs and diffs. A match stops the write and asks you.',
  flow: 'How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode.',
  delivery:
    'Which agent and model write each task by default, and whether pull request feedback goes back to the writer. Crews and per-task picks are on the Routing tab.',
  budgets:
    "Each task's spending cap and what happens at it: stop new work, or only warn. Save only writes .avoozl.json.",
  prices:
    'What each model costs, so budgets can count dollars. Kept on this computer only, never in a repository.',
  providers:
    'When a provider or model counts as low or out, and the fallback models. New tasks skip low and out ones. Saved on this machine only.',
}

const REPOSITORY_TABS = [
  { key: 'mode', label: 'Mode and branch' },
  { key: 'triggers', label: 'Triggers and labels' },
  { key: 'checks', label: 'Checks' },
  { key: 'reviews', label: 'Reviews' },
] as const
type RepositoryTab = (typeof REPOSITORY_TABS)[number]['key']

export const REPOSITORY_BLURBS: Record<RepositoryTab, string> = {
  mode: 'Which repository this is, the branch pull requests merge into, and who writes the code.',
  triggers: "A rule starts its action when an allowed person's label makes an issue match its line. No label name is built in.",
  checks:
    "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
  reviews:
    "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub.",
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status field',
  release: 'Release field',
  wave: 'Wave field',
  iteration: 'Iteration field',
  avoozlState: 'Avoozl state field',
}
const CREW_LABELS: Record<string, string> = {
  claim: 'Claim label',
  needsHuman: 'Needs-human label',
}
const STATUS_LABELS: Record<string, string> = {
  todo: 'Ready option',
  inProgress: 'In progress option',
  done: 'Done option',
  deferred: 'Deferred option',
}

// "(required)" or "(optional)" in plain muted text, with the condition a
// requirement holds under. Never red or bold: a missing value says so when
// you save, not before.
export function Marker({ rule }: { rule?: FieldRule }) {
  if (!rule) return null
  return rule.required ? (
    <span className="text-xs text-muted" data-marker="required">
      (required{rule.when ? ` ${rule.when}` : ''})
    </span>
  ) : (
    <span className="text-xs text-muted" data-marker="optional">
      (optional)
    </span>
  )
}

// A label with its marker, the raw `.avoozl.json` key as small secondary
// text, and what a blank field means.
function Field(props: {
  id: string
  label: string
  raw?: string
  rule?: FieldRule
  width?: keyof typeof WIDTH
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm" style={props.width ? { maxWidth: WIDTH[props.width] } : undefined}>
      <label htmlFor={props.id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{props.label}</span>
        <Marker rule={props.rule} />
      </label>
      {props.children}
      {props.rule?.blank && <span className="text-xs text-muted">{props.rule.blank}</span>}
      {props.raw && (
        <Tooltip text=".avoozl.json key">
          <code className="text-[11px] text-muted" style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>
            {props.raw}
          </code>
        </Tooltip>
      )}
    </div>
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
  width?: keyof typeof WIDTH
  type?: string
}) {
  return (
    <Field id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width}>
      <Input
        id={props.id}
        type={props.type}
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
  width?: keyof typeof WIDTH
}) {
  return (
    <Field id={props.id} label={props.label} raw={props.raw} rule={props.rule} width={props.width}>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="rounded border px-2 py-1 text-sm"
        style={selectStyle}
      >
        <option value="">{props.none}</option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-muted">{children}</p>
}

// A heading with its one-line blurb, then the fields.
export function Section(props: { title: string; blurb?: string; actions?: ReactNode; children?: ReactNode; level?: 'card' | 'sub' }) {
  return (
    <div className="flex flex-col gap-2.5" data-section={props.title}>
      <SectionHeading level={props.level === 'sub' ? 4 : 3} title={props.title} blurb={props.blurb} actions={props.actions} />
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
    <div className="flex min-w-0 flex-col gap-1 text-sm">
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
        <span className="text-xs text-muted">{MATCH_HELP}</span>
      </Field>
      {!line && (
        <span className="text-xs text-muted">
          {untriaged
            ? 'Blank with no triage labels: every open issue and pull request counts, less rule matches and tasks.'
            : 'Type a line such as label:agent:go to see what it matches.'}
        </span>
      )}
      {failed && <span className="text-xs text-danger">The line could not be checked: {failed}</span>}
      {current?.error && (
        <span id={errorId} role="alert" className="text-xs text-danger">
          {current.error.replace(/ Same syntax as GitHub's issue search\..*$/, '').replace(/^match cannot use /, "Can't use ")}
        </span>
      )}
      {current?.parsed && (
        <div className="flex flex-wrap items-center gap-1.5" data-match-chips>
          {matchChips(current.parsed).map((group) => (
            <span key={group.kind} className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted">{CHIP_TEXT[group.kind]}</span>
              {group.values.map((value) => (
                <Badge key={value} variant={group.kind === 'none' ? undefined : 'info'}>
                  {value}
                </Badge>
              ))}
            </span>
          ))}
        </div>
      )}
      {current?.parsed && <MatchIssues preview={current} untriaged={untriaged} />}
    </div>
  )
}

function MatchIssues({ preview, untriaged = false }: { preview: MatchPreview; untriaged?: boolean }) {
  const noun = untriaged ? ['item', 'items'] : ['issue', 'issues']
  if (!preview.repository) return <span className="text-xs text-muted">Name the repository to see which open {noun[1]} match.</span>
  if (preview.searchError) return <span className="text-xs text-muted">{preview.searchError}</span>
  if (preview.total === null) return null
  const count =
    preview.total === 0
      ? `No open ${noun[0]} matches now.`
      : `${preview.total} open ${preview.total === 1 ? `${noun[0]} matches` : `${noun[1]} match`} now${untriaged ? ', before rules and tasks are left out' : ''}`
  if (!preview.issues.length) return <span className="text-xs text-muted" data-match-issues>{count}</span>
  // Closed by default, so a page of rules stays short.
  return (
    <details className="text-xs" data-match-issues>
      <summary className="cursor-pointer text-muted">
        {count}
        {preview.total > preview.issues.length ? ` (newest ${preview.issues.length})` : ''}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {preview.issues.map((issue) => (
          <li key={issue.number} className="min-w-0 truncate">
            <a href={linkHref(issue.url)} target="_blank" rel="noopener noreferrer" className="underline">
              #{issue.number}
            </a>{' '}
            <span>{issue.title}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

// Settings › Repositories › Triggers and labels › Untriaged (design §8.5):
// what the Intake tab's Untriaged filter leaves out here, and its notice.
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
    <Section
      level="sub"
      title="Untriaged"
      blurb="What the Intake tab's Untriaged filter lists for this repository: open issues and pull requests no rule, triage label or task covers."
    >
      <MatchField
        id={`${id}-untriaged-filter`}
        value={value.filter}
        repository={repository}
        workspaceId={props.workspaceId}
        onChange={(filter) => set({ filter })}
        untriaged={{ placeholder: untriagedDefault(value.triageLabels) }}
      />
      <fieldset className="flex flex-col gap-1 text-sm" data-triage-labels>
        <legend className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">Triage labels</span>
          <Marker rule={{ required: false }} />
        </legend>
        <span className="text-xs text-muted">An item with any of these counts as triaged and leaves the list.</span>
        {!named ? (
          <span className="text-xs text-muted">Name the repository as owner/name under Mode, and its labels show here.</span>
        ) : !labels ? (
          <span className="text-xs text-muted">Reading {repository}&apos;s labels…</span>
        ) : labels.error ? (
          <span className="text-xs text-muted">{labels.error}</span>
        ) : null}
        {rows.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Triage labels">
            {rows.map((row) => (
              <li key={row.name}>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={row.checked} onChange={(event) => toggle(row.name, event.target.checked)} />
                  <code>{row.name}</code>
                  {row.missing && <span className="text-xs text-muted">(not on GitHub)</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {labels?.labels && rows.length === 0 && <span className="text-xs text-muted">{repository} has no labels yet.</span>}
        <Tooltip text=".avoozl.json key">
          <code className="self-start text-[11px] text-muted" style={{ opacity: 0.8 }}>
            untriaged.triageLabels
          </code>
        </Tooltip>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
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
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={value.notify} onChange={(event) => set({ notify: event.target.checked })} />
            <span className="font-medium">Notify me when the count goes up</span>
            <Marker rule={{ required: false }} />
          </label>
          <span className="text-xs text-muted">At most one Kiro Crew notice an hour, with the counts. Off by default.</span>
          <Tooltip text=".avoozl.json key">
            <code className="self-start text-[11px] text-muted" style={{ opacity: 0.8 }}>
              untriaged.notify
            </code>
          </Tooltip>
        </div>
      </div>
    </Section>
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
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={rule.autoPublishChildren} onChange={(event) => set({ autoPublishChildren: event.target.checked })} />
          Publish a clean breakdown's sub-issues without a re-label
        </label>
        <span className="ml-auto">
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
        </span>
      </div>
    </div>
  )
}

function Roles({ roles }: { roles: ReviewRole[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1 text-sm">
      {roles.map((role) => (
        <li key={role.id}>
          <span className="font-medium">{role.id}</span>{' '}
          <span className="text-muted">
            {role.agent} · {role.model ?? 'agent default'} · distinct by {role.distinctFrom}
          </span>
          <span className="block text-xs text-muted">{role.focus}</span>
        </li>
      ))}
    </ul>
  )
}

// Reviewer roles come from `delivery.reviewers` in `.avoozl.json`; this page
// shows them and does not write them.
function ReviewRoles({ review, repository }: { review: ReviewSettings | undefined; repository: string }) {
  if (!review) return null
  const own = review.repositories[repository]
  const roles = own ?? review.reviewers
  return (
    <Section
      level="sub"
      title="Avoozl reviewer chats"
      blurb="Fresh chats that review each local delivery's exact commit before it merges. Edit them under delivery.reviewers in .avoozl.json."
    >
      {review.error ? (
        <p className="text-sm text-danger">The delivery block is invalid: {review.error}</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-muted">No reviewer roles. Checks alone verify a delivery.</p>
      ) : (
        <>
          <Hint>
            {own ? 'Set for this repository.' : 'The workspace roles.'} Writer model {review.writerModel ?? 'not named'}.
          </Hint>
          <Roles roles={roles} />
        </>
      )}
    </Section>
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
      <div className="flex flex-col gap-2" data-checks="typed">
        <p className="text-xs text-muted" data-checks-why>
          {!named
            ? 'Name the repository as owner/name under Mode, and Avoozl lists the checks GitHub runs there.'
            : `${props.inspect?.checksError ?? props.inspect?.error ?? 'GitHub could not be read.'} Type the names instead.`}{' '}
          Names are exact and case-sensitive, separated by commas.
        </p>
        <Text id={`${props.id}-checks`} label="Required checks" raw="requiredChecks" rule={{ required: false, blank: 'blank: no check is required' }} placeholder="build, lint" width="lg" value={props.value} onChange={props.onChange} />
      </div>
    )
  if (!props.inspect)
    return (
      <div className="flex flex-col gap-2" data-checks="reading">
        <p className="text-xs text-muted">Reading the checks GitHub runs on {props.repository}…</p>
      </div>
    )
  const url = checks?.url ?? `https://github.com/${props.repository}/settings/rules`
  return (
    <div className="flex flex-col gap-3" data-checks="listed">
      <p className="text-xs text-muted">
        Seen on {checks!.branch}&apos;s recent commits and open pull requests. Checks the branch rule requires stay on; Avoozl&apos;s list adds to
        them.{' '}
        <a href={linkHref(url)} target="_blank" rel="noopener noreferrer" className="underline">
          Change the branch rule on GitHub
        </a>
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">GitHub shows no checks on {checks!.branch} or its open pull requests yet. Add a name below.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Checks">
          {rows.map((row) => (
            <li key={row.name} className="flex flex-col text-sm" data-check-row={row.name}>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={row.branchRule}
                  aria-describedby={`${props.id}-check-${row.name}`}
                  onChange={(event) => props.onChange(toggleCheck(props.value, row.name, event.target.checked))}
                />
                <code>{row.name}</code>
              </label>
              <span id={`${props.id}-check-${row.name}`} className="pl-5 text-xs text-muted">
                {row.where}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Text id={`${props.id}-check-extra`} label="Add another name" placeholder="a check not run yet" width="md" value={extra} onChange={setExtra} />
        <TipBtn tooltip="Add this exact, case-sensitive check name to the list" onClick={add} disabled={!extra.trim()}>
          Add
        </TipBtn>
      </div>
    </div>
  )
}

function ReviewRule(props: { inspect: RepositoryInspect | null; repository: string; deprecated: boolean; onDropDeprecated: () => void; approvals: string }) {
  const rule = props.inspect?.reviewRule
  const link = rule?.url ?? (props.repository ? `https://github.com/${props.repository}/settings/rules` : null)
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{reviewRuleText(props.inspect)}</p>
      {link && (
        <a href={linkHref(link)} target="_blank" rel="noreferrer" className="self-start text-xs underline">
          Change it on GitHub
        </a>
      )}
      {props.deprecated && (
        <div className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          <Badge>deprecated</Badge>
          <span className="text-muted">
            .avoozl.json still sets <code>pullRequestReviews</code>
            {props.approvals ? ` (${props.approvals} approvals)` : ''}. It counts only when GitHub&apos;s rule can&apos;t be read
            or names no count.
          </span>
          <span className="ml-auto">
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
          </span>
        </div>
      )}
    </div>
  )
}

function RepositoryEditor(props: {
  index: number
  repository: RepositoryForm
  choices: SettingsChoices
  review: ReviewSettings | undefined
  mode: string
  workspaceId: string
  onChange: (repository: RepositoryForm) => void
}) {
  const { repository, choices } = props
  const api = useAppApi()
  const inspectRepository = useMemo(() => inspectClient(api), [api])
  // Each sub-tab is a Back step inside the Edit dialog; a new dialog
  // starts on Mode.
  const [tab, setTab] = useSteppedState<RepositoryTab>(
    `settings-repo-tab-${props.index}`,
    'inner',
    (previous) => `Back to ${REPOSITORY_TABS.find((t) => t.key === previous)?.label ?? previous}`,
    'mode',
    false,
  )
  const [inspect, setInspect] = useState<RepositoryInspect | null>(null)
  const id = `avoozl-settings-repo-${props.index}`
  const set = (change: Partial<RepositoryForm>) => props.onChange({ ...repository, ...change })
  const setRule = (at: number, rule: RuleForm) =>
    set({ rules: repository.rules.map((item, index) => (index === at ? rule : item)) })
  const name = repository.name.trim()
  // GitHub's rules and checks, read only when a tab needs them.
  useEffect(() => {
    setInspect(null)
    if ((tab !== 'checks' && tab !== 'reviews') || !/^[\w.-]+\/[\w.-]+$/.test(name)) return
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
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <SegmentedControl
          layoutId="avoozl-repository-tabs"
          ariaLabel="Repository settings"
          segments={REPOSITORY_TABS.map((t) => ({ key: t.key, label: t.label }))}
          value={tab}
          onChange={(key) => setTab(key as RepositoryTab)}
          wrap
        />
        {tab === 'mode' && (
          <Section level="sub" title="Mode and branch" blurb={REPOSITORY_BLURBS.mode}>
            <p className="text-xs text-muted">
              Workspace mode: <span className="font-medium" style={{ color: 'var(--text)' }}>{MODE_TITLES[modeKey(props.mode)]}</span>. Change it under Where tasks live.
            </p>
            <div style={grid()}>
              <Text id={`${id}-name`} label="Repository" raw="key" rule={REPOSITORY_FIELD_RULES.name} placeholder="owner/name" value={repository.name} onChange={(value) => set({ name: value })} />
              <Text id={`${id}-base`} label="Default branch" raw="baseBranch" rule={REPOSITORY_FIELD_RULES.baseBranch} placeholder="main" width="md" value={repository.baseBranch} onChange={(value) => set({ baseBranch: value })} />
              <Text id={`${id}-concurrency`} label="Tasks at once" raw="concurrency" rule={REPOSITORY_FIELD_RULES.concurrency} placeholder="1" type="number" width="sm" value={repository.concurrency} onChange={(value) => set({ concurrency: value })} />
            </div>
            <Field id={`${id}-coder-worker`} label="Who codes" raw="coder" rule={REPOSITORY_FIELD_RULES.coder}>
              <CoderPicker id={`${id}-coder`} mode={props.mode} value={repository.coder} onChange={(value) => set({ coder: value })} />
            </Field>
          </Section>
        )}
        {tab === 'triggers' && (
          <div className="flex flex-col gap-5">
            <Section level="sub" title="Label rules" blurb={REPOSITORY_BLURBS.triggers}>
              {repository.rules.length === 0 && <p className="text-sm text-muted">No rules yet, so labels start nothing. Add one to let a label start work.</p>}
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
            </Section>
            <Section
              level="sub"
              title="Managed labels"
              blurb="Labels Avoozl itself adds and removes on issues to show their state. Don't edit them by hand: a hand edit shows as a conflict."
            >
              <div style={grid(200)}>
                {choices.managedLabels.map((key) => (
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
            </Section>
            <UntriagedSettings
              id={id}
              value={repository.untriaged}
              repository={name}
              workspaceId={props.workspaceId}
              onChange={(untriaged) => set({ untriaged })}
            />
            <Section level="sub" title="Issue Radar labels" blurb="Labels Issue Radar puts on issues it claims. Avoozl only reads them.">
              <div style={grid(200)}>
                {choices.crewLabels.map((key) => (
                  <Text
                    key={key}
                    id={`${id}-crew-${key}`}
                    label={CREW_LABELS[key] ?? key}
                    raw={`crewLabels.${key}`}
                    rule={{ required: false, blank: "blank: Issue Radar's default" }}
                    value={repository.crewLabels[key] ?? ''}
                    onChange={(value) => set({ crewLabels: { ...repository.crewLabels, [key]: value } })}
                  />
                ))}
              </div>
            </Section>
            <Section
              level="sub"
              title="Who counts"
              blurb="GitHub still decides who has access. This sets how much GitHub permission a person needs for a label, a board drag or a close to count."
            >
              <div className="flex flex-wrap items-end gap-3">
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
              </div>
            </Section>
            <Section level="sub" title="Priority" blurb="Ready tasks carrying a higher label here start first.">
              <Text id={`${id}-priority`} label="Priority labels, highest first" raw="priority" rule={{ required: false, blank: 'blank: graph order only' }} placeholder="p0, p1, p2" width="lg" value={repository.priority} onChange={(value) => set({ priority: value })} />
            </Section>
          </div>
        )}
        {tab === 'checks' && (
          <Section level="sub" title="Required checks" blurb={REPOSITORY_BLURBS.checks}>
            <ChecksEditor id={id} value={repository.requiredChecks} inspect={inspect} repository={name} onChange={(value) => set({ requiredChecks: value })} />
          </Section>
        )}
        {tab === 'reviews' && (
          <div className="flex flex-col gap-5">
            <Section level="sub" title="Pull-request reviews" blurb={REPOSITORY_BLURBS.reviews}>
              <ReviewRule
                inspect={inspect}
                repository={name}
                deprecated={repository.pullRequestReviews}
                approvals={repository.reviewApprovals}
                onDropDeprecated={() => set({ pullRequestReviews: false, reviewApprovals: '' })}
              />
            </Section>
            <ReviewRoles review={props.review} repository={name} />
          </div>
        )}
      </div>
    </Card>
  )
}

const MODE_TITLES: Record<string, string> = { local: 'Local only', 'plans-repo': 'Plans repository', 'single-repo': 'Single repository' }

// The label each Issue Radar crew must scope to, from the saved policy, and
// a link to Issue Radar, where the user sets it (R17.4). Nothing else.
function CrewScopes({ crews }: { crews: CrewScope[] }) {
  if (!crews.length) return null
  return (
    <Card>
      <Section title="Issue Radar crews" blurb="Scope each crew to its repository's ready label in Issue Radar, so it codes only what Avoozl marks ready.">
        <ul className="flex flex-col gap-1 text-sm">
          {crews.map((crew) => (
            <li key={crew.repository}>
              {crew.repository}: scope its crew to{' '}
              {crew.label ? <code>{crew.label}</code> : <span className="text-danger">no ready label yet; name one in Repositories</span>}{' '}
              in{' '}
              <a href={linkHref(crew.link)} target="_top" className="underline">
                Issue Radar
              </a>
              .
            </li>
          ))}
        </ul>
      </Section>
    </Card>
  )
}

function RepositoriesTab(props: {
  form: SettingsForm
  choices: SettingsChoices
  review: ReviewSettings | undefined
  workspaceId: string
  dirty: boolean
  set: (change: Partial<SettingsForm>) => void
  // Put the whole form back (Cancel in the Edit dialog).
  replace: (form: SettingsForm) => void
  // Save through the shared Save: null when written, else why not.
  onSave: () => Promise<string | null>
  saving: boolean
  // The registry change rewrote .avoozl.json; read the form again.
  onRegistryChanged: () => Promise<unknown>
  onOpenPlans?: () => void
}) {
  const { form, choices, set } = props
  const api = useAppApi()
  const workspaces = useMemo(() => workspaceClient(api), [api])
  const reveal = useReveal()
  const loadCheckouts = useCallback((id: string) => workspaces.repositories(id), [workspaces])
  const { value: checkouts, reload } = useRead<Repository[]>(props.workspaceId, loadCheckouts)
  const rows = repositoryRows(checkouts ?? [], form.repositories)
  const [selected, setSelected] = useState<string | null>(null)
  // The form as it was when Edit opened, so Cancel can put it back.
  const [start, setStart] = useState<SettingsForm | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const row = rows.find((r) => r.key === selected) ?? null
  const addBox = useRef<HTMLDivElement>(null)
  const removeRow = async (target: RepositoryRow) => {
    if (!target.checkout) {
      set({ repositories: form.repositories.filter((_, index) => index !== target.policy) })
      setSelected(null)
      setMessage({ ok: true, text: `${target.name}'s GitHub settings leave .avoozl.json when you save.` })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await workspaces.removeRepository(props.workspaceId, target.checkout.id)
      await Promise.all([reload(), props.onRegistryChanged()])
      setSelected(null)
      setMessage({ ok: true, text: `Removed ${target.name}. The folder and GitHub were not touched.` })
    } catch (caught) {
      setMessage({ ok: false, text: errorMessage(caught) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <Section title={`Added repositories (${rows.length})`} blurb={REPOSITORIES_LINE}>
          {checkouts === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <RepositoryList
              rows={rows}
              mode={form.mode}
              busy={busy}
              dirty={props.dirty}
              onEdit={(key) => {
                setStart(form)
                setSaveError(null)
                setSelected(key)
              }}
              onRemove={(target) => void removeRow(target)}
              onReveal={(folder) => void reveal(folder).then((text) => setMessage({ ok: true, text }))}
              onAdd={() => addBox.current?.querySelector('input')?.focus()}
            />
          )}
          {message && (
            <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-muted' : 'text-danger'}`}>
              {message.text}
            </p>
          )}
          {rows.length > 0 && <p className="mt-2 text-xs text-muted">Use Edit to change a repository&apos;s settings.</p>}
        </Section>
      </Card>
      {row && start && (
        <RepositoryDialog
          name={row.name}
          edited={JSON.stringify(toPolicy(form)) !== JSON.stringify(toPolicy(start))}
          missing={missingRequired(form)}
          saving={props.saving}
          error={saveError}
          onDiscard={() => {
            props.replace(start)
            setSelected(null)
            setStart(null)
          }}
          onSave={async () => {
            setSaveError(null)
            const missing = missingRequired(form)
            if (missing) return setSaveError(`Not saved. ${missing}`)
            const problem = await props.onSave()
            if (problem) return setSaveError(problem)
            setSelected(null)
            setStart(null)
            setMessage({ ok: true, text: `Saved ${row.name}'s settings to .avoozl.json.` })
          }}
        >
          <div className="flex flex-col gap-3.5" data-repository-dialog-body>
            {row && !isGitHubMode(form.mode) ? (
        <LocalRepository row={row} review={props.review} kept={row.policy >= 0} />
      ) : row && row.policy >= 0 ? (
        <RepositoryEditor
          key={row.key}
          index={row.policy}
          repository={form.repositories[row.policy]}
          choices={choices}
          review={props.review}
          mode={form.mode}
          workspaceId={props.workspaceId}
          onChange={(next) => set({ repositories: form.repositories.map((item, index) => (index === row.policy ? next : item)) })}
        />
      ) : row && row.github ? (
        <Card>
          <Section title={`${row.name} settings`} blurb={`${row.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`}>
            <IconLabel
              icon={Plus}
              tooltip="Add an entry you can change; saved when you press Save"
              onClick={() => {
                set({ repositories: [...form.repositories, { ...emptyRepository(row.github!), baseBranch: row.branch }] })
              }}
            >
              Add GitHub settings for {row.github}
            </IconLabel>
          </Section>
        </Card>
      ) : row ? (
        <Card>
          <Section title={`${row.name} settings`} blurb="A local-only repository: no GitHub remote, so the GitHub tabs do not apply.">
            <p className="text-sm" data-local-checks>
              Required checks apply only to GitHub pull requests. Here Avoozl runs each task&apos;s own checks from the spec manifest, or this
              repository&apos;s checks when a task names none.
            </p>
          </Section>
        </Card>
      ) : null}
          </div>
        </RepositoryDialog>
      )}
      <Onboard
        workspaceId={props.workspaceId}
        disabled={props.dirty ? 'Save or discard your settings changes first: onboarding writes .avoozl.json.' : null}
        onChanged={() => Promise.all([reload(), props.onRegistryChanged()])}
        onOpenPlans={props.onOpenPlans}
      />
      <Card>
        <div ref={addBox}>
          <AddRepository
            workspaceId={props.workspaceId}
            mode={form.mode}
            disabled={props.dirty ? 'Save or discard your settings changes first: adding a repository writes .avoozl.json.' : null}
            onAdded={(id) => {
              void Promise.all([reload(), props.onRegistryChanged()])
              setSelected(`checkout:${id}`)
              setMessage({ ok: true, text: `Added ${id}.` })
            }}
          />
        </div>
      </Card>
    </div>
  )
}

// Local only: what a repository uses here (folder, landing branch, its
// checks, reviewer chats). Its GitHub settings, if any, are kept unused.
function LocalRepository(props: { row: RepositoryRow; review: ReviewSettings | undefined; kept: boolean }) {
  const { row } = props
  return (
    <Card>
      <Section title={`${row.name} settings`} blurb="Local only: Avoozl codes, checks and merges here on this Mac.">
        <dl className="grid gap-x-3 gap-y-1 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }} data-local-repository>
          <dt className="text-muted">Folder</dt>
          <dd style={{ overflowWrap: 'anywhere' }}>{row.folder ?? 'not on this Mac'}</dd>
          <dt className="text-muted">Landing branch</dt>
          <dd>
            <code>{row.branch}</code>
          </dd>
          <dt className="text-muted">Who codes</dt>
          <dd>Avoozl worker chats</dd>
        </dl>
        <p className="text-sm" data-local-checks>
          Avoozl runs each task&apos;s own checks from the spec manifest, or this repository&apos;s checks when a task names none.
        </p>
        {props.kept && <p className="text-xs text-muted">Its GitHub settings are kept, not used. They apply again if you pick a GitHub mode.</p>}
      </Section>
      <ReviewRoles review={props.review} repository={row.github ?? row.name} />
    </Card>
  )
}

// Where tasks live: one fold-out section per mode, and inside the selected
// one every option that mode reads. Switching never deletes a stored setting.
function GeneralTab(props: {
  form: SettingsForm
  choices: SettingsChoices
  set: (change: Partial<SettingsForm>) => void
  setup: ReactNode
  crews: ReactNode
}) {
  const { form, choices, set } = props
  const shown = visibleSettings(form.mode)
  const kept = unusedInLocal(form)
  return (
    <Card>
      <ModePicker
        value={modeKey(form.mode)}
        onChange={(mode) => set({ mode })}
        idPrefix="avoozl-settings-mode"
        note={
          !isGitHubMode(form.mode) ? (
            <div className="flex flex-col gap-1.5 text-sm" data-local-note>
              <p>{LOCAL_HIDDEN_LINE}</p>
              <p className="text-xs text-muted">
                Folders, landing branches and checks are under Repositories. Worker and reviewer chats come from delivery in .avoozl.json.
              </p>
              {kept.length > 0 && <p className="text-xs text-muted" data-kept>Kept, not used: {kept.join(', ')}. Pick a GitHub mode to use them again.</p>}
            </div>
          ) : null
        }
      >
        {isGitHubMode(form.mode) ? (
          <div className="flex flex-col gap-4">
            <div style={grid()}>
              {shown.has('planningRepository') && (
                <Text id="avoozl-settings-planning" label="Planning repository" raw="planningRepository" rule={{ required: true, when: 'in plans-repo mode' }} placeholder="owner/plans" value={form.planningRepository} onChange={(value) => set({ planningRepository: value })} />
              )}
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
            <ProjectFields form={form} choices={choices} set={set} />
            <Section level="sub" title="Set up GitHub" blurb="Creates the labels, Project and fields the settings above name. It reads GitHub first and shows every write before making one.">
              {props.setup}
            </Section>
            {props.crews}
          </div>
        ) : null}
      </ModePicker>
    </Card>
  )
}

// The Project board Avoozl adds issues to and fills. One Project serves
// every repository in the workspace.
export function ProjectFields({ form, choices, set }: { form: SettingsForm; choices: SettingsChoices; set: (change: Partial<SettingsForm>) => void }) {
  return (
    <div>
      <Section
        level="sub"
        title="Project fields"
        blurb="The GitHub Project board Avoozl adds managed issues to and fills with Release, Wave and Avoozl state. People move Status; Avoozl never writes it. Leave every field blank to turn Project sync off."
      >
        <div style={grid(180)}>
          <Text id="avoozl-settings-project-owner" label="Owner" raw="project.owner" rule={PROJECT_FIELD_RULES.owner} placeholder="org or user" width="md" value={form.projectOwner} onChange={(value) => set({ projectOwner: value })} />
          <Text id="avoozl-settings-project-number" label="Number" raw="project.number" rule={PROJECT_FIELD_RULES.number} placeholder="2" type="number" width="md" value={form.projectNumber} onChange={(value) => set({ projectNumber: value })} />
        </div>
        <h5 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">Field names</h5>
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
        <h5 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">Status options</h5>
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
function PolicyEditor(props: { workspaceId: string; tab: SettingsTab; onOpenPlans?: () => void }) {
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
  const check = async () => {
    if (!form) return
    try {
      const result = await client.validate(workspaceId, toPolicy(form))
      setMessage(result.valid ? { ok: true, text: 'Settings are valid.' } : { ok: false, text: result.error || 'Invalid.' })
    } catch (caught) {
      setMessage({ ok: false, text: errorMessage(caught) })
    }
  }
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

  const choices = settings?.choices
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!settings || !form || !choices) return <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
  const dirty = JSON.stringify(toPolicy(form)) !== JSON.stringify(toPolicy(toForm(settings.github)))
  const missing = missingRequired(form)
  return (
    <div className="flex flex-col gap-3.5">
      {tab === 'github' && (
        <p className="text-sm text-muted" data-blurb="github">
          {isGitHubMode(form.mode) ? SETTINGS_BLURBS.github : LOCAL_TAB_BLURB}
        </p>
      )}
      {settings.error && (
        <p role="alert" className="text-sm text-danger">
          The saved settings are invalid: {settings.error}
        </p>
      )}
      {tab === 'repositories' ? (
        <RepositoriesTab
          form={form}
          choices={choices}
          review={settings.review}
          workspaceId={workspaceId}
          dirty={dirty}
          set={set}
          replace={setForm}
          onSave={save}
          saving={saving}
          onRegistryChanged={reload}
          onOpenPlans={props.onOpenPlans}
        />
      ) : (
        <GeneralTab
          form={form}
          choices={choices}
          set={set}
          setup={<SetupWizard workspaceId={workspaceId} client={client} settings={settings} shared={sharedSetup(form)} onSaved={reload} />}
          crews={visibleSettings(form.mode).has('issueRadarCrews') ? <CrewScopes crews={settings.crews ?? []} /> : null}
        />
      )}
      {tab === 'github' && <ThisComputer workspaceId={workspaceId} />}
      <div className="flex flex-wrap items-center gap-2">
        <TipBtn tooltip="Check these settings without saving them" onClick={() => void check()} disabled={saving}>
          Check
        </TipBtn>
        <TipBtn primary onClick={() => void save()} disabled={saving || !dirty || Boolean(missing)} tooltip={missing}>
          Save
        </TipBtn>
        {dirty ? (
          <DangerBtn
            disabled={busy || saving}
            confirm={{
              title: 'Discard your unsaved changes?',
              body: 'Every edit since the last save on these Settings tabs is lost. .avoozl.json stays as it is.',
              action: 'Discard changes',
            }}
            onConfirm={() => void reload()}
          >
            Discard changes
          </DangerBtn>
        ) : (
          <TipBtn tooltip="Read the settings from disk again" onClick={() => void reload()} disabled={busy || saving}>
            Reload
          </TipBtn>
        )}
        {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
        {dirty && missing && (
          <span className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
            {missing}
          </span>
        )}
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-muted' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

export default function SettingsView(props: {
  workspaceId: string | null
  tab?: SettingsTab
  onTab?: (tab: SettingsTab) => void
  onSelectWorkspace?: (id: string | null) => void
  onListChange?: (list: WorkspaceList) => void
  onOpenPlans?: () => void
  onOpenRouting?: () => void
}) {
  const { workspaceId } = props
  const [own, setOwn] = useState<SettingsTab>(SETTINGS_HOME)
  const asked = props.tab ?? own
  // A remembered tab that no longer exists falls back to Workspaces.
  const tab: SettingsTab = SETTINGS_TABS.some((t) => t.key === asked) ? asked : SETTINGS_HOME
  const choose = (next: SettingsTab) => (props.onTab ? props.onTab(next) : setOwn(next))
  return (
    <section aria-labelledby="avoozl-settings-title" className="flex flex-col gap-3.5">
      <ViewHeading id="avoozl-settings-title" view="settings">
        Settings
      </ViewHeading>
      <SegmentedControl
        layoutId="avoozl-settings-tabs"
        ariaLabel="Settings sections"
        segments={SETTINGS_TABS.map((t) => ({ key: t.key, label: t.label }))}
        value={tab}
        onChange={(key) => choose(key as SettingsTab)}
        wrap
      />
      {tab !== 'github' && (
        <p className="text-sm text-muted" data-blurb={tab}>
          {SETTINGS_BLURBS[tab]}
        </p>
      )}
      {tab === 'workspaces' ? (
        <WorkspaceView selected={workspaceId} onSelect={props.onSelectWorkspace} onListChange={props.onListChange} />
      ) : !workspaceId ? (
        <EmptyState
          title="Pick a workspace"
          subtitle="Choose one in the header, or add one under Workspaces."
          action={<Btn onClick={() => choose('workspaces')}>Open Workspaces</Btn>}
        />
      ) : tab === 'plugins' ? (
        <PluginsSettings workspaceId={workspaceId} />
      ) : tab === 'content' ? (
        <ContentRulesSettings workspaceId={workspaceId} />
      ) : tab === 'flow' ? (
        <FlowSettings workspaceId={workspaceId} />
      ) : tab === 'delivery' ? (
        <DeliverySettings workspaceId={workspaceId} onOpenRouting={props.onOpenRouting} />
      ) : tab === 'budgets' ? (
        <BudgetSettings workspaceId={workspaceId} />
      ) : tab === 'prices' ? (
        <PricesSettings workspaceId={workspaceId} />
      ) : tab === 'providers' ? (
        <ProvidersSettings workspaceId={workspaceId} />
      ) : (
        <PolicyEditor workspaceId={workspaceId} tab={tab} onOpenPlans={props.onOpenPlans} />
      )}
    </section>
  )
}
