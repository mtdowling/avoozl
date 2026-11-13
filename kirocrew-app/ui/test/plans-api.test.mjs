// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterRows,
  rowChoices,
  UNCATEGORIZED,
  approveBlocker,
  changeMessage,
  groupByCategory,
  progressPercent,
  rowActions,
  describeWrite,
  location,
  plansClient,
  plansWithoutFolder,
  specStatus,
  writesByRepository,
} from '../src/plans-api.ts'
import { COMMAND_PATH } from '../src/workspace-api.ts'

function fakeApi(reply) {
  const calls = []
  return {
    calls,
    api: {
      post: async (path, body) => {
        calls.push({ path, body })
        return { result: reply(body) }
      },
    },
  }
}

const hash = 'a'.repeat(64)

test('plans client names the workspace on every call', async () => {
  const { api, calls } = fakeApi(() => ({}))
  const client = plansClient(api)
  await client.specs('ws')
  await client.get('ws', 'config')
  await client.store('ws', 'config')
  await client.reload('ws', 'config', hash)
  assert.ok(calls.every((call) => call.path === COMMAND_PATH))
  assert.deepEqual(
    calls.map((call) => call.body),
    [
      { operation: 'plan.specs', input: {}, workspaceId: 'ws' },
      { operation: 'plan.get', input: { id: 'config' }, workspaceId: 'ws' },
      { operation: 'plan.create', input: { spec: 'config' }, workspaceId: 'ws' },
      { operation: 'plan.save', input: { id: 'config', expectedHash: hash }, workspaceId: 'ws' },
    ],
  )
})

test('approve sends the shown hash and the previewed database revision', async () => {
  const { api, calls } = fakeApi((body) =>
    body.operation === 'plan.preview' ? { reviewedHash: hash, expectedRevision: 7 } : { id: 'receipt' },
  )
  await plansClient(api).approve('ws', 'config', hash)
  assert.deepEqual(calls[1].body, {
    operation: 'plan.approve',
    input: { id: 'config', expectedHash: hash, expectedRevision: 7 },
    workspaceId: 'ws',
  })
})

test('approve refuses when the stored revision moved since it was shown', async () => {
  const { api, calls } = fakeApi(() => ({ reviewedHash: 'b'.repeat(64), expectedRevision: 7 }))
  await assert.rejects(plansClient(api).approve('ws', 'config', hash), /Reload it before approving/)
  assert.equal(calls.length, 1, 'no approve call is sent')
})

test('a spec row reads as one line', () => {
  const spec = (plan, error = 0) => ({ counts: { error, warning: 0, info: 0 }, plan })
  const stored = { id: 'config', state: 'draft', hash, revision: 2, changed: false, approved: false }
  assert.equal(specStatus(spec(null, 2)), 'Not imported · 2 errors')
  assert.equal(specStatus(spec(stored, 1)), 'Draft · revision 2 · 1 error')
  assert.equal(specStatus(spec({ ...stored, changed: true })), 'Changed on disk · valid')
  assert.equal(specStatus(spec({ ...stored, approved: true })), 'Approved · revision 2')
})

test('approve is off until the revision is stored, current, unapproved, and valid', () => {
  const plan = {
    hash,
    disk: { changed: false },
    approvals: [],
    quality: { canApprove: true },
  }
  assert.match(approveBlocker(null), /Store this spec/)
  assert.match(approveBlocker({ ...plan, disk: { changed: true } }), /changed on disk/)
  assert.match(approveBlocker({ ...plan, approvals: [{ hash }] }), /is approved/)
  assert.match(approveBlocker({ ...plan, quality: { canApprove: false } }), /Fix the errors/)
  assert.equal(approveBlocker(plan), null)
  assert.equal(location({ file: 'avoozl/manifest.json', lineStart: 4 }), 'avoozl/manifest.json:4')
  assert.equal(location({ lineStart: 2 }), 'tasks.md:2')
})

test('the GitHub preview reads one plan and lines up its writes by repository', async () => {
  const { api, calls } = fakeApi(() => ({ writes: [] }))
  await plansClient(api).projection('ws', 'config')
  assert.deepEqual(calls[0].body, {
    operation: 'github.project.preview',
    input: { planId: 'config' },
    workspaceId: 'ws',
  })
  const writes = [
    { kind: 'issue.create', repository: 'o/a', taskId: 't1', issue: null, title: 'First', type: 'Epic' },
    { kind: 'blocker.add', repository: 'o/b', taskId: 't2', issue: 4, blockerTaskId: 't1' },
    { kind: 'project.fields', repository: 'o/a', taskId: 't1', issue: null, fields: { Release: 'one', Wave: 1 } },
    { kind: 'issue.update', repository: 'o/a', taskId: 't3', issue: 9, fields: ['body', 'title'] },
  ]
  assert.deepEqual(
    writes.map(describeWrite),
    [
      'Create t1: First (Epic)',
      't2 blocked by t1',
      'Set Release one, Wave 1 on t1',
      'Update t3 (#9): body, title',
    ],
  )
  assert.deepEqual(
    writesByRepository(writes).map(([repository, list]) => [repository, list.length]),
    [
      ['o/a', 3],
      ['o/b', 1],
    ],
  )
})

test('stored plans with no spec folder are listed beside the folders', () => {
  const specs = {
    root: '/plans',
    items: [{ name: 'config', plan: { id: 'config' } }, { name: 'draft', plan: null }],
  }
  const stored = {
    total: 2,
    items: [
      { id: 'config', state: 'approved' },
      { id: 'shared-incremental-compiler', state: 'approved' },
    ],
  }
  assert.deepEqual(
    plansWithoutFolder(specs, stored).map((plan) => plan.id),
    ['shared-incremental-compiler'],
  )
  // A mode that finds no folders still lists every stored plan.
  assert.equal(plansWithoutFolder(null, stored).length, 2)
})

const row = (name, extra = {}) => ({
  key: `spec::${name}`,
  kind: 'spec',
  name,
  spec: name,
  folder: `.kiro/specs/${name}/`,
  planId: null,
  type: 'feature',
  category: null,
  categoryProblem: null,
  errors: 0,
  status: 'not imported',
  tasks: { total: 0, done: 0 },
  now: { ready: 0, running: 0, needsYou: 0 },
  epics: 0,
  lastChange: null,
  ...extra,
})

test('rows group by authored category, Uncategorized last', () => {
  const groups = groupByCategory([
    row('zeta'),
    row('beta', { category: 'Runtime' }),
    row('alpha', { category: 'Runtime' }),
    row('gamma', { category: 'Compiler' }),
  ])
  assert.deepEqual(
    groups.map((g) => [g.category, g.rows.map((r) => r.name)]),
    [
      ['Compiler', ['gamma']],
      ['Runtime', ['alpha', 'beta']],
      [UNCATEGORIZED, ['zeta']],
    ],
  )
})

test('progress is done over total, and no tasks is not 0%', () => {
  assert.equal(progressPercent({ total: 0, done: 0 }), null)
  assert.equal(progressPercent({ total: 3, done: 1 }), 33)
  assert.equal(progressPercent({ total: 4, done: 4 }), 100)
})

test('row buttons follow the row', () => {
  assert.deepEqual(rowActions(row('a')), { review: true, scoped: true, importable: true, deletable: false, archivable: false, unarchivable: false })
  assert.deepEqual(rowActions(row('a', { status: 'approved', planId: 'a' })), { review: false, scoped: true, importable: false, deletable: true, archivable: true, unarchivable: false })
  assert.deepEqual(rowActions(row('a', { kind: 'old-style', spec: null, planId: 'p', status: 'draft' })), {
    review: false,
    scoped: true,
    importable: false,
    deletable: true,
    archivable: true,
    unarchivable: false,
  })
  const archived = rowActions(row('a', { status: 'approved', planId: 'a', archived: { at: 't', by: 'Owner' } }))
  assert.deepEqual([archived.archivable, archived.unarchivable, archived.deletable], [false, true, true])
})

test('Plan a change drafts a message for that plan and never approves', () => {
  const message = changeMessage(row('config', { planId: 'config' }))
  assert.match(message, /\.kiro\/specs\/config\/ \(plan config\)/)
  assert.match(message, /Do not approve it/)
  assert.match(changeMessage(row('x', { kind: 'old-style', spec: null, planId: 'old' })), /stored plan old, which has no spec folder/)
})

test('the table is one plan.table call', async () => {
  const { api, calls } = fakeApi(() => ({ items: [] }))
  await plansClient(api).table('ws')
  assert.deepEqual(calls[0].body, { operation: 'plan.table', input: {}, workspaceId: 'ws' })
})

test('the Plans list filters by text, category, status, kind and what a plan has', () => {
  const rows = [
    row('alpha', { category: 'Runtime', now: { ready: 2, running: 0, needsYou: 0 } }),
    row('beta', { category: 'Compiler', status: 'approved', planId: 'beta', now: { ready: 0, running: 1, needsYou: 0 } }),
    row('gamma', { kind: 'old-style', spec: null, planId: 'g', status: 'draft', now: { ready: 0, running: 0, needsYou: 3 } }),
  ]
  const names = (filter) => filterRows(rows, filter).map((r) => r.name)
  assert.deepEqual(names({}), ['alpha', 'beta', 'gamma'])
  assert.deepEqual(names({ q: 'ALP' }), ['alpha'])
  assert.deepEqual(names({ category: 'Compiler' }), ['beta'])
  assert.deepEqual(names({ category: UNCATEGORIZED }), ['gamma'])
  assert.deepEqual(names({ status: 'not imported' }), ['alpha'])
  assert.deepEqual(names({ kind: 'old-style' }), ['gamma'])
  assert.deepEqual(names({ has: 'ready' }), ['alpha'])
  assert.deepEqual(names({ has: 'running' }), ['beta'])
  assert.deepEqual(names({ has: 'needs-you' }), ['gamma'])
  assert.deepEqual(rowChoices(rows).categories, ['Compiler', 'Runtime', UNCATEGORIZED])
})
