// The Specs page shows where each spec lives (RC25.2): Private on the plans
// branch, Public on main, and nothing when no mirror is set.
import assert from 'node:assert/strict'
import test from 'node:test'
import { homeBadge } from '../src/plans-api.ts'

test('both homes have a badge and no mirror has none', () => {
  assert.deepEqual(homeBadge('plansBranch'), { label: 'Private', warn: true })
  assert.deepEqual(homeBadge('main'), { label: 'Public', warn: false })
  assert.equal(homeBadge(undefined), null)
})
