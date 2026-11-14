// Home's empty states: each missing piece is a card with a button, never a
// hidden section; and the driver session state from Kiro Crew's slot read.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DRIVER_HREF, driverFromSlot, readDriver } from '../src/driver-session-api.ts'
import { setupCards } from '../src/setup-api.ts'

const none = { repositories: 0, radarRepositories: 0, radarCrews: null, plans: 0, driver: 'none' }

test('a fresh workspace shows every empty state with its button', () => {
  const cards = setupCards(none)
  assert.deepEqual(cards.map((c) => c.id), ['repository', 'driver', 'epics'])
  assert.deepEqual(cards.map((c) => c.action), ['Add a repo', 'Start a driver session', 'Plan an epic'])
})

test('a Radar repository with no crew seen asks for one', () => {
  const cards = setupCards({ ...none, repositories: 1, radarRepositories: 1, plans: 1, driver: 'running' })
  assert.deepEqual(cards.map((c) => c.id), ['crew'])
  assert.equal(setupCards({ ...none, repositories: 1, radarRepositories: 1, radarCrews: 2, plans: 1, driver: 'idle' }).length, 0)
})

test('an unreadable driver is not called missing', () => {
  assert.equal(setupCards({ ...none, repositories: 1, plans: 1, driver: 'unknown' }).length, 0)
})

test('the driver slot read: 404 none, busy running, quiet idle, other unknown', async () => {
  assert.deepEqual(driverFromSlot(404, null), { state: 'none', href: null })
  assert.deepEqual(driverFromSlot(200, { running: true }), { state: 'running', href: DRIVER_HREF })
  assert.deepEqual(driverFromSlot(200, { running: false, queue: [1] }), { state: 'running', href: DRIVER_HREF })
  assert.deepEqual(driverFromSlot(200, { running: false, queue: [] }), { state: 'idle', href: DRIVER_HREF })
  assert.equal(driverFromSlot(500, null).state, 'unknown')
  const missing = Object.assign(new Error('no'), { status: 404 })
  assert.equal((await readDriver({ get: () => Promise.reject(missing) })).state, 'none')
  assert.equal((await readDriver({ get: () => Promise.reject(new Error('x')) })).state, 'unknown')
})
