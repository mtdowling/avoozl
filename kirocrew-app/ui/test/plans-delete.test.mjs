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
    '2 tasks outside the spec that wait on it: each gets a decision for you.',
    'The spec is marked deleted and stays in history. There is no undo button.',
  ])
  assert.match(deleteLines({ retire: false }).join(' '), /stays in history/)
})

test('only a stored plan offers Delete, red, last in the spec menu', () => {
  assert.equal(rowActions({ kind: 'spec', status: 'not imported', spec: 's', planId: null }).deletable, false)
  assert.equal(rowActions({ kind: 'spec', status: 'approved', spec: 's', planId: 'p1' }).deletable, true)
  assert.match(plans, /\{actions\.onDelete && <MenuItem icon=\{Trash2\} label="Delete" danger tooltip="Delete this spec\. You confirm first; it stays in history\." onClick=\{actions\.onDelete\} \/>\}\s*<\/div>\s*<\/MoreMenu>/)
  assert.match(plans, /onDelete: actions\.deletable \? \(\) => setDeleting\(row\) : undefined/)
  assert.match(plans, /Also delete the spec folder \(\.kiro\/specs\/\{preview\.spec\}\/\) from the repo\./)
  assert.match(plans, /useState\(false\)/)
  assert.match(plans, /disabled=\{!preview \|\| busy \|\| blocked\}/)
})

test('every spec is in one list: name, status chip, task count, epic and where it lives', () => {
  assert.match(plans, /export function SpecList/)
  assert.match(plans, /<Badge variant=\{SPEC_CHIP_VARIANT\[chip\]\}>\{SPEC_CHIP_LABEL\[chip\]\}<\/Badge>/)
  assert.match(plans, /row\.epicTitle \?\? 'No epic'/)
  assert.match(plans, /<HomeBadge home=\{row\.home\} \/>/)
  assert.doesNotMatch(plans, /data-plan-group|EpicsView/)
})

test('the plan view has no details panel in the list column; its details are a box on the Overview tab', () => {
  assert.doesNotMatch(plans, /SpecDetailsPanel/)
  assert.match(plans, /<SpecDetailsBox>\{specRail\}<\/SpecDetailsBox>/)
  assert.match(plans, /fill=\{Boolean\(row\) && !reviewing\}/)
  assert.doesNotMatch(plans, /useStickyHeight|useRailWidth|SPEC_RAIL/)
})
