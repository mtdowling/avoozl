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
  assert.match(settings, /data-blurb=\{section\.key\}>\s*\{SETTINGS_BLURBS\[section\.key\]\}/)
  for (const tab of ['general', 'landing', 'github', 'checks', 'reviews', 'map'])
    assert.match(settings, new RegExp(`blurb=\\{REPOSITORY_BLURBS\\.${tab}\\}`), tab)
  // Managed labels say what they are, and that hand edits are conflicts.
  assert.match(settings, /Labels Avoozl itself adds and removes on issues to show their state\. Don't edit them by hand: a hand edit shows as a conflict\./)
  for (const title of ['Managed labels', 'Who counts', 'Priority', 'Project fields', 'Set up GitHub'])
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
  // The marker is the shared field row's.
  assert.match(source('FieldRow.tsx'), /data-marker="required"/)
  assert.match(source('FieldRow.tsx'), /data-marker="optional"/)
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
  assert.match(settings, /problem=\{missing\}/)
  assert.equal(REPOSITORY_FIELD_RULES.name.required, true)
  assert.equal(REPOSITORY_FIELD_RULES.minimumPermission.blank, 'blank: write, unless actors are named')
})

test('the radio fold-out is real radios with motion off under reduced motion, and the role help keeps the mode cards', () => {
  const picker = source('RoleHelp.tsx')
  const fold = source('ui/RadioFold.tsx')
  assert.deepEqual(MODE_CARDS.map((card) => card.mode), ['local', 'plans-repo', 'single-repo'])
  for (const card of MODE_CARDS) {
    assert.ok(card.useWhen.length >= 3)
    assert.equal(card.facts.length, 3)
  }
  assert.equal(MODE_CARDS[1].line, 'Specs and their related issues live in a private planning repository; code and pull requests live in the code repositories.')
  assert.match(MODE_CARDS[1].facts[2][1], /only in the planning repository/)
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
  assert.doesNotMatch(picker, /--warn|#[0-9a-f]{6}\b/i)
  // The role help shows one card per outcome and picks nothing itself.
  assert.match(picker, /MODE_CARDS\.map/)
  assert.doesNotMatch(picker, /onChange|<input/)
  assert.doesNotMatch(settings, /[^e]ModePicker\.tsx|<ModePicker/)
  const wizard = source('SetupWizard.tsx')
  assert.doesNotMatch(wizard, /<RoleHelp/)
  assert.doesNotMatch(wizard, /id="avoozl-setup-owner"|id="avoozl-setup-number"|id="avoozl-setup-planning"/)
  assert.match(settings, /shared=\{sharedSetup\(form\)\}/)
})

test('no mode is Local only', () => {
  assert.equal(modeKey(''), 'local')
  assert.equal(modeKey('local'), 'local')
})

test('each mode shows only the settings it reads, and Local only keeps the rest', () => {
  const local = visibleSettings('local')
  for (const key of ['triggers', 'requiredChecks', 'pullRequestReviews', 'projectFields', 'setupGitHub', 'planningRepository'])
    assert.ok(!local.has(key), key)
  for (const key of ['landingBranch', 'workerChats', 'reviewerChats', 'localChecks']) assert.ok(local.has(key), key)
  const single = visibleSettings('single-repo')
  assert.ok(!single.has('planningRepository'))
  assert.ok(single.has('setupGitHub'))
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
  assert.match(settings, /if \(!isGitHubMode\(form\.mode\)\)\s*return \{ tabs: LOCAL_TABS, body: <LocalRepository/)
  assert.match(settings, /<p>\{LOCAL_HIDDEN_LINE\}<\/p>/)
})

test('Repositories: one compact list with View, Edit and a trash Remove behind Are you sure?, then Add repository in its own box', () => {
  const repos = source('RepositoriesSettings.tsx')
  assert.match(repos, /REPOSITORIES_LINE =/)
  assert.match(repos, /<IconBtn icon=\{Eye\} label=\{`View \$\{row\.name\}`\}/)
  assert.match(repos, /<IconBtn icon=\{Pencil\} label=\{`Edit \$\{row\.name\}`\}/)
  assert.match(repos, /<DangerBtn icon=\{Trash2\} label=\{`Remove \$\{row\.name\}`\}/)
  assert.match(repos, /Are you sure\?[\s\S]*are not touched/)
  assert.match(repos, /data-repositories-empty/)
  assert.match(repos, /1\. Pick the folder/)
  assert.match(repos, /2\. Confirm what Avoozl found/)
  const tab = settings.slice(settings.indexOf('function RepositoriesTab('), settings.indexOf('function GeneralTab('))
  assert.ok(tab.indexOf('<RepositoryList') < tab.indexOf('<AddRepository'), 'the list comes before Add repository')
  assert.match(tab, /Added repositories \(\$\{rows\.length\}\)/)
  assert.match(tab, /workspaces\.removeRepository\(props\.workspaceId, target\.checkout\.id\)/)
  assert.match(settings, /data-local-checks/)
  // The Workspaces pane has no repositories panel at all. Add and Edit are
  // modals: no inline form and no right-side shelf.
  const ws = source('WorkspaceView.tsx')
  assert.doesNotMatch(ws, /Register repository|Manage in Repositories|data-repository-summary|client\.repositories/)
  assert.doesNotMatch(ws, /data-workspaces-layout|<aside|gridTemplateColumns: 'minmax\(0, 3fr\)|useMedia/)
  assert.match(ws, /<Btn type="button" primary data-add-workspace onClick=\{\(\) => setDialog\('add'\)\}>/)
  assert.match(ws, /<Modal\s+id="avoozl-ws-add"/)
  assert.match(ws, /<Modal\s+id="avoozl-ws-edit"/)
  assert.match(ws, /data-edit-workspace=\{workspace\.id\}/)
  assert.match(ws, /<Pencil size=\{14\}/)
  // The add form sits inside its modal, after the list.
  assert.ok(ws.indexOf('Your workspaces') < ws.indexOf('<Modal\n          id="avoozl-ws-add"'))
  assert.match(source('ui/controls.tsx'), /export const dangerStyle: CSSProperties = \{ color: 'var\(--danger\)', borderColor: 'var\(--danger\)' \}/)
})

test('markers read (required) or (optional) in plain muted text, never red or bold', () => {
  const row = source('FieldRow.tsx')
  const marker = row.slice(row.indexOf('export function Marker'), row.indexOf('// A `.avoozl.json` key'))
  assert.match(marker, /\(required\{rule\.when \? ` \$\{rule\.when\}` : ''\}\)/)
  assert.match(marker, /\(optional\)/)
  assert.doesNotMatch(marker, /--danger|font-medium|font-semibold|font-bold/)
})

test('who counts is one row on the GitHub tab, with write as the default; no separate tab', () => {
  assert.doesNotMatch(settings, /key: 'people'/)
  const triggers = settings.slice(settings.indexOf("{tab === 'github' && ("), settings.indexOf("{tab === 'mirror' && <MirrorBox"))
  assert.match(triggers, /title="Who counts"/)
  assert.match(triggers, /raw="minimumPermission"/)
  assert.match(triggers, /raw="allowedActors"/)
  assert.match(triggers, /'Default: write'/)
})

test('Settings has a GitHub page; Workspaces keeps only workspace things', () => {
  assert.deepEqual(SETTINGS_TAB_KEYS(), ['workspaces', 'repositories', 'github', 'radar', 'plugins', 'content', 'flow', 'models', 'delivery'])
  assert.doesNotMatch(settings, /Where tasks live' \}/)
  assert.match(settings, /setup=\{<SetupWizard/)
  const workspaces = settings.slice(settings.indexOf("if (tab === 'workspaces')"), settings.indexOf("if (!workspaceId)"))
  assert.match(workspaces, /<WorkspaceView[\s\S]*<ThisComputer/)
  assert.doesNotMatch(workspaces, /PolicyEditor|WorkspaceGitHub|RateBlock|SetupWizard/)
  // The Plugins link to the GitHub settings opens the GitHub page.
  assert.match(settings, /onOpenGitHub=\{\(\) => props\.onTab\('github'\)\}/)
  // Any other tab, GitHub included, is the PolicyEditor with one Save bar.
  assert.match(settings, /<PolicyEditor workspaceId=\{workspaceId\} tab=\{tab\}/)
  // GitHub calls is a tab of the GitHub page.
  assert.match(settings, /rate=\{settings\.rate\}/)
  assert.match(settings, /\{tab === 'calls' &&[\s\S]*<RateBlock rate=\{props\.rate\} \/>/)
  assert.match(settings, /<SaveFooter[\s\S]*note="Writes \.avoozl\.json\."/)
})

test('GitHub: every group is its own tab and bordered section, and Radar settings live on their own page', () => {
  const github = settings.slice(settings.indexOf('function WorkspaceGitHub('), settings.indexOf('function RadarSettings('))
  const shown = github.slice(github.indexOf('<Tabs id="avoozl-github-tab"'))
  for (const [tab, title] of [['issues', 'New tasks and issues'], ['sync', 'Sync pace'], ['setup', 'Set up GitHub']]) assert.match(shown, new RegExp(`\\{tab === '${tab}' && \\(\\s*<Card>\\s*<Section title="${title}"`), title)
  assert.match(shown, /\{tab === 'project' && \(\s*<Card>\s*<ProjectFields/)
  assert.doesNotMatch(github, /CrewScopes|RadarValuesScreen|level="sub"/)
  // GitHub calls is a bordered section of its own.
  assert.match(settings, /<Card>\s*<Section title="GitHub calls"/)
  const radar = settings.slice(settings.indexOf('function RadarSettings('), settings.indexOf('export function ProjectFields'))
  // The crew scope and Radar values were Radar coding (R91.6).
  assert.doesNotMatch(radar, /CrewScope|RadarValuesScreen|ReleaseModePicker/)
  assert.match(settings, /tab === 'radar' \? \(\s*<RadarSettings/)
  assert.match(settings, /\n  radar:\s*\n?\s*['"]/)
})

test('Plugins puts Add plugin on the left and the installed list on the right, stacked when narrow', () => {
  const plugins = source('PluginsSettings.tsx')
  const layout = plugins.slice(plugins.indexOf('data-plugins-layout'))
  assert.ok(layout.indexOf('<AddPlugin') < layout.indexOf('title="Installed plugins"'))
  assert.match(plugins, /useMedia\('\(min-width: 1024px\)'\)/)
  assert.match(source('ui/PairedCards.tsx'), /flexDirection: 'column'/)
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

test('the GitHub calls breakdown is its own section with a sortable real table', () => {
  assert.match(settings, /<Section title="GitHub calls"/)
  assert.match(settings, /<Box key=\{col\.key\} scope="col" aria-sort=[^\n]*as="th"/)
  assert.match(settings, /<button type="button" data-sort=\{col\.key\}/)
  assert.match(settings, /css-text-align="right" css-font-variant-numeric="tabular-nums"/)
})

// The body of one function in SettingsView.tsx, by its first line.
const body = (start) => {
  const at = settings.indexOf(start)
  return settings.slice(at, settings.indexOf('\n}\n', at))
}

test('Settings › Issue Radar holds every Radar intake setting, each in its own section box with one line', () => {
  const page = body('function RadarSettings(')
  const titles = [...page.matchAll(/<Section title=\{?["']?([^"'}]+)/g)].map((m) => m[1])
  // Conflicts and the merge method are on the repository's Landing tab (§4.25).
  assert.deepEqual(titles, ['Issue Radar', 'Repository', 'Handoff to Avoozl', 'Labels Radar uses'])
  assert.equal((page.match(/<Section title=/g) ?? []).length, (page.match(/<Section title=[^>]*blurb=/g) ?? []).length)
  for (const part of ['<AvoozlLabelFields', 'crewLabels.${key}'])
    assert.ok(page.includes(part), part)
  // Each section box is a Card around one Section; nothing loose between them.
  const tops = [...page.slice(page.indexOf('data-radar-settings')).matchAll(/\n {6}(<\w+|\{\w+)/g)].map((m) => m[1])
  assert.deepEqual(tops, ['{names', '<Card', '<Card', '<Card'])
  // The repository editor keeps no Radar field and no Crews and rules tab.
  const editor = body('export function RepositoryEditor(')
  assert.doesNotMatch(editor, /CrewsRulesSettings|ReleaseModePicker|crewLabels|Issue Radar labels|tab === 'crews'/)
  assert.doesNotMatch(settings.slice(settings.indexOf('const REPOSITORY_TABS'), settings.indexOf('type RepositoryTab')), /crews/)
  // It edits the shared form, so the one Save bar writes it.
  assert.match(settings, /tab === 'radar' \? \(\s+<RadarSettings form=\{form\} settings=\{settings\} workspaceId=\{workspaceId\} set=\{set\} \/>/)
})

test('a Workflow map value on the Issue Radar page opens that page at the field', () => {
  assert.match(settings, /if \(jump\.tab === 'radar'\) return props\.onOpenRadar\?\.\(\{ repository: name, field: jump\.field \}\)/)
  assert.match(settings, /radarJump = jump\s+props\.onTab\?\.\('radar'\)/)
  assert.match(body('function RadarSettings('), /focusField\(id, jump\)/)
  assert.match(settings, /<PolicyEditor workspaceId=\{workspaceId\} tab=\{tab\} onOpenPlans=\{props\.onOpenPlans\} onTab=\{props\.onTab\} \/>/)
})
