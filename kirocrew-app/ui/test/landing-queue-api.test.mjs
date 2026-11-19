// Dashboards › Landing queue's pure helpers (task 44.5).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseTitle, holdVariant, holdWord, itemCount, itemLinks, landingNote, queueLine } from '../src/landing-queue-api.ts'

const item = (extra = {}) => ({
  key: 'k',
  tasks: [{ id: 'k', title: 'K' }],
  commit: null,
  pr: null,
  branch: null,
  checks: null,
  position: 1,
  since: null,
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
  for (const kind of ['stopped', 'off', 'review', 'failing', 'pending', 'conflict', 'path', 'behind', 'next', 'train', 'held', 'waiting']) assert.ok(holdWord(kind))
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

test('a train target shows its depth and the running train with its step', () => {
  const base = { key: 'p\0core-dev', projectId: 'p', repository: 'a/b', base: 'core-dev', landing: 'train', items: [] }
  assert.equal(landingNote(base), 'by integrator train')
  assert.equal(queueLine(base), null, 'a base with no queue block shows no line')
  assert.equal(queueLine({ ...base, queue: { depth: 3, train: null } }), '3 in the queue. No train is running.')
  assert.equal(
    queueLine({ ...base, queue: { depth: 4, train: { id: 'train-ab', policy: 'gated', step: 'cheap', members: 2, startedAt: '' } } }),
    '4 in the queue. train-ab (gated, 2 branches) is at cheap.',
  )
  assert.equal(holdVariant('train'), 'info')
  assert.equal(holdVariant('held'), 'warning')
})
