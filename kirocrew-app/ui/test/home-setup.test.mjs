// Home's empty states: each missing piece is a card, never a hidden section.
// No epics is one line with no button of its own: New spec starts one.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setupCards } from '../src/setup-api.ts'

const none = { repositories: 0, plans: 0 }

test('a fresh workspace shows every empty state; only the ones with a fix of their own have a button', () => {
  const cards = setupCards(none)
  assert.deepEqual(
    cards.map((c) => c.id),
    ['repository', 'epics'],
  )
  assert.deepEqual(
    cards.map((c) => c.action),
    ['Add a repo', ''],
  )
  assert.equal(cards[1].line, 'No epics yet. Start one with New spec on Specs.')
})

test('no Radar crew card: Radar is going away', () => {
  assert.equal(setupCards({ repositories: 1, plans: 1 }).length, 0)
})
