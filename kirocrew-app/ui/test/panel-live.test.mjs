// The side panel's live data: the refresh rule (interval, focus, paused while
// hidden, no overlap) and what each section shows from the reads the app
// already makes. Pure module, no browser.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PANEL_REFRESH_MS, driverView, panelModel, startRefresh } from '../src/panel-api.ts'

// A document and window that record listeners, and a timer the test fires.
function env(visible = true) {
  const doc = { visibilityState: visible ? 'visible' : 'hidden', on: {} }
  const win = { on: {} }
  const listen = (target) => ({
    addEventListener: (name, fn) => (target.on[name] = fn),
    removeEventListener: (name) => delete target.on[name],
  })
  Object.assign(doc, listen(doc))
  Object.assign(win, listen(win))
  const timer = { fn: null, ms: null, cleared: false }
  return {
    doc,
    win,
    timer,
    options: {
      intervalMs: PANEL_REFRESH_MS,
      doc,
      win,
      setTimer: (fn, ms) => ((timer.fn = fn), (timer.ms = ms), 1),
      clearTimer: () => (timer.cleared = true),
    },
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('it reads at once, then on every interval while visible', async () => {
  const e = env()
  let reads = 0
  const stop = startRefresh(() => void reads++, e.options)
  await settle()
  assert.equal(reads, 1)
  assert.equal(e.timer.ms, PANEL_REFRESH_MS)
  e.timer.fn()
  await settle()
  assert.equal(reads, 2)
  stop()
})

test('it reads on window focus and when the tab becomes visible', async () => {
  const e = env()
  let reads = 0
  const stop = startRefresh(() => void reads++, e.options)
  await settle()
  e.win.on.focus()
  await settle()
  assert.equal(reads, 2)
  e.doc.visibilityState = 'hidden'
  e.doc.on.visibilitychange()
  await settle()
  assert.equal(reads, 2, 'hiding does not read')
  e.doc.visibilityState = 'visible'
  e.doc.on.visibilitychange()
  await settle()
  assert.equal(reads, 3)
  stop()
})

test('it does not read on the interval while hidden', async () => {
  const e = env(false)
  let reads = 0
  const stop = startRefresh(() => void reads++, e.options)
  await settle()
  assert.equal(reads, 1, 'the first read still happens')
  e.timer.fn()
  await settle()
  assert.equal(reads, 1)
  stop()
})

test('a read that is still running is not started twice', async () => {
  const e = env()
  let reads = 0
  let release
  const stop = startRefresh(() => {
    reads += 1
    return new Promise((resolve) => (release = resolve))
  }, e.options)
  await settle()
  e.timer.fn()
  e.win.on.focus()
  await settle()
  assert.equal(reads, 1)
  release()
  await settle()
  e.timer.fn()
  await settle()
  assert.equal(reads, 2)
  stop()
})

test('stopping clears the timer and the listeners, and a failed read does not stop the timer', async () => {
  const e = env()
  let reads = 0
  const stop = startRefresh(() => {
    reads += 1
    throw new Error('down')
  }, e.options)
  await settle()
  e.timer.fn()
  await settle()
  assert.equal(reads, 2)
  stop()
  assert.equal(e.timer.cleared, true)
  assert.deepEqual(Object.keys(e.win.on), [])
  assert.deepEqual(Object.keys(e.doc.on), [])
})

const conflict = (kind, extra = {}) => ({ kind, taskId: 't1', title: `A ${kind}`, detail: 'why', ...extra })
const claim = (extra = {}) => ({
  repository: 'o/r', number: 52, title: 'Index builder', url: 'https://github.test/o/r/issues/52', crewId: 'abc', crewName: 'Draco',
  phase: 'CI', pr: 57, prUrl: 'https://github.test/o/r/pull/57', updated: '2026-11-14T10:00:00Z', commentUrl: null, stale: false, noMarker: false, ...extra,
})
const queueRow = (taskId, state, extra = {}) => ({ taskId, title: `Task ${taskId}`, planId: 'p', spec: 's', phase: 'one', scope: null, label: 'ready', number: null, url: null, manual: false, state, reason: `${state} reason`, used: 0, capacity: 2, ...extra })

test('Waiting on you keeps what a person settles and drops retired worker items', () => {
  const model = panelModel({
    conflicts: [
      conflict('needs-human', { reason: 'crew', link: 'https://github.test/o/r/issues/52', title: 'Tokenizer?' }),
      conflict('github-conflict', { field: 'title', choices: ['desired', 'github'] }),
      conflict('stale-session'),
      conflict('decision'),
      conflict('investigation'),
      conflict('needs-human', { reason: 'hand-set-review' }),
      conflict('ready-to-merge', { integrate: true }),
      conflict('ready-to-merge', { pullRequest: 57, link: 'https://github.test/o/r/pull/57' }),
      conflict('branch-landing', { repository: 'o/r', branch: 'int/x', head: 'abc123' }),
    ],
  })
  assert.deepEqual(model.waiting.map((row) => row.kind), ['needs-human', 'github-conflict', 'ready-to-merge', 'branch-landing'])
  const [handed, edited, , land] = model.waiting
  assert.deepEqual(handed.actions.map((a) => [a.kind, a.label]), [['link', 'Open issue']])
  assert.deepEqual(edited.actions.map((a) => [a.kind, a.label]), [['resolve', "Keep Avoozl's"], ['resolve', "Keep GitHub's"]])
  assert.deepEqual(land.actions.map((a) => a.kind), ['land'])
  assert.equal(model.waiting[2].actions[0].href, 'https://github.test/o/r/pull/57')
})

test('only http links become link actions; a row with none deep-links into the page', () => {
  const model = panelModel({ conflicts: [conflict('needs-human', { reason: 'crew', link: 'javascript:alert(1)' })] })
  assert.deepEqual(model.waiting[0].actions, [{ kind: 'link', label: 'Open in Avoozl', href: '/apps/avoozl' }])
})

test('In flight lists crew claims and remote coders, with where to attach', () => {
  const model = panelModel({
    crews: { readAt: null, stale: 1, errors: [], unseen: [], rows: [claim(), claim({ number: 53, crewId: null, crewName: null, pr: null, prUrl: null, stale: true, noMarker: true })] },
    remote: [{ host: 'box', crewId: 'r1', taskId: 'S5', state: 'running', chatKey: 'k', status: 'working', updatedAt: '2026-11-14T10:00:00Z', attachUrl: 'https://box.test/chat?sid=k', stale: false, lastOkAt: null }],
  })
  assert.deepEqual(model.inFlight.map((row) => [row.source, row.ref]), [['radar', 'o/r#52'], ['radar', 'o/r#53'], ['remote', 'S5']])
  assert.equal(model.inFlight[0].attach, '/chat?sid=crew-abc')
  assert.equal(model.inFlight[1].attach, null)
  assert.equal(model.inFlight[1].stale, true)
  assert.equal(model.inFlight[2].attach, 'https://box.test/chat?sid=k')
  assert.equal(model.inFlight[0].prUrl, 'https://github.test/o/r/pull/57')
})

test('the release queue head is the next row, then the held count', () => {
  const model = panelModel({
    queue: { repositories: [{ repository: 'o/r', ready: 'ready', mode: 'automatic', capacity: 2, scopes: [], steps: [], rows: [queueRow('a', 'claimed'), queueRow('b', 'next'), queueRow('c', 'next'), queueRow('d', 'held')] }] },
  })
  assert.deepEqual(model.queue, { head: [{ taskId: 'b', title: 'Task b', repository: 'o/r', reason: 'next reason' }, { taskId: 'c', title: 'Task c', repository: 'o/r', reason: 'next reason' }], held: 1, mode: 'automatic' })
})

test('recent merges are the newest finished tasks; an open stop shows its sentence', () => {
  const task = (taskId, finishedAt) => ({ taskId, title: `T ${taskId}`, repository: 'o/r', finishedAt })
  const model = panelModel({
    flow: {
      tasks: [task('a', '2026-11-14T08:00:00Z'), task('b', '2026-11-14T10:00:00Z'), { ...task('c', null) }],
      line: [{ id: 's1', manual: true, by: { kind: 'person', name: 'me' }, reason: 'rollback', scope: 'all', closedAt: null, branch: 'main' }, { id: 's0', closedAt: '2026-11-13T00:00:00Z', branch: 'main' }],
    },
  })
  assert.deepEqual(model.recent.map((row) => row.taskId), ['b', 'a'])
  assert.equal(model.stops.length, 1)
  assert.match(model.stops[0], /Line stopped by me: rollback/)
})

test('a read that failed leaves its section unread, not empty', () => {
  const model = panelModel({ conflicts: null, crews: null, remote: null, queue: null, flow: null })
  assert.deepEqual(model.unread, ['waiting', 'inFlight', 'queue', 'recent'])
  assert.equal(panelModel({ conflicts: [], crews: { rows: [], errors: [], unseen: [], stale: 0, readAt: null }, remote: [], queue: { repositories: [] }, flow: { tasks: [], line: [] } }).unread.length, 0)
})

test('the driver session: a link when one runs, else a Start button and why', () => {
  const running = driverView({ state: 'running', slot: 'drv', href: '/chat?sid=drv', openedAt: null, lastSeenAt: null })
  assert.equal(running.link, '/chat?sid=drv')
  assert.equal(running.start, false)
  const none = driverView(null)
  assert.equal(none.state, 'none')
  assert.equal(none.link, null)
  assert.equal(none.start, true)
  assert.match(none.note, /nothing is released/i)
})
