// Runs under node's type stripping: `node --test hosts/kirocrew/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH, errorMessage, workspaceClient } from '../src/workspace-api.ts'
import { fakeApi } from './fake-api.ts'

// A stand-in for the host's useAppApi() that records each POST.

test('workspace client sends each operation to the backend command route', async () => {
  const { api, calls } = fakeApi((body) => (body.operation === 'repositories.list' ? { items: [{ id: 'app' }] } : { ok: body.operation }))
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
  assert.equal(errorMessage({ status: 409, body: JSON.stringify({ error: 'Workspace a is already registered.' }) }), 'Workspace a is already registered.')
  assert.equal(errorMessage({ status: 502, body: '<html>' }), 'Request failed (502).')
  assert.equal(errorMessage(new Error('offline')), 'offline')
})

test('pickDefault keeps a live choice and falls back to the served workspace', async () => {
  const { pickDefault } = await import('../src/workspace-api.ts')
  const workspace = (id: string, served = false) => ({ id, name: id, root: `/w/${id}`, enabled: true, state: 'ready', served })
  const list = {
    defaultWorkspace: 'b',
    items: [workspace('a'), workspace('b'), workspace('c', true)],
  }
  assert.equal(pickDefault(list, 'a'), 'a')
  assert.equal(pickDefault(list, 'gone'), 'c')
  assert.equal(pickDefault({ defaultWorkspace: null, items: [] }, 'gone'), null)
})

test('page state round-trips and survives bad or blocked storage', async () => {
  const { PAGE_STATE_KEY, readPageState, writePageState } = await import('../src/workspace-api.ts')
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  writePageState(storage, { workspaceId: 'w1', tab: 'plans' })
  assert.deepEqual(readPageState(storage), { workspaceId: 'w1', tab: 'plans' })
  store.set(PAGE_STATE_KEY, '{not json')
  assert.deepEqual(readPageState(storage), { workspaceId: null, tab: null })
  assert.deepEqual(readPageState(null), { workspaceId: null, tab: null })
  const blocked = {
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  assert.doesNotThrow(() => writePageState(blocked, { workspaceId: null, tab: null }))
})

test('the last valid top-level tab is restored and stale tab names are ignored', async () => {
  const { PAGE_STATE_KEY, readPageState } = await import('../src/workspace-api.ts')
  for (const tab of ['settings', 'graph']) {
    const storage = { getItem: (k: string) => (k === PAGE_STATE_KEY ? JSON.stringify({ tab, workspaceId: 'w1' }) : null) }
    assert.deepEqual(readPageState(storage), { workspaceId: 'w1', tab })
  }
  const stale = { getItem: (k: string) => (k === PAGE_STATE_KEY ? JSON.stringify({ tab: 'workspace', workspaceId: 'w1' }) : null) }
  assert.deepEqual(readPageState(stale), { workspaceId: 'w1', tab: null })
})
