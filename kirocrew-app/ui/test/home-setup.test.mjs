// Home's empty states: each missing piece is a card with a button, never a
// hidden section.
import assert from 'node:assert/strict'
import { test } from 'node:test'
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
