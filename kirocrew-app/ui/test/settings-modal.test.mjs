// Settings: in-place repository editing, the shared radio fold-out in Add
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

test('a repository edits in an Edit dialog with Save and Cancel, not in the list', () => {
  const repos = source('RepositoriesSettings.tsx')
  const settings = source('SettingsView.tsx')
  const modals = source('RepositoryModals.tsx')
  assert.doesNotMatch(settings, /data-repository-editor=\{row\.key\}|RepositoryDialog|DIALOG_SECTIONS|data-open-settings/)
  assert.doesNotMatch(repos, /<RepositoryEditor|RolePicker/)
  assert.match(modals, /<Modal\s+id="avoozl-repo-edit"/)
  assert.match(modals, /Cancel[\s\S]*Save/)
  assert.match(settings, /<SaveFooter\s+dirty=\{dirty\}/)
})

test('the shared Modal still asks before it discards edits', () => {
  const modal = source('ui/Modal.tsx')
  assert.match(modal, /useBackStep\(props\.kind \?\? 'modal', true, props\.backLabel \?\? 'Close the dialog', \(\) => \(latest\.current\.onBack \?\? dismiss\)\(\), dismiss\)/)
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
  assert.match(source('SettingsView.tsx'), /SETTINGS_TABS\.some\(\(t\) => t\.key === asked\) \? \(asked as SettingsTab\) : SETTINGS_HOME/)
})
