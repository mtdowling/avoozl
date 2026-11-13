// Settings explains itself: a blurb per group and tab, Required/Optional
// markers from the validator's rules, the mode cards, the checks list, and
// the branch review rule. No DOM renderer here (react-dom is not a
// dependency), so wiring is checked in the source and logic directly.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  LOCAL_HIDDEN_LINE,
  MODE_CARDS,
  modeKey,
  stepMode,
  toPolicy,
  unusedInLocal,
  visibleSettings,
  PROJECT_FIELD_RULES,
  REPOSITORY_FIELD_RULES,
  checkRows,
  missingRequired,
  reviewRuleText,
  toForm,
  toggleCheck,
} from '../src/settings-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const settings = source('SettingsView.tsx')

test('every Settings group and repository tab renders its blurb', () => {
  for (const tab of ['workspaces', 'repositories', 'github', 'plugins', 'content'])
    assert.match(settings, new RegExp(`\\n  ${tab}:\\s*\\n?\\s*['"]`), tab)
  assert.match(settings, /data-blurb=\{tab\}>\s*\{SETTINGS_BLURBS\[tab\]\}/)
  // Where tasks live drops its GitHub clause in Local only.
  assert.match(settings, /isGitHubMode\(form\.mode\) \? SETTINGS_BLURBS\.github : LOCAL_TAB_BLURB/)
  for (const tab of ['mode', 'triggers', 'checks', 'reviews'])
    assert.match(settings, new RegExp(`blurb=\\{REPOSITORY_BLURBS\\.${tab}\\}`), tab)
  // Managed labels say what they are, and that hand edits are conflicts.
  assert.match(settings, /Labels Avoozl itself adds and removes on issues to show their state\. Don't edit them by hand: a hand edit shows as a conflict\./)
  for (const title of ['Managed labels', 'Issue Radar labels', 'Who counts', 'Priority', 'Project fields', 'Set up GitHub'])
    assert.match(settings, new RegExp(`title="${title}"\\s+blurb=`), title)
})

test('Project fields: owner and number are required, every field name is optional with its blank meaning', () => {
  assert.deepEqual(PROJECT_FIELD_RULES.owner, { required: true, when: 'to use a Project' })
  assert.deepEqual(PROJECT_FIELD_RULES.number, { required: true, when: 'to use a Project' })
  for (const key of ['status', 'release', 'wave', 'iteration', 'todo', 'inProgress', 'done', 'deferred']) {
    assert.equal(PROJECT_FIELD_RULES[key].required, false, key)
    assert.match(PROJECT_FIELD_RULES[key].blank, /^blank: /, key)
  }
  assert.equal(PROJECT_FIELD_RULES.iteration.blank, 'blank: Avoozl skips Iteration')
  assert.equal(PROJECT_FIELD_RULES.status.blank, 'blank: uses the field named Status')
  // The tab gives each field its rule, so each renders its marker.
  const project = settings.slice(settings.indexOf('export function ProjectFields'))
  assert.match(project, /rule=\{PROJECT_FIELD_RULES\.owner\}/)
  assert.match(project, /rule=\{PROJECT_FIELD_RULES\.number\}/)
  assert.equal((project.match(/rule=\{PROJECT_FIELD_RULES\[key\]\}/g) ?? []).length, 2)
  assert.match(settings, /data-marker="required"/)
  assert.match(settings, /data-marker="optional"/)
})

test('Save is blocked with a clear message while a required setting is missing', () => {
  const form = toForm({
    mode: 'single-repo',
    repositories: { 'o/app': { baseBranch: 'main' } },
  })
  assert.equal(missingRequired(form), null)
  assert.match(missingRequired({ ...form, projectNumber: '2' }), /Project needs its owner/)
  assert.match(missingRequired({ ...form, projectOwner: 'o' }), /Project needs its number/)
  assert.match(missingRequired({ ...form, fields: { wave: 'Wave' } }), /Project needs its owner/)
  assert.match(missingRequired({ ...form, mode: 'plans-repo' }), /planning repository/)
  form.repositories[0].baseBranch = ''
  assert.match(missingRequired(form), /o\/app needs its default branch/)
  assert.equal(missingRequired({ ...form, mode: '' }), null)
  assert.match(settings, /const missing = missingRequired\(form\)/)
  assert.match(settings, /disabled=\{saving \|\| !dirty \|\| Boolean\(missing\)\}/)
  assert.equal(REPOSITORY_FIELD_RULES.name.required, true)
  assert.equal(REPOSITORY_FIELD_RULES.minimumPermission.blank, 'blank: write, unless actors are named')
})

test('one radio fold-out section per mode, in order, real radios, motion off under reduced motion', () => {
  const picker = source('ModePicker.tsx')
  const fold = source('RadioFold.tsx')
  assert.deepEqual(MODE_CARDS.map((card) => card.mode), ['local', 'plans-repo', 'single-repo'])
  for (const card of MODE_CARDS) {
    assert.ok(card.useWhen.length >= 3)
    assert.equal(card.facts.length, 4)
  }
  assert.equal(MODE_CARDS[1].line, 'Specs and their related issues live in a private planning repository; code and pull requests live in the code repositories.')
  assert.match(MODE_CARDS[1].facts[3][1], /Issue Radar cannot code here/)
  assert.match(MODE_CARDS[2].facts[0][1], /Closes #N/)
  // One radiogroup of real radio inputs; the whole header is the label.
  assert.match(fold, /role="radiogroup"/)
  assert.match(fold, /<label\s+htmlFor=\{id\}/)
  assert.match(fold, /type="radio"\s+name=\{props\.name\}/)
  assert.match(fold, /checked=\{open\}/)
  // The open section is the selected one: description, a rule, then fields.
  assert.match(fold, /\{open && !section\.disabled/)
  assert.match(fold, /\{section\.description && section\.fields && <SectionRule \/>\}/)
  assert.match(fold, /prefers-reduced-motion: reduce\) \{ \[data-radio-fold-body\] \{ animation: none/)
  assert.match(fold, /className="flex items-center gap-2 text-base font-semibold"/)
  assert.doesNotMatch(picker, /data-mode-pane|translateX|flex-grow 250ms/)
  assert.doesNotMatch(picker, /--warn|#[0-9a-f]{6}\b/i)
  assert.match(picker, /<RadioFold/)
  assert.match(picker, /fields: card\.mode === current \? props\.children : undefined/)
  // Local only's note goes with its description, so it gets no rule.
  assert.match(settings, /note=\{\s*!isGitHubMode\(form\.mode\)/)
  assert.match(settings, /\{isGitHubMode\(form\.mode\) \? \(\s*<div className="flex flex-col gap-4">/)
  assert.match(settings, /<ModePicker\s+value=\{modeKey\(form\.mode\)\}\s+onChange=\{\(mode\) => set\(\{ mode \}\)\}/)
  const wizard = source('SetupWizard.tsx')
  assert.doesNotMatch(wizard, /<ModePicker/)
  assert.doesNotMatch(wizard, /id="avoozl-setup-owner"|id="avoozl-setup-number"|id="avoozl-setup-planning"/)
  assert.match(settings, /shared=\{sharedSetup\(form\)\}/)
})

test('arrow keys move between modes and wrap; no mode is Local only', () => {
  assert.equal(modeKey(''), 'local')
  assert.equal(modeKey('local'), 'local')
  assert.equal(stepMode('local', 'ArrowRight'), 'plans-repo')
  assert.equal(stepMode('single-repo', 'ArrowRight'), 'local')
  assert.equal(stepMode('', 'ArrowLeft'), 'single-repo')
  assert.equal(stepMode('plans-repo', 'End'), 'single-repo')
  assert.equal(stepMode('plans-repo', 'Tab'), null)
})

test('each mode shows only the settings it reads, and Local only keeps the rest', () => {
  const local = visibleSettings('local')
  for (const key of ['triggers', 'requiredChecks', 'pullRequestReviews', 'projectFields', 'setupGitHub', 'coder', 'planningRepository', 'issueRadarCrews'])
    assert.ok(!local.has(key), key)
  for (const key of ['landingBranch', 'workerChats', 'reviewerChats', 'localChecks']) assert.ok(local.has(key), key)
  const single = visibleSettings('single-repo')
  assert.ok(!single.has('planningRepository'))
  assert.ok(single.has('issueRadarCrews') && single.has('setupGitHub'))
  const plans = visibleSettings('plans-repo')
  assert.ok(plans.has('planningRepository') && !plans.has('issueRadarCrews'))
  assert.equal(LOCAL_HIDDEN_LINE, 'Labels, checks, reviews and the Project board only apply to GitHub modes.')
  const form = toForm({ mode: 'local', planningRepository: 'o/plans', project: { owner: 'o', number: 2 }, repositories: { 'o/app': {} } })
  // Kept, not deleted: the stored values stay in the form and the policy.
  assert.equal(form.planningRepository, 'o/plans')
  assert.equal(toPolicy(form).planningRepository, 'o/plans')
  assert.deepEqual(unusedInLocal(form), ['planning repository', 'Project board', '1 repository GitHub setting'])
  // Local only needs no base branch or Project number.
  assert.equal(missingRequired({ ...form, projectNumber: '' }), null)
  assert.match(settings, /row && !isGitHubMode\(form\.mode\) \? \(\s*<LocalRepository/)
  assert.match(settings, /<p>\{LOCAL_HIDDEN_LINE\}<\/p>/)
})

test('Repositories: one list with row actions, a red Remove behind a confirm, then Add repository in its own box', () => {
  const repos = source('RepositoriesSettings.tsx')
  assert.match(repos, /REPOSITORIES_LINE =/)
  assert.match(repos, /<IconBtn icon=\{FolderOpen\} label=\{`Open \$\{row\.name\} in Finder`\}/)
  assert.match(repos, /target="_blank"\s+rel="noopener noreferrer"/)
  assert.match(repos, /<DangerBtn[\s\S]*Remove \$\{row\.name\} from this workspace\?[\s\S]*are not touched/)
  assert.match(repos, /data-repositories-empty/)
  assert.match(repos, /1\. Pick the folder/)
  assert.match(repos, /2\. Confirm what Avoozl found/)
  const tab = settings.slice(settings.indexOf('function RepositoriesTab('), settings.indexOf('function GeneralTab('))
  assert.ok(tab.indexOf('<RepositoryList') < tab.indexOf('<AddRepository'), 'the list comes before Add repository')
  assert.match(tab, /Added repositories \(\$\{rows\.length\}\)/)
  assert.match(tab, /workspaces\.removeRepository\(props\.workspaceId, target\.checkout\.id\)/)
  assert.match(tab, /data-local-checks/)
  // The Workspaces pane has no repositories panel at all; the tick log
  // takes its place, floated right beside the list and Add box.
  const ws = source('WorkspaceView.tsx')
  assert.doesNotMatch(ws, /Register repository|Manage in Repositories|data-repository-summary|client\.repositories/)
  const layout = ws.slice(ws.indexOf('data-workspaces-layout'))
  assert.ok(layout.indexOf('Your workspaces') < layout.indexOf('data-add-workspace'))
  assert.ok(layout.indexOf('data-add-workspace') < layout.indexOf('<aside aria-label="Tick health"'))
  assert.match(ws, /gridTemplateColumns: 'minmax\(0, 3fr\) minmax\(18rem, 2fr\)', gap: 14, alignItems: 'start'/)
  assert.match(ws, /useMedia\('\(min-width: 768px\)'\)/)
  assert.match(ws, /data-tick-panel style=\{\{ maxHeight: 'calc\(100vh - 12rem\)', overflowY: 'auto' \}\}/)
  assert.match(source('controls.tsx'), /export const dangerStyle: CSSProperties = \{ color: 'var\(--danger\)', borderColor: 'var\(--danger\)' \}/)
})

test('markers read (required) or (optional) in plain muted text, never red or bold', () => {
  const marker = settings.slice(settings.indexOf('export function Marker'), settings.indexOf('// A label with its marker'))
  assert.match(marker, /\(required\{rule\.when \? ` \$\{rule\.when\}` : ''\}\)/)
  assert.match(marker, /\(optional\)/)
  assert.doesNotMatch(marker, /--danger|font-medium|font-semibold|font-bold/)
})

test('who counts is one row on the Triggers tab, with write as the default; no separate tab', () => {
  assert.doesNotMatch(settings, /key: 'people'/)
  const triggers = settings.slice(settings.indexOf("{tab === 'triggers' && ("), settings.indexOf("{tab === 'checks' && ("))
  assert.match(triggers, /title="Who counts"/)
  assert.match(triggers, /raw="minimumPermission"/)
  assert.match(triggers, /raw="allowedActors"/)
  assert.match(triggers, /'Default: write'/)
})

test('Settings has one Where tasks live tab, with Set up GitHub inside a GitHub pane', () => {
  assert.deepEqual(SETTINGS_TAB_KEYS(), ['workspaces', 'repositories', 'github', 'plugins', 'content', 'flow', 'delivery', 'providers'])
  assert.match(settings, /\{ key: 'github', label: 'Where tasks live' \}/)
  assert.match(settings, /setup=\{<SetupWizard/)
})

test('Plugins puts Add plugin on the left and the installed list on the right, stacked when narrow', () => {
  const plugins = source('PluginsSettings.tsx')
  const layout = plugins.slice(plugins.indexOf('data-plugins-layout'))
  assert.ok(layout.indexOf('<AddPlugin') < layout.indexOf('aria-label="Installed plugins"'))
  assert.match(plugins, /useMedia\('\(min-width: 1024px\)'\)/)
  assert.match(plugins, /flexDirection: 'column'/)
})

const SETTINGS_TAB_KEYS = () => [...settings.slice(settings.indexOf('export const SETTINGS_TABS'), settings.indexOf('] as const')).matchAll(/key: '(\w+)'/g)].map((m) => m[1])

test('checks list what GitHub shows, keep unseen saved names, and toggle in place', () => {
  const now = Date.parse('2026-11-12T12:00:00Z')
  const sources = { build: { source: 'GitHub Actions', at: '2026-11-10T12:00:00Z' }, lint: { source: 'Commit status', at: null } }
  const rows = checkRows('lint, old-check', { seen: ['build', 'lint'], required: ['build'], sources }, now)
  assert.deepEqual(
    rows.map(({ name, checked, seen, branchRule }) => ({ name, checked, seen, branchRule })),
    [
      // The branch rule's checks are on and come first: GitHub enforces them.
      { name: 'build', checked: true, seen: true, branchRule: true },
      { name: 'lint', checked: true, seen: true, branchRule: false },
      { name: 'old-check', checked: true, seen: false, branchRule: false },
    ],
  )
  assert.match(rows[0].where, /^Required by GitHub branch rule · GitHub Actions · last run /)
  assert.equal(rows[1].where, 'Commit status')
  assert.equal(rows[2].where, 'Not seen on recent commits or open pull requests')
  assert.equal(toggleCheck('lint, old-check', 'build', true), 'lint, old-check, build')
  assert.equal(toggleCheck('lint, old-check', 'lint', false), 'old-check')
  assert.equal(toggleCheck('', 'build', true), 'build')
  assert.deepEqual(
    checkRows('a', null).map(({ name, checked }) => ({ name, checked })),
    [{ name: 'a', checked: true }],
  )
})

test('the Checks tab: listed, reading, typed with a reason, or not named yet', () => {
  const editor = settings.slice(settings.indexOf('function ChecksEditor('), settings.indexOf('function ReviewRule('))
  assert.match(settings, /checks:\n    "Names of GitHub checks \(CI jobs\) that must pass on a task's PR before Avoozl counts it as done\.",/)
  for (const state of ['typed', 'reading', 'listed']) assert.match(editor, new RegExp(`data-checks="${state}"`), state)
  assert.match(editor, /Type the names instead\./)
  assert.match(editor, /Names are exact and case-sensitive, separated by commas\./)
  assert.match(editor, /Name the repository as owner\/name under Mode/)
  // Branch-rule checks are read-only; the link changes the rule on GitHub.
  assert.match(editor, /disabled=\{row\.branchRule\}/)
  assert.match(editor, /Change the branch rule on GitHub/)
  assert.match(editor, /rel="noopener noreferrer"/)
  assert.match(editor, /\{row\.where\}/)
  // The part that failed says why; the other part still shows.
  assert.match(editor, /props\.inspect\?\.checksError \?\? props\.inspect\?\.error/)
})

test('the Reviews tab states the branch rule it found, or that reviewer chats are the gate', () => {
  const base = { repository: 'o/app', branch: 'main', checks: null, error: null }
  assert.match(
    reviewRuleText({ ...base, reviewRule: { approvals: 2, dismissStale: true, sources: ['ruleset'], url: 'u' } }),
    /^main needs 2 approving reviews \(ruleset\), and a new push dismisses old approvals\./,
  )
  assert.equal(
    reviewRuleText({ ...base, reviewRule: { approvals: 0, dismissStale: false, sources: [], url: 'u' } }),
    "No branch rule asks for approvals; Avoozl's reviewer chats are the review gate.",
  )
  assert.match(reviewRuleText({ ...base, reviewRule: null, error: 'GitHub is not signed in.' }), /not signed in/)
  // The old checkbox and count are gone; an old key shows as deprecated.
  assert.doesNotMatch(settings, /Require GitHub approvals on the head commit/)
  assert.match(settings, /<Badge>deprecated<\/Badge>/)
})
