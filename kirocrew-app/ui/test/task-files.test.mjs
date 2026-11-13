// The task drawer's Files fold (design §8.10): the tree, the diff in
// unified and split form, Open in editor links, and the fold's wiring.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { diffSummary, editorHref, fileTree, filesClient, firstChangedLine, joinPath, parseDiff, readEditor, splitRows, statusCounts, writeEditor } from '../src/files-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const change = (path, status = 'modified', extra = {}) => ({ path, from: null, status, additions: 1, deletions: 0, binary: false, ...extra })

const DIFF = [
  'diff --git a/keep.txt b/keep.txt',
  'index 1..2 100644',
  '--- a/keep.txt',
  '+++ b/keep.txt',
  '@@ -1,3 +1,4 @@',
  ' one',
  '-two',
  '-three',
  '+TWO',
  '+THREE',
  '+four',
  ' end',
  '\\ No newline at end of file',
  '',
].join('\n')

test('the reads ask task.files and task.diff for one task', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push([path, body]), { result: { ok: true } }) }
  const client = filesClient(api)
  await client.files('w', 'a')
  await client.files('w', 'a', true)
  await client.diff('w', 'a', 'src/x.ts')
  assert.deepEqual(calls, [
    [COMMAND_PATH, { operation: 'task.files', input: { taskId: 'a' }, workspaceId: 'w' }],
    [COMMAND_PATH, { operation: 'task.files', input: { taskId: 'a', all: true }, workspaceId: 'w' }],
    [COMMAND_PATH, { operation: 'task.diff', input: { taskId: 'a', path: 'src/x.ts' }, workspaceId: 'w' }],
  ])
})

test('the tree puts folders first, joins single-folder chains, and marks changed files', () => {
  // Nearby inputs: a deep single chain, a file beside a folder, an unchanged
  // file from Show all files, and a rename.
  const files = [change('src/app/a.ts', 'added'), change('README.md'), change('src/app/b.ts', 'renamed', { from: 'src/app/old.ts' })]
  const tree = fileTree(['src/app/c.ts', 'docs/deep/guide.md'], files)
  assert.deepEqual(
    tree.map((n) => [n.name, n.file]),
    [
      ['docs/deep', false],
      ['src/app', false],
      ['README.md', true],
    ],
  )
  const app = tree[1]
  assert.deepEqual(
    app.children.map((n) => [n.name, n.change?.status ?? null]),
    [
      ['a.ts', 'added'],
      ['b.ts', 'renamed'],
      ['c.ts', null],
    ],
  )
  assert.equal(app.children[1].change.from, 'src/app/old.ts')
  assert.equal(app.children[0].path, 'src/app/a.ts')
  assert.deepEqual(fileTree([], []), [])
  assert.equal(statusCounts(files), '1 added, 1 modified, 1 renamed')
})

test('a unified diff parses with line numbers, and split pairs removed with added lines', () => {
  const lines = parseDiff(DIFF)
  assert.deepEqual(
    lines.filter((l) => l.kind === 'meta').map((l) => l.text),
    ['diff --git a/keep.txt b/keep.txt', 'index 1..2 100644', '--- a/keep.txt', '+++ b/keep.txt', '\\ No newline at end of file'],
  )
  const text = lines.filter((l) => l.kind !== 'meta' && l.kind !== 'hunk').map((l) => [l.kind, l.old, l.new, l.text])
  assert.deepEqual(text, [
    ['context', 1, 1, 'one'],
    ['del', 2, null, 'two'],
    ['del', 3, null, 'three'],
    ['add', null, 2, 'TWO'],
    ['add', null, 3, 'THREE'],
    ['add', null, 4, 'four'],
    ['context', 4, 5, 'end'],
  ])
  assert.equal(firstChangedLine(lines), 2)
  const pairs = splitRows(lines)
    .filter((r) => r.kind === 'pair')
    .map((r) => [r.left?.text ?? null, r.right?.text ?? null])
  assert.deepEqual(pairs, [
    ['one', 'one'],
    ['two', 'TWO'],
    ['three', 'THREE'],
    [null, 'four'],
    ['end', 'end'],
  ])
  // An added-only hunk and an empty diff.
  assert.deepEqual(
    splitRows(parseDiff('@@ -0,0 +1,1 @@\n+x\n')).map((r) => r.kind),
    ['hunk', 'pair'],
  )
  assert.deepEqual(parseDiff(''), [])
})

test('binaries, large files, links and unchanged files are summarized, not drawn', () => {
  const base = { path: 'a', status: 'modified', from: null, additions: 3, deletions: 1, binary: false, tooLarge: false, diff: '' }
  assert.match(diffSummary({ ...base, binary: true }), /Binary/)
  assert.match(diffSummary({ ...base, tooLarge: true }), /Too large.*\+3 −1/)
  assert.match(diffSummary({ ...base, link: true }), /link/)
  assert.match(diffSummary({ ...base, status: 'unchanged' }), /did not change/)
  assert.equal(diffSummary({ ...base, diff: DIFF }), null)
})

test('Open in editor builds kiro:// or vscode:// file links for local paths only', () => {
  assert.equal(editorHref('kiro', '/home/me/wt'), 'kiro://file/home/me/wt')
  assert.equal(editorHref('vscode', '/home/me/wt/src/a b.ts', 12), 'vscode://file/home/me/wt/src/a%20b.ts:12')
  assert.equal(editorHref('vscode', 'C:\\wt\\src\\a.ts'), 'vscode://file/C:/wt/src/a.ts')
  assert.equal(editorHref('kiro', '/wt/#x?.ts'), 'kiro://file/wt/%23x%3F.ts')
  // Not an absolute path on this machine: no link.
  for (const bad of ['', 'relative/a.ts', 'https://example.com/a', 'javascript:alert(1)']) assert.equal(editorHref('kiro', bad), null, bad)
  assert.equal(joinPath('/home/me/wt/', 'src/a.ts'), '/home/me/wt/src/a.ts')
  assert.equal(joinPath('C:\\wt', 'src/a.ts'), 'C:\\wt\\src\\a.ts')
})

test('the editor choice is kept in the page storage, Kiro by default', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  assert.equal(readEditor(storage), 'kiro')
  writeEditor(storage, 'vscode')
  assert.equal(readEditor(storage), 'vscode')
  writeEditor(storage, 'kiro')
  assert.equal(store.size, 0)
  assert.equal(readEditor(null), 'kiro')
  assert.equal(readEditor({ getItem: () => 'evil' }), 'kiro')
})

test('the drawer has a Files fold that reads only once opened, with no write', () => {
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /label: 'Files'/)
  assert.match(drawer, /<Fold id="files" group="task-drawer" title="Files" onToggle=\{\(on\) => on && setFilesOpened\(true\)\}>/)
  assert.match(drawer, /<TaskFiles workspaceId=\{workspaceId\} taskId=\{task\.id\} active=\{filesOpened\} \/>/)
  const files = source('TaskFiles.tsx')
  assert.match(files, /if \(!props\.active\) return/)
  // Unified by default, Split on a toggle; Show all files; the editor
  // picker; GitHub's branch for a task on another machine.
  assert.match(files, /useState<'unified' \| 'split'>\('unified'\)/)
  assert.match(files, /Show all files/)
  assert.match(files, /data-open-worktree/)
  assert.match(files, /data-open-file/)
  assert.match(files, /const local = view\.mode === 'worktree' && !view\.remote && view\.worktree/)
  assert.match(files, /data-github-branch/)
  // Theme variables only, no fixed colors.
  assert.doesNotMatch(files, /#[0-9a-fA-F]{3,6}\b/)
  // Read-only: the fold calls only the two reads.
  assert.deepEqual([...source('files-api.ts').matchAll(/run<\w+>\('([\w.]+)'/g)].map((m) => m[1]), ['task.files', 'task.diff'])
})
