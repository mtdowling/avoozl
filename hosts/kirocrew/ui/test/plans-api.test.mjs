// Runs under node's type stripping: `node --test hosts/kirocrew/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterRows,
  rowChoices,
  NO_EPIC,
  sortRows,
  UNCATEGORIZED,
  approveBlocker,
  changeMessage,
  groupByCategory,
  progressPercent,
  rowActions,
  location,
  plansClient,
  revisionChange,
  specStatus,
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
  const { api, calls } = fakeApi((body) => (body.operation === 'plan.preview' ? { reviewedHash: hash, expectedRevision: 7 } : { id: 'receipt' }))
  await plansClient(api).approve('ws', 'config', hash)
  assert.deepEqual(calls[1].body, {
    operation: 'plan.approve',
    input: { id: 'config', expectedHash: hash, expectedRevision: 7 },
    workspaceId: 'ws',
  })
})

test('approve returns the moved revision instead of throwing, and sends nothing', async () => {
  const moved = { reviewedHash: 'b'.repeat(64), expectedRevision: 7 }
  const { api, calls } = fakeApi(() => moved)
  assert.deepEqual(await plansClient(api).approve('ws', 'config', hash), { changed: moved })
  assert.equal(calls.length, 1, 'no approve call is sent')
})

test('a move between the check and plan.approve reads as the same change; other refusals still throw', async () => {
  let previews = 0
  const { api } = fakeApi((body) => {
    if (body.operation === 'plan.preview') return { reviewedHash: previews++ ? 'b'.repeat(64) : hash, expectedRevision: 7 }
    throw new Error('The reviewed document hash changed.')
  })
  assert.equal((await plansClient(api).approve('ws', 'config', hash)).changed.reviewedHash, 'b'.repeat(64))
  const refused = fakeApi((body) => {
    if (body.operation === 'plan.preview') return { reviewedHash: hash, expectedRevision: 7 }
    throw new Error('The spec folder changed on disk.')
  })
  await assert.rejects(plansClient(refused.api).approve('ws', 'config', hash), /changed on disk/)
})

test('Make the GitHub issues sends spec.publish with the home repository, and none without one', async () => {
  const { api, calls } = fakeApi(() => ({ home: 'github', repository: 'o/plans', number: 4 }))
  assert.equal((await plansClient(api).publish('ws', 'config', 'o/plans')).number, 4)
  await plansClient(api).publish('ws', 'config', null)
  assert.deepEqual(
    calls.map((call) => call.body),
    [
      { operation: 'spec.publish', input: { planId: 'config', repository: 'o/plans' }, workspaceId: 'ws' },
      { operation: 'spec.publish', input: { planId: 'config' }, workspaceId: 'ws' },
    ],
  )
})

test('a revision change lists changed files with line counts', () => {
  const change = revisionChange({ hash: 'h1', files: { 'a.md': 'one\ntwo\n', 'b.md': 'same\n' } }, { hash: 'h2', files: { 'a.md': 'one\n2\nthree\n', 'b.md': 'same\n' } })
  assert.deepEqual(change, { from: 'h1', to: 'h2', files: [{ file: 'a.md', added: 2, removed: 1 }] })
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
  const groups = groupByCategory([row('zeta'), row('beta', { category: 'Runtime' }), row('alpha', { category: 'Runtime' }), row('gamma', { category: 'Compiler' })])
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
  assert.deepEqual(rowActions(row('a', { status: 'approved', planId: 'a' })), {
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
})

test('the table is one plan.table call', async () => {
  const { api, calls } = fakeApi(() => ({ items: [] }))
  await plansClient(api).table('ws')
  assert.deepEqual(calls[0].body, { operation: 'plan.table', input: {}, workspaceId: 'ws' })
})

test('the Plans list filters by text, category, status and what a plan has', () => {
  const rows = [
    row('alpha', { category: 'Runtime', now: { ready: 2, running: 0, needsYou: 0 } }),
    row('beta', { category: 'Compiler', status: 'approved', planId: 'beta', now: { ready: 0, running: 1, needsYou: 0 } }),
    row('gamma', { planId: 'g', status: 'draft', now: { ready: 0, running: 0, needsYou: 3 } }),
  ]
  const names = (filter) => filterRows(rows, filter).map((r) => r.name)
  assert.deepEqual(names({}), ['alpha', 'beta', 'gamma'])
  assert.deepEqual(names({ q: 'ALP' }), ['alpha'])
  assert.deepEqual(names({ category: 'Compiler' }), ['beta'])
  assert.deepEqual(names({ category: UNCATEGORIZED }), ['gamma'])
  assert.deepEqual(names({ status: 'not imported' }), ['alpha'])
  assert.deepEqual(names({ has: 'ready' }), ['alpha'])
  assert.deepEqual(names({ has: 'running' }), ['beta'])
  assert.deepEqual(names({ has: 'needs-you' }), ['gamma'])
  assert.deepEqual(rowChoices(rows).categories, ['Compiler', 'Runtime', UNCATEGORIZED])
})

test('the Specs list filters by epic and sorts by name, last update or tasks', () => {
  const rows = [
    row('beta', { epic: 'e1', epicTitle: 'Runtime', lastChange: '2026-11-10T00:00:00Z', tasks: { total: 9, done: 0 } }),
    row('alpha', { epic: null, lastChange: '2026-11-12T00:00:00Z', tasks: { total: 2, done: 0 } }),
    row('gamma', { epic: 'e1', epicTitle: 'Runtime', lastChange: null, tasks: { total: 9, done: 0 } }),
  ]
  assert.deepEqual(
    filterRows(rows, { epic: 'e1' }).map((r) => r.name),
    ['beta', 'gamma'],
  )
  assert.deepEqual(
    filterRows(rows, { epic: NO_EPIC }).map((r) => r.name),
    ['alpha'],
  )
  assert.deepEqual(rowChoices(rows).epics, [
    { value: 'e1', label: 'Runtime', count: 2 },
    { value: NO_EPIC, label: 'No epic', count: 1 },
  ])
  const names = (...args) => sortRows(rows, ...args).map((r) => r.name)
  assert.deepEqual(names(), ['alpha', 'beta', 'gamma'])
  assert.deepEqual(names('name', 'desc'), ['gamma', 'beta', 'alpha'])
  assert.deepEqual(names('updated'), ['alpha', 'beta', 'gamma'])
  assert.deepEqual(names('updated', 'asc'), ['gamma', 'beta', 'alpha'])
  // Equal task counts fall back to the name.
  assert.deepEqual(names('tasks'), ['beta', 'gamma', 'alpha'])
  assert.deepEqual(names('tasks', 'asc'), ['alpha', 'beta', 'gamma'])
})

test('a spec row has one chip: Draft, Approved, On GitHub or Done', async () => {
  const { specChip } = await import('../src/plans-api.ts')
  assert.equal(specChip({ status: 'draft' }), 'draft')
  assert.equal(specChip({ status: 'changed' }), 'draft')
  assert.equal(specChip({ status: 'not imported' }), 'draft')
  assert.equal(specChip({ status: 'approved' }), 'approved')
  assert.equal(specChip({ status: 'approved', onGitHub: true }), 'github')
  assert.equal(specChip({ status: 'done', onGitHub: true }), 'done')
})
