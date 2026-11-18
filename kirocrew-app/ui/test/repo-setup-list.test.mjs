// Settings > Repository setup as a compact list: View, Edit and Remove per
// row, and a private mirror as a role of a repository.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MIRROR_ROLE, emptyMirror, emptyRepository, mirrorSourceOf, mirrorSourceProblem, toForm, toPolicy, withRepositoryEdit } from '../src/settings-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const base = () => toForm({ mode: 'plans-repo', planningRepository: 'o/plans', repositories: { 'o/pub': { baseBranch: 'main', role: 'code' }, 'o/plans': { baseBranch: 'main', role: 'planning' } } })
const row = (github) => ({ github, branch: 'main', policy: -1 })

test('the list has no detail fields and no inline role control', () => {
  const list = source('RepositoriesSettings.tsx').slice(source('RepositoriesSettings.tsx').indexOf('export function RepositoryList'), source('RepositoriesSettings.tsx').indexOf('// What the Are you sure'))
  assert.doesNotMatch(list, /row\.folder|row\.branch|<select|<Input|<code>/)
  assert.match(list, /<Badge>\{props\.roleText\(row\)\}<\/Badge>/)
  for (const icon of ['Eye', 'Pencil', 'Trash2']) assert.match(list, new RegExp(`icon=\\{${icon}\\}`))
  assert.match(list, /<DangerBtn icon=\{Trash2\} label=\{`Remove \$\{row\.name\}`\} tooltip="Remove"/)
})

test('Remove asks Are you sure? naming the repository before it removes', () => {
  const list = source('RepositoriesSettings.tsx')
  assert.match(list, /confirm=\{removeCopy\(row\)\} onConfirm=\{\(\) => props\.onRemove\(row\)\}/)
  assert.match(list, /Are you sure\?[\s\S]*Remove \$\{row\.name\} from this workspace/)
})

test('View is a read-only dialog; Edit has role, Save and Cancel in the shared modal footer', () => {
  const modals = source('RepositoryModals.tsx')
  const view = modals.slice(modals.indexOf('export function ViewRepository'), modals.indexOf('export function EditRepository'))
  assert.match(view, /<Modal\s+id="avoozl-repo-view"\s+title=\{row\.name\}/)
  assert.doesNotMatch(view, /<Input|<select|<textarea|Save/)
  assert.doesNotMatch(view, /footer=|dismissLabel/) // the shell's footer Close is the only one
  const edit = modals.slice(modals.indexOf('export function EditRepository'))
  assert.match(edit, /<Modal\s+id="avoozl-repo-edit"\s+title=\{row\.name\}/)
  assert.match(edit, /<RoleChoice/)
  assert.match(edit, /dismissLabel="Cancel"/)
  assert.doesNotMatch(edit, /<Btn[^>]*>\s*Cancel/) // the shell's footer Cancel is the only one
  assert.match(edit, /Save/)
})

test('a private mirror role writes the config the old Mirror box wrote', () => {
  const next = withRepositoryEdit(base(), row('o/pub-private'), { entry: null, role: MIRROR_ROLE, source: 'o/pub' })
  const policy = toPolicy(next)
  assert.deepEqual({ source: policy.repositories['o/pub'].mirror.source, mirror: policy.repositories['o/pub'].mirror.mirror }, { source: 'o/pub', mirror: 'o/pub-private' })
  // The old box typed the same two names into the public repository's entry.
  const old = base()
  old.repositories[0].mirror = { ...emptyMirror(), source: 'o/pub', mirror: 'o/pub-private' }
  assert.deepEqual(toPolicy(next), toPolicy(old))
  assert.equal(mirrorSourceOf(next, 'o/pub-private'), 'o/pub')
})

test('changing a mirror to another role clears its mirror setting', () => {
  const mirrored = withRepositoryEdit(base(), row('o/pub-private'), { entry: null, role: MIRROR_ROLE, source: 'o/pub' })
  const back = withRepositoryEdit(mirrored, row('o/pub-private'), { entry: null, role: 'code', source: '' })
  assert.equal(mirrorSourceOf(back, 'o/pub-private'), '')
  assert.equal(toPolicy(back).repositories['o/pub'].mirror, undefined)
})

test('a mirror needs an owner/name public repository that is another repository', () => {
  assert.match(mirrorSourceProblem('pub', 'o/m'), /owner\/name/)
  assert.match(mirrorSourceProblem('o/m', 'o/m'), /different/)
  assert.equal(mirrorSourceProblem('o/pub', 'o/m'), null)
})

test('an edited entry replaces the saved one by name, and a role change keeps it', () => {
  const form = base()
  const edited = { ...form.repositories[0], coder: 'issue-radar' }
  const next = withRepositoryEdit(form, { github: 'o/pub', branch: 'main', policy: 7 }, { entry: edited, role: 'both', source: '' })
  const entry = next.repositories.find((e) => e.name === 'o/pub')
  assert.equal(entry.coder, 'issue-radar')
  assert.equal(entry.role, 'both')
  assert.deepEqual(emptyRepository('x').mirror, emptyMirror())
})
