// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMMAND_PATH,
  describeTick,
  errorMessage,
  workspaceClient,
} from '../src/workspace-api.ts'

// A stand-in for the host's useAppApi() that records each POST.
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

test('workspace client sends each operation to the backend command route', async () => {
  const { api, calls } = fakeApi((body) =>
    body.operation === 'repositories.list' ? { items: [{ id: 'app' }] } : { ok: body.operation },
  )
  const client = workspaceClient(api)
  await client.list()
  await client.add({ id: 'a', root: '/a' })
  await client.init({ id: 'b', root: '/b', name: 'B' })
  assert.deepEqual(await client.repositories('a'), [{ id: 'app' }])
  await client.registerRepository('a', { id: 'app', localCheckout: '/c' })
  await client.tick('a')
  await client.tickHealth('a')
  assert.ok(calls.every((call) => call.path === COMMAND_PATH))
  assert.equal(COMMAND_PATH, '/apps/avoozl/api/command')
  assert.deepEqual(
    calls.map((call) => call.body),
    [
      { operation: 'workspaces.list', input: {} },
      { operation: 'workspaces.add', input: { id: 'a', root: '/a' } },
      { operation: 'workspaces.init', input: { id: 'b', root: '/b', name: 'B' } },
      { operation: 'repositories.list', input: {}, workspaceId: 'a' },
      {
        operation: 'repositories.configure',
        input: { id: 'app', localCheckout: '/c' },
        workspaceId: 'a',
      },
      { operation: 'workspace.tick', input: {}, workspaceId: 'a' },
      { operation: 'workspace.tick.health', input: {}, workspaceId: 'a' },
    ],
  )
})

test('errors show the backend sentence, else the status', () => {
  assert.equal(
    errorMessage({ status: 409, body: JSON.stringify({ error: 'Workspace a is already registered.' }) }),
    'Workspace a is already registered.',
  )
  assert.equal(errorMessage({ status: 502, body: '<html>' }), 'Request failed (502).')
  assert.equal(errorMessage(new Error('offline')), 'offline')
})

test('tick health reads as one line', () => {
  const now = Date.parse('2026-11-11T12:00:00Z'),
    at = '2026-11-11T11:59:30Z'
  const cases = [
    [null, 'Not loaded'],
    [{ lastRun: null, lock: null }, 'Never run'],
    [{ lastRun: { at, outcome: 'ok', policy: 'loaded' }, lock: null }, 'Ran 30s ago; policy loaded'],
    [{ lastRun: { at, outcome: 'locked' }, lock: null }, 'Skipped 30s ago: another tick held the lock'],
    [{ lastRun: { at, outcome: 'error', error: 'boom' }, lock: null }, 'Failed 30s ago: boom'],
    [
      { lastRun: { at, outcome: 'ok', policy: 'invalid', error: 'bad' }, lock: null },
      'Ran 30s ago; .avoozl.json is invalid: bad',
    ],
    [{ lastRun: null, lock: { pid: 7, live: true } }, 'Running (pid 7)'],
    [{ lastRun: null, lock: { pid: 7, live: false } }, 'Stale lock (pid 7)'],
    [{ lastRun: { outcome: 'ok', at: '2026-11-11T11:50:00Z', policy: 'absent' }, lock: null }, 'Ran 10m ago; policy absent'],
  ]
  for (const [health, expected] of cases) assert.equal(describeTick(health, now), expected)
})

test('pickDefault keeps a live choice and falls back to the served workspace', async () => {
  const { pickDefault } = await import('../src/workspace-api.ts')
  const list = {
    defaultWorkspace: 'b',
    items: [{ id: 'a' }, { id: 'b' }, { id: 'c', served: true }],
  }
  assert.equal(pickDefault(list, 'a'), 'a')
  assert.equal(pickDefault(list, 'gone'), 'c')
  assert.equal(pickDefault({ defaultWorkspace: null, items: [] }, 'gone'), null)
})

test('page state round-trips and survives bad or blocked storage', async () => {
  const { PAGE_STATE_KEY, readPageState, writePageState } = await import('../src/workspace-api.ts')
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  writePageState(storage, { workspaceId: 'w1' })
  assert.deepEqual(readPageState(storage), { workspaceId: 'w1' })
  store.set(PAGE_STATE_KEY, '{not json')
  assert.deepEqual(readPageState(storage), { workspaceId: null })
  assert.deepEqual(readPageState(null), { workspaceId: null })
  const blocked = {
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  assert.doesNotThrow(() => writePageState(blocked, { workspaceId: null }))
})

test('a tab saved by any earlier page is not restored, so the page opens on the Dashboard', async () => {
  const { PAGE_STATE_KEY, readPageState } = await import('../src/workspace-api.ts')
  for (const tab of ['workspace', 'settings', 'graph']) {
    const storage = { getItem: (k) => (k === PAGE_STATE_KEY ? JSON.stringify({ tab, workspaceId: 'w1' }) : null) }
    assert.deepEqual(readPageState(storage), { workspaceId: 'w1' })
  }
})
