// One searchable picker for tasks and specs (design §8.9, R73): matching,
// keys, ARIA, where it is used, and speed at 5,000 tasks. Also the Stop all
// agents choice in the Stop the line dialog (R64.12-R64.13).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MAX_SHOWN, optionItems, pickIndex, pickKey, pickLabel, pickMatches } from '../src/picker.ts'
import { FULL_STOP_WARNING, PULL_KINDS, bannerText, emptyPull, toPull } from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

const items = [
  { id: '24.1', title: 'Pulled stops in the backend', spec: 'avoozl', state: 'done' },
  { id: '29.1', title: 'Stop all agents', spec: 'avoozl', state: 'ready' },
  { id: 'n.4', title: 'Parser for 24 bit ints', spec: 'nupp', state: 'waiting' },
]

test('typing matches ID, title and spec, ignoring case, IDs first', () => {
  const index = pickIndex(items)
  assert.deepEqual(pickMatches(index, '').shown.map((i) => i.id), ['24.1', '29.1', 'n.4'])
  assert.deepEqual(pickMatches(index, 'STOP').shown.map((i) => i.id), ['24.1', '29.1'])
  assert.deepEqual(pickMatches(index, 'nupp').shown.map((i) => i.id), ['n.4'])
  // '24' starts 24.1's ID and is inside n.4's title: the ID match goes first.
  assert.deepEqual(pickMatches(index, '24').shown.map((i) => i.id), ['24.1', 'n.4'])
  assert.deepEqual(pickMatches(index, 'zzz'), { shown: [], total: 0 })
  assert.equal(pickLabel(items[1]), '29.1: Stop all agents')
  assert.deepEqual(optionItems([{ value: 'spec:a', label: 'a' }]), [{ id: 'spec:a', title: 'a' }])
})

test('arrows, Home, End, Enter and Esc', () => {
  const closed = { open: false, active: 0 },
    open = { open: true, active: 1 }
  assert.deepEqual(pickKey(closed, 'ArrowDown', 3), { kind: 'move', state: { open: true, active: 0 } })
  assert.deepEqual(pickKey(open, 'ArrowDown', 3), { kind: 'move', state: { open: true, active: 2 } })
  assert.deepEqual(pickKey({ open: true, active: 2 }, 'ArrowDown', 3), { kind: 'move', state: { open: true, active: 2 } })
  assert.deepEqual(pickKey(open, 'ArrowUp', 3), { kind: 'move', state: { open: true, active: 0 } })
  assert.deepEqual(pickKey(closed, 'ArrowUp', 3), { kind: 'move', state: { open: true, active: 2 } })
  assert.deepEqual(pickKey(open, 'Home', 3), { kind: 'move', state: { open: true, active: 0 } })
  assert.deepEqual(pickKey(open, 'End', 3), { kind: 'move', state: { open: true, active: 2 } })
  assert.deepEqual(pickKey(open, 'Enter', 3), { kind: 'pick', index: 1 })
  assert.deepEqual(pickKey(closed, 'Enter', 3), { kind: 'none' })
  assert.deepEqual(pickKey(open, 'Enter', 0), { kind: 'none' })
  assert.deepEqual(pickKey(open, 'Escape', 3), { kind: 'close' })
  assert.deepEqual(pickKey(closed, 'Escape', 3), { kind: 'clear' })
  assert.deepEqual(pickKey(open, 'a', 3), { kind: 'none' })
})

test('the picker is an ARIA combobox with a listbox, and shows state', () => {
  const picker = source('Picker.tsx')
  for (const attribute of ['role="combobox"', 'aria-expanded=', 'aria-controls=', 'aria-autocomplete="list"', 'aria-activedescendant=', 'role="listbox"', 'role="option"', 'aria-selected='])
    assert.ok(picker.includes(attribute), attribute)
  assert.match(picker, /item\.state &&/)
  assert.match(picker, /more; type to narrow/)
})

test('every task and spec choice uses the picker', () => {
  assert.match(source('StopLine.tsx'), /<Picker label=\{required\(label\)\}/)
  assert.doesNotMatch(source('StopLine.tsx'), /items\.map\(\(item\) => \(\s*<option/)
  assert.match(source('FilterBar.tsx'), /kind: 'pick', key: 'plan'/)
  assert.match(source('ConflictsView.tsx'), /kind: 'pick', key: 'plan'/)
  assert.match(source('FilterPanel.tsx'), /field\.kind === 'pick'/)
  assert.match(source('TaskForm.tsx'), /<Picker\s+label="Add a prerequisite"/)
})

test('filtering 5,000 tasks shows at most 50', () => {
  const large = pickIndex(Array.from({ length: 5000 }, (_, i) => ({ id: `t${i}`, title: `Task number ${i} of the plan`, spec: `spec-${i % 40}`, state: 'ready' })))
  const { shown, total } = pickMatches(large, 'task')
  assert.equal(shown.length, MAX_SHOWN)
  assert.equal(total, 5000)
})

test('the dialog offers Stop all agents, which asks first and warns', () => {
  assert.deepEqual(
    PULL_KINDS.map((k) => k.value),
    ['line', 'agents'],
  )
  assert.match(FULL_STOP_WARNING, /Replies in progress are lost/)
  assert.match(FULL_STOP_WARNING, /committed and saved files/)
  assert.deepEqual(toPull({ ...emptyPull(), kind: 'agents', scope: 'task', reason: ' runaway ' }).input, { scope: 'all', full: true, reason: 'runaway' })
  assert.equal(toPull({ ...emptyPull(), kind: 'agents' }).error, 'Reason is required.')
  const dialog = source('StopLine.tsx')
  const pull = dialog.slice(dialog.indexOf('const pull = async'), dialog.indexOf('const empty ='))
  assert.ok(pull.indexOf('await confirm(') < pull.indexOf('flows.stop('), 'the confirm comes before the stop')
  assert.match(pull, /body: FULL_STOP_WARNING/)
  assert.match(dialog, /name="avoozl-stop-kind"/)
  assert.equal(
    bannerText({
      id: 's',
      manual: true,
      full: true,
      by: { kind: 'person', name: 'dashboard' },
      reason: 'runaway',
      scope: 'all',
      paused: 4,
      sessions: [
        { slot: 'a', taskId: 'a1', role: 'worker', attempt: 1, stopped: true },
        { slot: 'b', taskId: 'b1', role: 'worker', attempt: 1, stopped: false, error: 'refused' },
      ],
    }),
    'All agents stopped by dashboard: runaway. 1 chat stopped; 1 could not be stopped. 4 tasks paused.',
  )
  assert.match(source('FlowView.tsx'), /stop\.full \? 'Resume all agents\?'/)
})
