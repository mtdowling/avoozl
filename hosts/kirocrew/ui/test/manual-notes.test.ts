// Manual tasks on the page: the calls name their operations, a manual task
// is tagged Manual in Needs you and on its Delivery card, and the drawers
// hold the new parts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { manualClient } from '../src/manual-api.ts'
import { fakeApi } from './fake-api.ts'
import { graphOf, graphTask } from './graph-fixture.ts'
import type { GraphTask } from '../src/views-api.ts'
import { summarize } from '../src/in-flight-api.ts'
import { deliveryLanes } from '../src/delivery-api.ts'

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('each call names its operation', async () => {
  const { api, calls } = fakeApi()
  const client = manualClient(api)
  await client.markDone('w', 't', 'skipped')
  await client.reopen('w', 't')
  assert.deepEqual(
    calls.map(({ body }) => body.operation),
    ['task.manual.complete', 'task.manual.reopen'],
  )
  assert.deepEqual(calls[0].body.input, { taskId: 't', choice: 'skipped' })
})

const task = (id: string, extra: Partial<GraphTask> = {}) => graphTask(id, { repository: 'code', ...extra })

test('a manual task waiting for a person is tagged Manual in Needs you and on its card', () => {
  const graph = graphOf({
    tasks: [
      task('review', { manual: true, state: 'needs-you', needsYou: { reason: 'Waiting for a person: Review with team', manual: true } }),
      task('cutover', { state: 'waiting' }),
    ],
  })
  const summary = summarize({ graph, delivery: [], conflicts: [], plans: null })
  const manual = summary.attention.find((item) => item.kind === 'manual')
  assert.deepEqual(manual && { taskId: manual.taskId, detail: manual.detail }, { taskId: 'review', detail: 'Waiting for a person: Review with team' })
  const lanes = deliveryLanes(graph, [])
  assert.deepEqual(
    lanes['needs-you'].map((card) => [card.id, card.manual]),
    [['review', true]],
  )
  assert.equal(lanes.waiting.find((card) => card.id === 'cutover')?.manual, false)
})

test('the drawer has Links and Mark done, and no notes', () => {
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /<SectionBox id="task-links" title="Links">/)
  assert.doesNotMatch(drawer, /Links and notes|id="notes"/)
  assert.match(drawer, /task\.manual && \(\s*<ManualTask/)
  const notes = source('ManualTask.tsx')
  for (const words of ['Mark done', "title: 'Done'", "title: 'Skipped'", 'Reopen']) assert.ok(notes.includes(words), words)
  // Tasks keep no notes or links: no field for either in Mark done.
  for (const gone of ['Add note', 'Outcome note', 'textarea', 'Add a link']) assert.ok(!notes.includes(gone), gone)
  assert.doesNotMatch(notes, /<Markdown/)
  assert.match(notes, /<Modal/)
  assert.match(notes, /<RadioFold/)
})
