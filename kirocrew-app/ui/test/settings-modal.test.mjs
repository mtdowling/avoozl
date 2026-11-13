// Settings: the repository Edit dialog, the shared radio fold-out in Add
// plugin, the Add rule set main action and the workspace "How to add" label.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { trapStep } from '../src/focus-trap.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Tab stays inside the dialog and wraps both ways', () => {
  assert.equal(trapStep(3, 2, false), 0)
  assert.equal(trapStep(3, 0, true), 2)
  assert.equal(trapStep(3, 1, false), 2)
  assert.equal(trapStep(3, -1, false), 0)
  assert.equal(trapStep(3, -1, true), 2)
  assert.equal(trapStep(0, -1, false), -1)
})

test('a repository row has Edit and no longer expands on a click', () => {
  const repos = source('RepositoriesSettings.tsx')
  const settings = source('SettingsView.tsx')
  assert.match(repos, /<IconLabel icon=\{Pencil\} tooltip=\{`Change \$\{row\.name\}'s settings in a dialog`\} aria-label=\{`Edit \$\{row\.name\}`\}/)
  assert.doesNotMatch(repos, /aria-pressed=\{on\}|onSelect/)
  assert.doesNotMatch(settings, /Pick a repository to change its settings\./)
  assert.match(settings, /Use Edit to change a repository&apos;s settings\./)
  // The row's settings live only in the dialog.
  assert.match(settings, /\{row && start && \(\s*<RepositoryDialog/)
})

test('the Edit dialog saves through the shared Save, blocks on a missing field and asks before discarding', () => {
  const repos = source('RepositoriesSettings.tsx')
  const settings = source('SettingsView.tsx')
  const modal = source('Modal.tsx')
  assert.match(repos, /<Modal\s+id="avoozl-repo-edit"\s+title=\{props\.name\}/)
  assert.match(repos, /action: 'Discard changes'/)
  assert.match(repos, /props\.edited\s+\? void ask\(/)
  assert.match(settings, /if \(missing\) return setSaveError\(`Not saved\. \$\{missing\}`\)/)
  assert.match(settings, /onSave=\{save\}/)
  assert.match(settings, /replace=\{setForm\}/)
  // Esc and a click outside both go through dismiss; narrow is full screen.
  assert.match(modal, /useBackStep\(props\.kind \?\? 'modal', true, props\.backLabel \?\? 'Close the dialog', dismiss\)/)
  assert.match(modal, /data-modal-backdrop onClick=\{dismiss\}/)
  assert.match(modal, /narrow\s*\? \{ width: '100%', height: '100%'/)
  assert.match(modal, /aria-modal="true"/)
})

test('Add plugin steps 1 and 3 use the shared radio fold-out', () => {
  const plugin = source('AddPlugin.tsx')
  assert.match(plugin, /<RadioFold\s+name="avoozl-plugin-source"/)
  assert.match(plugin, /<RadioFold\s+name="avoozl-plugin-scope"/)
  assert.match(plugin, /disabled: blocked,/)
  assert.match(plugin, /Publish it in \.avoozl\.json/)
  assert.doesNotMatch(plugin, /<ChoiceCards|<Fold\b/)
})

test('Add rule set is the panel main action, styled like Add plugin and Add repository', () => {
  const rules = source('ContentRulesSettings.tsx')
  assert.match(rules, /<IconLabel icon=\{Plus\} primary onClick=\{\(\) => props\.onSelect\(\{ kind: 'new' \}\)\}[^>]*>\s*Add rule set/)
  assert.match(rules, /<h3 className="text-sm font-semibold">Your rule sets<\/h3>\s*\{!\(value && !value\.sets\.length\) && add\}/)
  assert.match(rules, /data-rule-empty>[\s\S]*?\{add\}/)
  assert.match(source('AddPlugin.tsx'), /<IconLabel\s+icon=\{Plus\}\s+primary/)
  assert.match(source('RepositoriesSettings.tsx'), /<IconLabel icon=\{Plus\} primary onClick=\{props\.onAdd\}>/)
})

test('the add-workspace choices have a How to add heading', () => {
  assert.match(source('WorkspaceView.tsx'), /<h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted" data-add-how>\s*How to add:\s*<\/h4>/)
})

test('Settings opens on Workspaces each visit and drops an unknown tab', async () => {
  const { settingsTabOnEnter, SETTINGS_HOME } = await import('../src/settings-api.ts')
  const tabs = ['workspaces', 'repositories', 'github', 'plugins', 'content']
  assert.equal(SETTINGS_HOME, 'workspaces')
  // A new visit from another tab, even with a remembered inner tab.
  assert.equal(settingsTabOnEnter('dashboard', 'settings', 'plugins', tabs), 'workspaces')
  // Staying in Settings keeps the inner tab.
  assert.equal(settingsTabOnEnter('settings', 'settings', 'plugins', tabs), 'plugins')
  // A remembered tab that no longer exists.
  assert.equal(settingsTabOnEnter('settings', 'settings', 'people', tabs), 'workspaces')
  const app = source('App.tsx')
  assert.match(app, /useState<SettingsTab>\(SETTINGS_HOME\)/)
  assert.match(app, /settingsTab: settingsTabOnEnter\(tab, key, settingsTab,/)
  assert.match(source('SettingsView.tsx'), /SETTINGS_TABS\.some\(\(t\) => t\.key === asked\) \? asked : SETTINGS_HOME/)
})

test('the drawer width clamps to the page and is kept per workspace', async () => {
  const { DRAWER_DEFAULT, DRAWER_MIN, clampDrawer, readDrawerWidth, stepDrawer, writeDrawerWidth } = await import('../src/drawer-width.ts')
  assert.equal(clampDrawer(100, 1440), DRAWER_MIN)
  assert.equal(clampDrawer(5000, 1440), Math.floor(1440 * 0.9))
  assert.equal(clampDrawer(700, 1440), 700)
  assert.equal(clampDrawer(Number.NaN, 1440), DRAWER_DEFAULT)
  assert.equal(clampDrawer(500, 300), 300, 'never wider than a tiny page')
  assert.equal(stepDrawer(600, 'ArrowLeft'), 640)
  assert.equal(stepDrawer(600, 'ArrowRight'), 560)
  assert.equal(stepDrawer(600, 'Tab'), null)
  const saved = new Map()
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) }
  assert.equal(readDrawerWidth(storage, 'a'), DRAWER_DEFAULT)
  writeDrawerWidth(storage, 'a', 800)
  assert.equal(readDrawerWidth(storage, 'a'), 800)
  assert.equal(readDrawerWidth(storage, 'b'), DRAWER_DEFAULT, 'each workspace keeps its own')
  writeDrawerWidth(storage, 'a', DRAWER_DEFAULT)
  assert.equal(saved.size, 0, 'the default is not stored')
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /\{!narrow && \(\s*<DrawerHandle/)
  assert.match(drawer, /role="separator"/)
  assert.match(drawer, /cursor: 'col-resize'/)
  assert.match(drawer, /onDoubleClick=\{props\.onReset\}/)
})
