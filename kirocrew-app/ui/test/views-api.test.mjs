// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import {
  canSupersede,
  githubReviewLabel,
  graphSummary,
  linkHref,
  safeHref,
  scalarFields,
  sessionLabel,
  supersedeInput,
  verdictLabel,
  viewsClient,
} from '../src/views-api.ts'

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

const task = (id, extra = {}) => ({
  id,
  title: 'Task ' + id,
  epic: 'e1',
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: null,
  status: 'planned',
  complete: false,
  ready: false,
  decision: null,
  issue: null,
  ...extra,
})

const graph = {
  revision: 3,
  epics: [
    { id: 'e1', title: 'First', count: 3 },
    { id: 'e2', title: 'Second', count: 1 },
  ],
  statuses: [],
  repositories: [],
  total: 5,
  tasks: [
    task('loose', { epic: null }),
    task('x', { epic: 'e2', ready: true }),
    task('b', { ready: true }),
    task('c'),
    task('top', { kind: 'epic' }),
  ],
  edges: [
    { from: 'a', to: 'b', kind: 'requires', condition: null, blocking: true, satisfied: true },
    { from: 'b', to: 'c', kind: 'requires', condition: 'integrated', blocking: true, satisfied: false },
    { from: 'b', to: 'x', kind: 'supports', condition: null, blocking: false, satisfied: true },
  ],
}

test('views client reads each view for the chosen workspace', async () => {
  const { api, calls } = fakeApi((body) => (body.operation === 'graph.view' ? graph : { items: [] }))
  const client = viewsClient(api)
  await client.graph('w', { epic: 'e1', status: '' })
  assert.deepEqual(await client.delivery('w'), [])
  assert.deepEqual(await client.conflicts('w'), [])
  assert.ok(calls.every((call) => call.path === COMMAND_PATH))
  assert.deepEqual(
    calls.map((call) => call.body),
    [
      { operation: 'graph.view', input: { epic: 'e1' }, workspaceId: 'w' },
      { operation: 'delivery.view', input: {}, workspaceId: 'w' },
      { operation: 'conflicts.view', input: {}, workspaceId: 'w' },
    ],
  )
})

test('graph summary counts tasks, blocking edges and ready leaves', () => {
  assert.deepEqual(graphSummary(graph), { tasks: 5, edges: 3, blocking: 2, ready: 2 })
})

test('only http and https links are clickable', () => {
  assert.equal(safeHref('https://github.com/o/r/pull/1'), 'https://github.com/o/r/pull/1')
  assert.equal(safeHref('javascript:alert(1)'), null)
  assert.equal(safeHref('file:///etc/passwd'), null)
  assert.equal(safeHref('/tmp/receipt.md'), null)
  assert.equal(safeHref(null), null)
})

test('every link goes through linkHref or safeHref', () => {
  // Kiro Crew's own pages and chats pass; anything else is not a link.
  assert.equal(linkHref('/chat?sid=chat-9'), '/chat?sid=chat-9')
  assert.equal(linkHref('/issue-radar'), '/issue-radar')
  assert.equal(linkHref('/code-review-sage'), '/code-review-sage')
  assert.equal(linkHref('/apps/avoozl'), '/apps/avoozl')
  assert.equal(linkHref('https://github.com/o/r'), 'https://github.com/o/r')
  for (const bad of ['javascript:alert(1)', '//evil.example/x', '/tmp/receipt.md', '/chat?sid=a b', 'data:text/html,x', null, 7])
    assert.equal(linkHref(bad), undefined, String(bad))
  const dir = new URL('../src/', import.meta.url)
  const raw = []
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const text = fs.readFileSync(new URL(file, dir), 'utf8')
    for (const match of text.matchAll(/\bhref=\{([^}]*)/g))
      // editorHref builds only kiro:// or vscode:// file links from an absolute path.
      if (!/^\s*(linkHref|safeHref|editorHref)\(/.test(match[1])) raw.push(`${file}: href={${match[1]}`)
  }
  assert.deepEqual(raw, [])
})

test('session and record labels', () => {
  assert.equal(
    sessionLabel({ slot: 's', role: 'worker', attempt: 2, title: null, status: null, statusAt: null, boundAt: null }),
    'worker #2 · not observed',
  )
  assert.deepEqual(scalarFields({ taskId: 't', commit: 'abc', ok: true, nested: { a: 1 } }), [
    ['commit', 'abc'],
    ['ok', 'true'],
  ])
})

test('session labels show requested vs served model', () => {
  const session = { slot: 's', role: 'review:a', attempt: 1, title: null, status: 'idle', statusAt: null, boundAt: null, model: 'm-b' }
  assert.equal(sessionLabel({ ...session, served: null }), 'review:a #1 · idle · requested m-b, served model not reported')
  assert.equal(
    sessionLabel({ ...session, served: { model: 'auto', withheld: true, changed: false } }),
    'review:a #1 · idle · requested m-b, served auto (withheld)',
  )
  assert.equal(
    sessionLabel({ ...session, served: { model: 'm-b', withheld: false, changed: false } }),
    'review:a #1 · idle · requested m-b, served m-b',
  )
  const verdict = { role: 'a', attempt: 1, outcome: 'refused', verdict: 'approved', model: 'm-b', served: 'auto', commit: null, stale: false, cause: null }
  assert.equal(verdictLabel(verdict), 'a · approved refused · m-b → served auto')
})

test('supersede sends the chosen task and only the fields the person filled', async () => {
  const { api, calls } = fakeApi(() => ({ superseded: { id: 'a' }, task: { id: 'a-r2' } }))
  await viewsClient(api).supersede('w', 'a', supersedeInput({ id: '  ', title: ' New title ' }))
  assert.deepEqual(calls[0].body, {
    operation: 'task.supersede',
    input: { id: 'a', create: { title: 'New title' } },
    workspaceId: 'w',
  })
  assert.deepEqual(supersedeInput({ id: 'a-new', title: '' }), { id: 'a-new' })
})

test('only a local task not already replaced offers supersede', () => {
  const item = (extra) => ({ id: 'a', title: 'A', status: 'planned', authority: 'local', ...extra })
  assert.equal(canSupersede(item({})), true)
  assert.equal(canSupersede(item({ authority: undefined })), true)
  assert.equal(canSupersede(item({ authority: 'github' })), false)
  assert.equal(canSupersede(item({ authority: 'plugin:tracker' })), false)
  assert.equal(canSupersede(item({ status: 'superseded' })), false)
  assert.equal(canSupersede(item({ supersededBy: 'a-r2' })), false)
})

test('a GitHub review label says when it is stale or ignored', () => {
  const base = { reviewer: 'ana', state: 'approved', commit: 'a'.repeat(40), stale: false, allowed: true, reason: null }
  assert.equal(githubReviewLabel(base), 'ana · approved')
  assert.equal(githubReviewLabel({ ...base, stale: true }), `ana · approved · stale (${'a'.repeat(12)})`)
  assert.equal(
    githubReviewLabel({ ...base, allowed: false, reason: 'ana is not an allowed actor.' }),
    'ana · approved · ignored: ana is not an allowed actor.',
  )
})

test('resolution actions call the shared operations, with the revision where they take one', async () => {
  const calls = []
  const client = viewsClient({
    post: async (path, body) => {
      calls.push(body)
      return { result: {} }
    },
  })
  await client.resolveConflict('w1', 'a.1', 'title', 'github')
  await client.updateTask('w1', 'a.2', { needsReview: false }, 41)
  await client.retry('w1', 'a.3')
  assert.deepEqual(calls, [
    { operation: 'github.conflict.resolve', input: { taskId: 'a.1', field: 'title', choice: 'github' }, workspaceId: 'w1' },
    { operation: 'task.update', input: { id: 'a.2', needsReview: false }, workspaceId: 'w1', expectedRevision: 41 },
    { operation: 'delivery.retry', input: { taskId: 'a.3', dismiss: [] }, workspaceId: 'w1' },
  ])
})

test('prFeedbackLine shows rounds out of the bound, the latest round, and a stop', async () => {
  const { prFeedbackLine } = await import('../src/views-api.ts')
  const base = { pullRequest: null, rounds: 2, bound: 5, session: 'w', stopped: null, notRelayed: 0, notRelayedLinks: [], error: null }
  assert.equal(prFeedbackLine({ ...base, latest: null }), '2 of 5 rounds')
  assert.equal(
    prFeedbackLine({ ...base, latest: { kinds: ['check', 'auto-merge'], at: 't', to: 'new attempt' }, stopped: 'same-check' }),
    '2 of 5 rounds · last: failed checks, auto-merge off, carried to a new attempt · stopped: the same check failed 3 times',
  )
})
