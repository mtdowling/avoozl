// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMMAND_PATH,
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
