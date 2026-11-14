// The driver session on the page: what Avoozl read, what each state says,
// what Start opens, the demo's fixture, and the "since you left" recap. Pure
// module, no browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  DRIVER_AGENT,
  DRIVER_START_MESSAGE,
  driverFromFixture,
  driverLine,
  readDriverSession,
  recapSince,
  sinceText,
} from '../src/driver-view-api.ts'
import { driverView, panelModel } from '../src/panel-api.ts'
import { classifyChat } from '../src/panel-chat.ts'

const read = (over = {}) => ({ state: 'running', slot: 'chat-7-1', href: '/chat?sid=chat-7-1', openedAt: '2026-11-14T10:00:00Z', lastSeenAt: '2026-11-14T10:20:00Z', source: 'stop', quietAfterMinutes: 30, ...over })

test('the read is one observe call, and a failed read is unknown, not not-started', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push([path, body]), { result: read() }) }
  assert.equal((await readDriverSession(api, 'w')).state, 'running')
  assert.deepEqual(calls[0], ['/apps/avoozl/api/command', { operation: 'driversession.view', input: {}, workspaceId: 'w' }])
  const down = { post: async () => { throw Object.assign(new Error('x'), { status: 500 }) } }
  assert.deepEqual(await readDriverSession(down, 'w'), { state: 'unknown', slot: null, href: null, openedAt: null, lastSeenAt: null })
})

test('each state says what it means and what is missing', () => {
  assert.match(driverLine('running'), /watch or steer/i)
  assert.match(driverLine('idle'), /quiet/i)
  assert.match(driverLine('none'), /nothing is released/i)
  assert.match(driverLine('unknown'), /could not read/i)
})

test('Start opens the avoozl-driver agent with a seeded message, and the message forbids merging', () => {
  assert.equal(DRIVER_AGENT, 'avoozl-driver')
  assert.match(DRIVER_START_MESSAGE, /driver session/i)
  assert.match(DRIVER_START_MESSAGE, /do not merge/i)
})

test('the panel view: a link when seen, a link and Start when quiet, Start alone when none', () => {
  assert.deepEqual(driverView(read()), { state: 'running', link: '/chat?sid=chat-7-1', start: false, note: driverLine('running') })
  const idle = driverView(read({ state: 'idle' }))
  assert.equal(idle.link, '/chat?sid=chat-7-1')
  assert.equal(idle.start, true)
  const none = driverView(null)
  assert.deepEqual([none.state, none.link, none.start], ['none', null, true])
  assert.match(none.note, /nothing is released/i)
  // An unreadable driver offers no Start: it may be running.
  const unknown = driverView({ state: 'unknown', slot: null, href: null })
  assert.equal(unknown.start, false)
})

test('the demo reads its fixture and never the backend', () => {
  const fixture = { state: 'running', slot: 'demo-driver', link: '/chat?sid=demo-driver', previewOnly: true, startedAt: '2026-11-14T09:00:00Z', lastTurnAt: '2026-11-14T10:00:00Z', turnsToday: 11, turnLimit: 40 }
  assert.deepEqual(driverFromFixture(fixture), { state: 'running', slot: 'demo-driver', href: '/chat?sid=demo-driver', openedAt: fixture.startedAt, lastSeenAt: fixture.lastTurnAt, turnsToday: 11, turnLimit: 40 })
  assert.equal(driverFromFixture({ ...fixture, state: 'not-started' }).state, 'none')
})

test('the driver chat itself reads as an Avoozl chat in the side panel', () => {
  assert.deepEqual(classifyChat('chat-7-1', { specs: [], driver: 'chat-7-1' }), { kind: 'avoozl' })
  assert.deepEqual(classifyChat('chat-7-1', { specs: [] }), { kind: 'other' })
  assert.deepEqual(classifyChat('chat-7-1', { specs: [], driver: null }), { kind: 'other' })
})

const crewClaim = { repository: 'o/r', number: 5, title: 'T', url: null, crewId: 'abc', crewName: 'Draco', phase: 'CI', pr: 9, prUrl: null, updated: null, commentUrl: null, stale: false, noMarker: false }

test('a waiting row with no direct action gets a deep link into the page', () => {
  const model = panelModel({ conflicts: [{ kind: 'content-match', taskId: 'S1', id: 'd1', title: 'Matched', detail: 'd' }] })
  assert.deepEqual(model.waiting[0].actions, [{ kind: 'link', label: 'Open in Avoozl', href: '/apps/avoozl' }])
})

test('Attach is also steer: the link opens the chat and the tip says to type there', () => {
  const model = panelModel({ crews: { rows: [crewClaim], errors: [], unseen: [], stale: 0, readAt: null } })
  assert.equal(model.inFlight[0].attach, '/chat?sid=crew-abc')
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
  assert.deepEqual(recap.finished.map((row) => row.taskId), ['S2'])
  assert.deepEqual(recap.needsYou.map((row) => row.title), ['New'])
  assert.equal(recap.since, '1 h ago')
  // Away less than a minute, or nothing new: no recap.
  assert.equal(recapSince(model, { ...away, at: now - 20_000 }, now), null)
  assert.equal(recapSince({ ...model, recent: [] }, { at: away.at, waitingKeys: model.waiting.map((row) => row.key) }, now), null)
  assert.equal(recapSince(model, null, now), null)
  assert.equal(sinceText(away.at, now), '1 h ago')
})

test('the panel reads the driver through the shared module and the app page uses the demo fixture', () => {
  const src = (name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
  assert.match(src('Panel.tsx'), /readDriverSession/)
  assert.match(src('Panel.tsx'), /agent: DRIVER_AGENT/)
  assert.match(src('DriverSessionBox.tsx'), /useDemoFixtures\(\)/)
  assert.match(src('DashboardView.tsx'), /<DriverSessionBox/)
})
