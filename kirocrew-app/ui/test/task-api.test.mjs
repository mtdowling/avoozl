import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import {
  duration,
  emptyForm,
  findCycle,
  formFrom,
  newTaskId,
  relativeTime,
  saveError,
  sessionHref,
  taskClient,
  taskInput,
} from '../src/task-api.ts'

const edge = (from, to, kind = 'requires') => ({ from, to, kind })

test('a prerequisite that closes a loop is found with its path before saving', () => {
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('x', 'y', 'supports')]
  assert.deepEqual(findCycle(edges, 'a', ['c']), ['a', 'b', 'c', 'a'])
  assert.equal(findCycle(edges, 'c', ['a']), null)
  assert.deepEqual(findCycle(edges, 'b', ['b']), ['b', 'b'])
  // Supports links do not block, so they cannot make a cycle.
  assert.equal(findCycle(edges, 'x', ['y']), null)
  // A sequence link counts.
  assert.deepEqual(findCycle([edge('a', 'b', 'sequence')], 'a', ['b']), ['a', 'b', 'a'])
})

test('a new task ID comes from its title and is never taken', () => {
  assert.equal(newTaskId('Add a Restart button!', new Set()), 'add-a-restart-button')
  assert.equal(newTaskId('Add a Restart button', new Set(['add-a-restart-button'])), 'add-a-restart-button-2')
  assert.match(newTaskId('42', new Set()), /^task-/)
  assert.match(newTaskId('', new Set()), /^[a-z][a-z0-9-]{2,80}$/)
})

test('a new task is created as a draft with its prerequisites and kinds', () => {
  const input = taskInput(
    {
      ...emptyForm(),
      id: 'new-task',
      title: ' New task ',
      summary: 'Do it.',
      acceptance: 'One\n\n Two ',
      checks: 'npm test',
      prerequisites: [
        { id: 'a', kind: 'requires', condition: '' },
        { id: 'b', kind: 'requires', condition: 'integrated' },
        { id: 'c', kind: 'sequence', condition: '' },
      ],
    },
    null,
  )
  assert.deepEqual(input, {
    id: 'new-task',
    title: 'New task',
    summary: 'Do it.',
    acceptance: ['One', 'Two'],
    checks: ['npm test'],
    requires: ['a', { task: 'b', condition: 'integrated' }],
    sequence: ['c'],
    create: true,
    needsReview: true,
  })
})

const detail = {
  revision: 4,
  task: {
    id: 't',
    title: 'T',
    summary: 'S',
    acceptance: ['A'],
    checks: [],
    epic: 'e1',
    repository: null,
  },
  waitsOn: [{ id: 'a', title: 'A', kind: 'requires', condition: null, satisfied: true }],
  blocks: [],
}

test('an edit sends only what changed, and a text change marks only this task for review', () => {
  const original = formFrom(detail)
  assert.deepEqual(taskInput({ ...original, prerequisites: [] }, original), { id: 't', requires: [] })
  assert.deepEqual(taskInput({ ...original, title: 'T2' }, original), { id: 't', title: 'T2', needsReview: true })
  assert.deepEqual(taskInput(original, original), { id: 't' })
})

test('a stale revision reads as an instruction to reload', () => {
  assert.match(saveError('Database changed. Reload and review before saving.'), /changed elsewhere\. Reload/)
  assert.equal(saveError('Title must contain 1–240 characters.'), 'Title must contain 1–240 characters.')
})

test('times read as relative and running durations', () => {
  const now = Date.parse('2026-11-12T12:00:00Z')
  assert.equal(relativeTime('2026-11-12T11:55:00Z', now), '5 min ago')
  assert.equal(relativeTime('2026-11-12T09:00:00Z', now), '3 h ago')
  assert.equal(relativeTime('2026-11-10T12:00:00Z', now), '2 d ago')
  assert.equal(relativeTime('2026-10-01T12:00:00Z', now), '2026-10-01')
  assert.equal(relativeTime(null, now), '')
  assert.equal(duration('2026-11-12T10:55:00Z', now), '1 h 5 min')
})

test('Attach opens the session the backend links, else its Kiro Crew chat key', () => {
  assert.equal(sessionHref({ slot: 'dashboard:abc', link: '/chat?sid=abc' }), '/chat?sid=abc')
  assert.equal(sessionHref({ slot: 'dashboard:abc def', link: null }), '/chat?sid=abc%20def')
  assert.equal(sessionHref({ slot: 'raw', link: undefined }), '/chat?sid=raw')
})

test('the task client calls detail, preview, update and settle with the revision', async () => {
  const calls = []
  const client = taskClient({
    post: async (path, body) => {
      calls.push({ path, body })
      return { result: {} }
    },
  })
  await client.detail('w', 't')
  await client.preview('w', 't', { title: 'X' })
  await client.save('w', { id: 't', title: 'X' }, 7)
  await client.settle('w', 'reviewed', [{ taskId: 't' }], 8)
  assert.deepEqual(
    calls.map((c) => [c.path, c.body.operation, c.body.expectedRevision ?? null]),
    [
      [COMMAND_PATH, 'task.detail', null],
      [COMMAND_PATH, 'task.change.preview', null],
      [COMMAND_PATH, 'task.update', 7],
      [COMMAND_PATH, 'conflicts.settle', 8],
    ],
  )
  assert.deepEqual(calls[1].body.input, { id: 't', title: 'X' })
})
