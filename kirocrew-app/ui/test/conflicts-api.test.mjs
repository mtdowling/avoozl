import assert from 'node:assert/strict'
import test from 'node:test'
import { itemKey, noActionReason, resultMessage, settleActionOf, withoutSettled } from '../src/conflicts-api.ts'

const item = (kind, taskId, extra = {}) => ({ kind, taskId, title: taskId, detail: '', authority: 'local', issue: null, ...extra })

test('every kind gets an action or a plain reason why it has none', () => {
  const cases = [
    [item('needs-human', 'r', { reason: 'review' }), 'reviewed', null],
    [item('needs-human', 'b', { reason: 'blocked' }), 'unblock', null],
    [item('decision', 'd'), 'settle', null],
    [item('stale-session', 's', { slot: 'slot-1' }), 'dismiss', null],
    [item('stale-session', 'g', { slot: 'slot-2', authority: 'github' }), 'dismiss', null],
    [item('needs-human', 'g', { reason: 'review', authority: 'github' }), null, /github owns/],
    [item('github-conflict', 'g', { field: 'state', choices: [] }), null, /issue state/],
    [item('github-conflict', 'g', { field: 'identity', choices: [] }), null, /duplicate issue/],
    [item('github-conflict', 'g', { field: 'title', choices: ['desired', 'github'] }), null, null],
    [item('resource', 'x'), null, /share a resource/],
  ]
  for (const [entry, action, reason] of cases) {
    assert.equal(settleActionOf(entry), action, `${entry.kind} ${entry.taskId}`)
    const why = noActionReason(entry)
    if (reason) assert.match(why, reason)
    else assert.equal(why, null, `${entry.kind} ${entry.taskId}: ${why}`)
  }
})

test('settled items leave the list at once; refused ones stay and say why', () => {
  const items = [
    item('needs-human', 'a', { reason: 'review' }),
    item('needs-human', 'b', { reason: 'review' }),
    item('stale-session', 'a', { slot: 's1' }),
    item('stale-session', 'a', { slot: 's2' }),
  ]
  const reviewed = { revision: 5, settled: [{ taskId: 'a' }], refused: [{ taskId: 'b', reason: 'GitHub owns this task.' }] }
  assert.deepEqual(withoutSettled(items, 'reviewed', reviewed).map(itemKey), [
    'needs-human:b::',
    'stale-session:a::s1',
    'stale-session:a::s2',
  ])
  const dismissed = { revision: 6, settled: [{ taskId: 'a', slot: 's2' }], refused: [] }
  assert.deepEqual(withoutSettled(items, 'dismiss', dismissed).map(itemKey), [
    'needs-human:a::',
    'needs-human:b::',
    'stale-session:a::s1',
  ])
  assert.deepEqual(resultMessage('reviewed', reviewed), {
    ok: false,
    text: 'Mark reviewed: 1 done. Refused 1: b (GitHub owns this task.)',
  })
  assert.deepEqual(resultMessage('dismiss', dismissed), { ok: true, text: 'Dismiss: 1 done.' })
})

test('a review group is one item that settles all its local tasks and shrinks as they go', async () => {
  const { settleTargets, settleCount } = await import('../src/conflicts-api.ts')
  const group = {
    kind: 'review',
    id: 'review:spec:p',
    taskId: null,
    plan: 'p',
    title: 'Review 3 tasks in p: their design text changed',
    detail: '',
    tasks: [
      { id: 'a', title: 'A', status: 'planned', authority: 'local' },
      { id: 'b', title: 'B', status: 'planned', authority: 'local' },
      { id: 'g', title: 'G', status: 'planned', authority: 'github' },
    ],
  }
  assert.equal(settleActionOf(group), 'reviewed')
  assert.deepEqual(settleTargets(group), [{ taskId: 'a' }, { taskId: 'b' }])
  assert.equal(settleCount([group]), 2)
  const left = withoutSettled([group], 'reviewed', { revision: 2, settled: [{ taskId: 'a' }], refused: [] })
  assert.deepEqual(left.map((g) => [g.title, g.tasks.map((t) => t.id)]), [['Review 2 tasks in p: their design text changed', ['b', 'g']]])
  assert.deepEqual(withoutSettled(left, 'reviewed', { revision: 3, settled: [{ taskId: 'b' }, { taskId: 'g' }], refused: [] }), [])
  const remote = { ...group, tasks: [group.tasks[2]] }
  assert.equal(settleActionOf(remote), null)
  assert.match(noActionReason(remote), /where they live/)
})
