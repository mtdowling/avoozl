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

import { countdownText, countdownWidth, FALLBACK_SECONDS, limitedFor, refreshPeriod, refreshTip } from '../src/refresh-api.ts'

test('the Refresh countdown reads 32s, then m:ss, and 18:51 while limited', () => {
  assert.equal(countdownText(32, false), '32s')
  assert.equal(countdownText(5, false), '5s')
  assert.equal(countdownText(0, false), '0s')
  assert.equal(countdownText(100, false), '1:40')
  assert.equal(countdownText(18 * 60 + 51, true), '18:51')
  assert.equal(countdownText(3723, true), '1:02:03')
  // Limited, even a short wait reads as minutes and seconds.
  assert.equal(countdownText(32, true), '0:32')
})

test('the Refresh button keeps one width, takes its period from github.cacheSeconds and counts a limit from its end time', () => {
  assert.ok(countdownText(99, false).length <= countdownWidth(false, 60))
  assert.ok(countdownText(3599, true).length <= countdownWidth(true, 60))
  assert.ok(countdownText(3600, false).length <= countdownWidth(false, 3600))
  assert.equal(refreshPeriod(undefined), 60)
  assert.equal(refreshPeriod({ cacheSeconds: 90 }), 90)
  assert.equal(refreshPeriod({ cacheSeconds: 0 }), FALLBACK_SECONDS)
  const now = Date.parse('2026-11-14T19:00:00Z')
  assert.equal(limitedFor({ limitedUntil: '2026-11-14T19:18:51Z' }, now), 18 * 60 + 51)
  assert.equal(limitedFor({ limitedUntil: '2026-11-14T18:00:00Z' }, now), 0)
  assert.equal(limitedFor(null, now), 0)
})

test('the details are in the tooltip, not on the button', () => {
  const rate = { cacheSeconds: 60, resources: { core: { limit: 5000, remaining: 4000, resetAt: '' } } }
  assert.match(refreshTip(rate, 32, 0), /Reads again in 32s.*kept 60s.*4000 of 5000/)
  assert.match(refreshTip(rate, 32, 600), /rate limit is reached/)
})
