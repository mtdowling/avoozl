// The Graph's way back out: drill -> back -> back restores each level, the
// mouse back button and Alt+Left or Cmd+[ go back, and Esc never does.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { backLabel, drillCrumbs, drillLabel, isBackButton, isBackKey, popDrill, pushDrill, pushFilter } from '../src/graph-layout.ts'

const graph = readFileSync(new URL('../src/GraphView.tsx', import.meta.url), 'utf8')
const v = (x) => ({ x, y: 0, scale: 1 })

test('drill, drill, back, back restores each level with its view and selection', () => {
  const epic = { kind: 'epic', id: 'W1', title: 'Core execution' }
  const focus = { kind: 'focus', id: 'W1.3', title: 'W1.3' }
  let stack = pushDrill([], { drill: null, view: v(1), selected: null }, epic)
  stack = pushDrill(stack, { drill: epic, view: v(2), selected: 'W1.3' }, focus)
  assert.deepEqual(stack.map((e) => drillLabel(e.drill)), ['All tasks', 'Core execution'])
  assert.equal(backLabel(stack), 'Back to Core execution')
  let popped = popDrill(stack)
  assert.deepEqual(popped.entry, { drill: epic, view: v(2), selected: 'W1.3' })
  popped = popDrill(popped.stack)
  assert.deepEqual(popped.entry, { drill: null, view: v(1), selected: null })
  assert.equal(popDrill(popped.stack), null, 'nothing past the top')
  assert.equal(backLabel([]), null)
  // A crumb jumps straight to its level.
  assert.equal(popDrill(stack, 0).entry.drill, null)
  // Going to the top by other means clears the stack.
  assert.deepEqual(pushDrill(stack, { drill: focus, view: v(3), selected: null }, null), [])
  assert.equal(drillLabel(focus), 'Focus: W1.3')
})

test('the mouse back button and Alt+Left or Cmd+[ go back; Esc does not', () => {
  assert.equal(isBackButton({ button: 3 }), true)
  assert.equal(isBackButton({ button: 0 }), false)
  assert.equal(isBackKey({ key: 'ArrowLeft', altKey: true }), true)
  assert.equal(isBackKey({ key: '[', metaKey: true }), true)
  assert.equal(isBackKey({ key: 'Escape' }), false)
  assert.equal(isBackKey({ key: 'ArrowLeft' }), false)
  // The page's one Back history takes the button and keys (NavHistory.tsx);
  // each drill level is one of its steps, and it calls back() here.
  assert.doesNotMatch(graph, /onMouseUp=\{onBackButton\}/)
  assert.match(graph, /nav\.history\.sync\('graph', stack\.length,/)
  assert.match(graph, /nav\.handlers\.set\('graph', handler\)/)
  assert.doesNotMatch(graph, /pushState\(/)
  // Back restores the zoom and pan instead of refitting.
  assert.match(graph, /if \(restore\.current\) \{\s*setView\(restore\.current\)/)
  assert.match(graph, /<IconLabel icon=\{ArrowLeft\} tooltip=\{backLabel\(stack\)/)
})

test('a filter change inside a drill is one Back step; typing a search is one step', () => {
  const epic = { kind: 'epic', id: 'W1', title: 'Core execution' }
  let stack = pushDrill([], { drill: null, view: v(1), selected: null }, epic)
  const here = { drill: epic, view: v(2), selected: null }
  // At the top level a filter change is not a step.
  assert.equal(pushFilter([], { drill: null, view: v(1), selected: null }, {}, { state: 'ready' }).length, 0)
  stack = pushFilter(stack, here, {}, { state: 'ready' })
  assert.equal(stack.length, 2)
  assert.deepEqual(stack[1].filter, {})
  assert.equal(backLabel(stack), 'Back to Core execution, before the filter change')
  // Typing "abc" adds one step, kept at the filter before the first key.
  stack = pushFilter(stack, here, { state: 'ready' }, { state: 'ready', q: 'a' })
  stack = pushFilter(stack, here, { state: 'ready', q: 'a' }, { state: 'ready', q: 'ab' })
  stack = pushFilter(stack, here, { state: 'ready', q: 'ab' }, { state: 'ready', q: 'abc' })
  assert.equal(stack.length, 3)
  assert.deepEqual(stack[2].filter, { state: 'ready' })
  // No change, no step.
  assert.equal(pushFilter(stack, here, { q: 'x' }, { q: 'x' }).length, 3)
  // Filter steps add no crumbs: All tasks, then the epic as the current level.
  assert.deepEqual(drillCrumbs(stack, epic), [{ at: 0, label: 'All tasks' }])
  const popped = popDrill(stack)
  assert.deepEqual(popped.entry.filter, { state: 'ready' })
  assert.deepEqual(popped.entry.drill, epic)
  assert.match(graph, /onChange=\{changeFilter\}/)
})
