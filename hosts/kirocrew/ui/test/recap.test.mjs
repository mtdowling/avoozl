// The side panel's "since you left" recap and its waiting and in-flight rows.
// Pure module, no browser.
import assert from 'node:assert/strict'
import test from 'node:test'
import { recapSince, sinceText } from '../src/recap-api.ts'
import { panelModel } from '../src/panel-api.ts'

const worker = {
  host: 'box',
  crewId: 'r1',
  taskId: 'S5',
  state: 'running',
  chatKey: 'k',
  status: 'working',
  updatedAt: '2026-11-14T11:00:00Z',
  attachUrl: '/chat?sid=k',
  stale: false,
  lastOkAt: null,
}

test('a waiting row with no direct action gets a deep link into the page', () => {
  const model = panelModel({ conflicts: [{ kind: 'content-match', taskId: 'S1', id: 'd1', title: 'Matched', detail: 'd' }] })
  assert.deepEqual(model.waiting[0].actions, [{ kind: 'link', label: 'Open in Avoozl', href: '/apps/avoozl' }])
})

test('Session is also steer: the link opens the chat and the tip says to type there', () => {
  const model = panelModel({ remote: [worker] })
  assert.equal(model.inFlight[0].attach, '/chat?sid=k')
})

test('recap since you left: tasks finished after, and waiting rows that are new', () => {
  const now = Date.parse('2026-11-14T12:00:00Z')
  const model = panelModel({
    conflicts: [
      { kind: 'needs-human', reason: 'crew', taskId: null, id: 'a', title: 'Old', detail: 'd' },
      { kind: 'needs-human', reason: 'crew', taskId: null, id: 'b', title: 'New', detail: 'd' },
    ],
    flow: {
      tasks: [
        { taskId: 'S1', title: 'Before', repository: 'o/r', finishedAt: '2026-11-14T10:00:00Z' },
        { taskId: 'S2', title: 'After', repository: 'o/r', finishedAt: '2026-11-14T11:30:00Z' },
      ],
      line: [],
    },
  })
  const away = { at: Date.parse('2026-11-14T11:00:00Z'), waitingKeys: [model.waiting[0].key] }
  const recap = recapSince(model, away, now)
  assert.deepEqual(
    recap.finished.map((row) => row.taskId),
    ['S2'],
  )
  assert.deepEqual(
    recap.needsYou.map((row) => row.title),
    ['New'],
  )
  assert.equal(recap.since, '1 h ago')
  // Away less than a minute, or nothing new: no recap.
  assert.equal(recapSince(model, { ...away, at: now - 20_000 }, now), null)
  assert.equal(recapSince({ ...model, recent: [] }, { at: away.at, waitingKeys: model.waiting.map((row) => row.key) }, now), null)
  assert.equal(recapSince(model, null, now), null)
  assert.equal(sinceText(away.at, now), '1 h ago')
})
