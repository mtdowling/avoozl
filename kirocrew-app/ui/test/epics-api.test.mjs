// The Epics screen's and Trace's Done list's helpers, and that the pages call
// the read-only operations and nothing else.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { GATE_TEXT, epicLine, epicsClient, phaseDrill, planDrill, radarGraphLink, releaseCount, whoLine } from '../src/epics-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('counts read as a person would say them', () => {
  assert.equal(releaseCount({ released: 1, total: 4 }), '1 of 4 released')
  assert.equal(epicLine({ tasks: 12, merged: 5, running: 1 }), '12 tasks · 5 merged · 1 running')
  assert.equal(epicLine({ tasks: 1, merged: 0, running: 0 }), '1 task · 0 merged')
  assert.deepEqual(Object.keys(GATE_TEXT), ['passed', 'open', 'closed'])
})

test('a spec and a phase drill into the Graph the way its Back step expects', () => {
  assert.deepEqual(planDrill({ id: 'a', title: 'A' }), {
    kind: 'plan',
    id: 'a',
    title: 'A',
  })
  assert.deepEqual(phaseDrill({ id: 'a' }, { id: 'p', title: 'P' }), {
    kind: 'phase',
    plan: 'a',
    id: 'p',
    title: 'P',
  })
})

test('the Radar link is its page, and says the view and issue are chosen there', () => {
  const link = radarGraphLink({
    radarGraph: { url: '/issue-radar', focus: false },
  })
  assert.equal(link.href, '/issue-radar')
  assert.match(link.note, /Graph view/)
  assert.equal(radarGraphLink({ radarGraph: { url: '/issue-radar', focus: true } }).note, null)
})

test('who did it names the crew and, when known, the machine', () => {
  assert.equal(whoLine({ by: { kind: 'radar-crew', id: 'c1', name: 'Draco' } }, 'desk-linux'), 'Radar crew Draco on desk-linux')
  assert.equal(whoLine({ by: { kind: 'radar-crew', id: 'c1', name: null } }), 'Radar crew c1')
  assert.match(whoLine({ by: null }), /No crew found/)
})

test('the pages read through epics.view and trace.done only', async () => {
  const seen = []
  const api = {
    post: async (path, body) => (seen.push([path, body.operation, body.workspaceId]), { result: {} }),
  }
  await epicsClient(api).read('w')
  await epicsClient(api).done('w')
  assert.deepEqual(seen, [
    [COMMAND_PATH, 'epics.view', 'w'],
    [COMMAND_PATH, 'trace.done', 'w'],
  ])
  for (const file of ['EpicsView.tsx', 'TraceDone.tsx']) assert.doesNotMatch(source(file), /\.(put|del)\(/, file)
})
