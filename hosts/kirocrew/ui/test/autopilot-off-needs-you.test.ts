// Ready tasks wait while this machine has no loop: Needs you shows one row
// that says so and where to turn Autopilot on, with no settle button.
import assert from 'node:assert/strict'
import test from 'node:test'
import { noActionReason, settleActionOf, whyLine } from '../src/conflicts-api.ts'
import { summarize } from '../src/in-flight-api.ts'
import type { ConflictItem } from '../src/views-api.ts'

const item: ConflictItem = {
  kind: 'needs-human',
  reason: 'autopilot-off',
  id: 'autopilot-off',
  taskId: null,
  title: 'Autopilot is off on this machine, so ready tasks wait.',
  detail: 'Turn it on in Settings › Autopilot, or run avoozl next --claim.',
}

test('the autopilot-off row says what to do and offers no settle action', () => {
  assert.equal(settleActionOf(item), null)
  assert.equal(noActionReason(item), null)
  assert.equal(whyLine(item), item.detail)
})

test('the attention list keeps the autopilot-off row', () => {
  const summary = summarize({ graph: { revision: 1, statuses: [], repositories: [], total: 0, tasks: [], epics: [], edges: [] }, delivery: [], conflicts: [item], plans: null })
  assert.deepEqual(
    summary.attention.map((entry) => [entry.kind, entry.title, entry.detail]),
    [['needs-human', item.title, item.detail]],
  )
})
