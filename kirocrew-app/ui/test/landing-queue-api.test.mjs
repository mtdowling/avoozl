// Dashboards › Landing queue's pure helpers (task 44.5).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseTitle, batchTime, holdVariant, holdWord, itemCount, itemLinks, landingNote, sizeLine, testingLine } from '../src/landing-queue-api.ts'

const item = (extra = {}) => ({
  key: 'k',
  tasks: [{ id: 'k', title: 'K' }],
  commit: null,
  pr: null,
  branch: null,
  checks: null,
  position: 1,
  since: null,
  waitedMinutes: null,
  hold: { kind: 'next', text: 'Next to land.' },
  ...extra,
})

test('links are http(s) only: a PR and its branch, nothing from other schemes', () => {
  assert.deepEqual(
    itemLinks(
      item({
        pr: { kind: 'pull', repository: 'a/b', number: 4, url: 'https://github.com/a/b/pull/4' },
        branch: { kind: 'branch', repository: 'a/b', ref: 'task/x', url: 'https://github.com/a/b/tree/task/x' },
      }),
    ).map((l) => [l.key, l.label]),
    [
      ['pr', 'PR #4'],
      ['branch', 'task/x'],
    ],
  )
  assert.deepEqual(itemLinks(item({ pr: { kind: 'pull', repository: 'a/b', number: 4, url: 'javascript:alert(1)' } })), [])
})

test('each hold kind has a word; problems are red and the next is green', () => {
  for (const kind of ['stopped', 'off', 'review', 'failing', 'pending', 'conflict', 'path', 'behind', 'next', 'held', 'waiting']) assert.ok(holdWord(kind))
  assert.equal(holdVariant('failing'), 'danger')
  assert.equal(holdVariant('review'), 'warning')
  assert.equal(holdVariant('next'), 'success')
  assert.equal(holdVariant('behind'), undefined)
})

test('a group names its repository and base, and counts its items', () => {
  const base = { key: 'p\0main', projectId: 'p', repository: null, base: 'main', landing: 'pr', items: [item(), item({ key: 'j' })] }
  assert.equal(baseTitle(base), 'p → main')
  assert.equal(landingNote(base), 'by pull request')
  assert.equal(itemCount({ bases: [base], readAt: '' }), 2)
  assert.equal(itemCount(null), 0)
})

test('a direct base reads as merge batches, with its testing, size and timing lines', () => {
  const base = { key: 'p\0core-dev', projectId: 'p', repository: 'a/b', base: 'core-dev', landing: 'direct', items: [] }
  assert.equal(landingNote(base), 'in merge batches')
  assert.equal(testingLine({ members: ['a', 'b'], step: 'bisect', since: '' }), '2 members, looking for the member that broke it')
  assert.equal(testingLine({ members: ['a'], step: 'testing', since: '' }), '1 member, running the checks')
  assert.equal(sizeLine({ limit: 3, fixed: false, failureRate: 0.2, results: 20 }), 'Up to 3 tasks per batch. Failure rate 20%, over the last 20 results.')
  assert.equal(
    sizeLine({ limit: 1, fixed: true, failureRate: 0.1, results: 2 }),
    'Up to 1 task per batch (set in the repository settings). Failure rate 10%, assumed until 5 results are in.',
  )
  assert.equal(batchTime(95), '1 min 35 s')
  assert.equal(batchTime(40), '40 s')
  assert.equal(batchTime(null), '')
  assert.equal(holdVariant('held'), 'warning')
})
