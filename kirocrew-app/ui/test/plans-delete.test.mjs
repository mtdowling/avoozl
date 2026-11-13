// Plans: each category is a boxed section, the plan view's left column
// scrolls on its own, and Delete plan says what happens before it acts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { deleteLines, rowActions } from '../src/plans-api.ts'

const plans = readFileSync(new URL('../src/PlansView.tsx', import.meta.url), 'utf8')

test('the confirm says what happens to each part of an approved plan', () => {
  const lines = deleteLines({ id: 'p', title: 'shared-incremental-compiler', spec: 's', retire: true, open: 3, running: 1, done: 4, dependents: 2, folder: null })
  assert.deepEqual(lines, [
    '3 open tasks: archived. Their rows stay as history.',
    '1 running chat: left alone. Each task is archived when its chat ends.',
    '4 done tasks: kept as they are.',
    '2 tasks outside the plan that wait on it: each gets a decision for you.',
    'The plan is marked deleted and stays in history. There is no undo button.',
  ])
  assert.match(deleteLines({ retire: false }).join(' '), /stays in history/)
})

test('only a stored plan offers Delete, red, at the far right', () => {
  assert.equal(rowActions({ kind: 'spec', status: 'not imported', spec: 's', planId: null }).deletable, false)
  assert.equal(rowActions({ kind: 'spec', status: 'approved', spec: 's', planId: 'p1' }).deletable, true)
  assert.match(plans, /\{props\.onDelete && \(\s*<IconBtn icon=\{Trash2\} label=\{`Delete \$\{row\.name\}`\}[^>]*style=\{dangerStyle\}/)
  assert.match(plans, /Also delete the spec folder \(\.kiro\/specs\/\{preview\.spec\}\/\) from the repo\./)
  assert.match(plans, /useState\(false\)/)
  assert.match(plans, /disabled=\{!preview \|\| busy \|\| blocked\}/)
})

test('each category is its own boxed section with a heading line', () => {
  assert.match(plans, /data-plan-group=\{group\.category\}\s+className="rounded-xl border p-4"/)
  assert.match(plans, /<h2 id=\{id\} className="m-0">/)
  assert.match(plans, /className="flex w-full flex-wrap items-center gap-2 text-left text-lg font-semibold"/)
  assert.match(plans, /<ProgressBar tasks=\{tasks\} \/>/)
  assert.match(plans, /pages\.more\(group\.category, group\.rows\.length\)/)
})

test('the plan view left column sticks and scrolls on its own', () => {
  assert.match(plans, /position: 'sticky', top: 8, zIndex: LAYER\.sticky, maxHeight: asideHeight \?\? 'calc\(100vh - 2rem\)', overflowY: 'auto'/)
  assert.match(plans, /const \[asideRef, asideHeight\] = useStickyHeight\(!stack\)/)
})
