import assert from 'node:assert/strict'
import test from 'node:test'
import { rateLines } from '../src/settings-api.ts'

test('Settings > GitHub shows the last numbers, the limit and the 304 share', () => {
  assert.deepEqual(rateLines(undefined), [])
  const lines = rateLines({
    resources: { core: { limit: 5000, remaining: 12, resetAt: '2026-11-14T19:00:00.000Z' } },
    limitedUntil: '2026-11-14T19:00:00.000Z',
    limitedResource: 'core',
    calls: 8,
    notModified: 6,
    notModifiedShare: 0.75,
  })
  assert.match(lines[0], /^Limit reached \(core\)\. Calls resume at /)
  assert.match(lines[1], /^core: 12 of 5000 left, resets /)
  assert.equal(lines[2], '75% of 8 calls answered 304 (free)')
  // No calls yet: no share line.
  assert.deepEqual(rateLines({ resources: {}, limitedUntil: null, limitedResource: null, calls: 0, notModified: 0, notModifiedShare: null }), [])
})
