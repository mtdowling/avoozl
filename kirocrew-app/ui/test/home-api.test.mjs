// Home's sections from the reads it already makes (home-api.ts).
import assert from 'node:assert/strict'
import test from 'node:test'
import { answerLabel, ciHealth, landedRows, stuckRows, QUIET_MS } from '../src/home-api.ts'

const NOW = Date.parse('2026-11-17T12:00:00Z')
const at = (minutes) => new Date(NOW - minutes * 60000).toISOString()

test('Stuck or quiet lists quiet chats and unreachable crews, quietest first', () => {
  const row = (slot, minutes, extra = {}) => ({ slot, role: 'worker', taskId: slot, title: `Task ${slot}`, lastAt: at(minutes), session: { crewUnreachable: false, ...extra } })
  const summary = {
    inFlight: [row('busy', 5), row('quiet', QUIET_MS / 60000 + 10), row('away', 2, { crewUnreachable: true }), row('quieter', 200)],
  }
  const rows = stuckRows(summary, NOW, (r) => `/sessions/${r.slot}`)
  assert.deepEqual(
    rows.map((r) => [r.key, r.why]),
    [
      ['chat:quieter', 'Worker chat. No word for 3 h.'],
      ['chat:quiet', 'Worker chat. No word for 40 min.'],
      ['chat:away', 'Worker chat. Its crew does not answer.'],
    ],
  )
  assert.equal(rows[0].href, '/sessions/quieter')
  assert.deepEqual(
    stuckRows(null, NOW, () => null),
    [],
  )
})

test('Recently landed merges the landing record with integrated tasks, each once, newest first', () => {
  const landing = {
    queue: [],
    landedThisWeek: 1,
    landed: [
      {
        key: 'k1',
        base: 'main',
        repository: 'acme/a',
        tasks: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
        pr: 7,
        url: 'https://github.com/acme/a/pull/7',
        at: at(60),
      },
    ],
  }
  const item = (id, minutes, pull) => ({ id, title: `Task ${id}`, integration: minutes === null ? null : { at: at(minutes) }, pullRequests: pull ? [pull] : [] })
  const delivery = [
    item('a', 60, null),
    item('c', 10, { number: 9, url: 'https://github.com/acme/a/pull/9', merged: true }),
    item('d', null, null),
    item('e', 600, { number: 3, url: 'javascript:alert(1)', merged: true }),
  ]
  assert.deepEqual(
    landedRows(landing, delivery).map((r) => [r.title, r.pr, r.url]),
    [
      ['Task c', 9, 'https://github.com/acme/a/pull/9'],
      ['A and 1 more', 7, 'https://github.com/acme/a/pull/7'],
      ['Task e', 3, null],
    ],
  )
  assert.deepEqual(landedRows(null, null), [])
})

test('CI health reads flow.view CI facts and flags a wait share over its limit', () => {
  const repo = (repository, waitShare) => ({
    repository,
    windowDays: 14,
    byClass: {},
    waitShare,
    waitLimit: 0.25,
    closedPullRequests: 4,
    repeats: [{ workflow: 'ci', commits: 1, extraRuns: 2, extraMinutes: 3 }],
  })
  const ci = ciHealth({ ci: { repositories: [repo('a', 0.1), repo('b', 0.4), repo('c', null)] }, flaky: [{}], ciOnly: [] })
  assert.deepEqual(
    ci.repositories.map((r) => [r.repository, r.over, r.repeats]),
    [
      ['a', false, 2],
      ['b', true, 2],
      ['c', false, 2],
    ],
  )
  assert.equal(ci.flaky, 1)
  assert.equal(ciHealth({ flaky: [], ciOnly: [] }).available, false)
  assert.equal(ciHealth(null).available, false)
})

test('each Needs you kind names its one answer', () => {
  assert.equal(answerLabel({ kind: 'decision' }), 'Decide')
  assert.equal(answerLabel({ kind: 'branch-landing' }), 'Approve the landing')
  assert.equal(answerLabel({ kind: 'something-new' }), 'Open')
})
