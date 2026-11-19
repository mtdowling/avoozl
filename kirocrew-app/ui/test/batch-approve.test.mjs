// Batch approval on the Specs page: Batch chips and the Batch filter come
// from plan.approvalBatches, and Approve N specs sends the exact hashes shown.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { batchNumbers, filterRows, missingOwners } from '../src/plans-api.ts'

const plans = readFileSync(new URL('../src/PlansView.tsx', import.meta.url), 'utf8')
const entry = (id, batch, needs = []) => ({ id, spec: id, title: id, hash: `${id}-hash`, batch, tasks: 1, errors: 0, loop: false, needs })
const batches = {
  batches: [
    { batch: 1, specs: [entry('a', 1)] },
    { batch: 2, specs: [entry('b', 2, ['a']), entry('c', 2, ['b'])] },
  ],
}
const row = (planId) => ({ key: `spec:${planId}`, kind: 'spec', name: planId, spec: planId, planId, status: 'draft', now: { ready: 0, running: 0, needsYou: 0 } })

test('each draft plan gets the batch plan.approvalBatches gives it', () => {
  assert.deepEqual(
    [...batchNumbers(batches)],
    [
      ['a', 1],
      ['b', 2],
      ['c', 2],
    ],
  )
  assert.equal(batchNumbers(null).size, 0)
})

test('the Batch filter shows only that batch', () => {
  const rows = ['a', 'b', 'c', 'approved'].map(row)
  assert.deepEqual(
    filterRows(rows, { batch: '2' }, batchNumbers(batches)).map((r) => r.planId),
    ['b', 'c'],
  )
  assert.equal(filterRows(rows, {}, batchNumbers(batches)).length, 4)
})

test('a selection that leaves out an earlier draft names it', () => {
  const all = batches.batches.flatMap((b) => b.specs)
  assert.deepEqual(missingOwners(all.filter((e) => e.batch === 2)), ['a'])
  assert.deepEqual(missingOwners(all), [])
})

test('Approve N specs sends each shown hash and uses small buttons in the shared modal', () => {
  assert.match(plans, /entries\.map\(\(entry\) => \(\{ id: entry\.id, expectedHash: entry\.hash \}\)\)/)
  assert.match(plans, /<Modal\s+id="avoozl-approve-specs"/)
  assert.match(plans, /<SmallBtn primary disabled=\{busy \|\| entries\.length === 0\}/)
  assert.match(plans, /Select all shown/)
  assert.match(plans, /<Badge>Batch \{batch\}<\/Badge>/)
})

test('the approve dialog lists specs in a bordered table that scrolls on its own', () => {
  assert.match(plans, /<Box data-approve-list css-border-color="border" overflow="x-auto" rounded="base" border="all">/)
  assert.match(plans, /css-table-layout="fixed"/)
  assert.match(plans, /<Box\s+as="th"[^>]*css-text-align="right"\s+css-font-variant-numeric="tabular-nums"\s*>\s*Writes\s*<\/Box>/)
  // A phone shows the name and writes; the rest is in the row tooltip.
  assert.match(plans, /props\.phone \? \['auto', '5rem'\]/)
  assert.match(plans, /<Tooltip text=\{tip\} display="block">/)
})

test('every Specs page button uses the compact host style, one primary per group', () => {
  assert.doesNotMatch(plans, /<IconLabel (?!look=\{COMPACT\})/)
  for (const line of plans.split('\n').filter((l) => l.includes('<Btn '))) assert.match(line, /\{\.\.\.COMPACT\}/, line)
  // A spec's Approve is the header's one primary button (data-spec-primary).
  assert.match(plans, /approve: \{ label: 'Approve', icon: ClipboardCheck/)
  assert.match(plans, /<Btn\s+type="button"\s+primary\s+data-spec-primary=\{primary\}/)
  assert.match(plans, /<TipBtn primary \{\.\.\.COMPACT\}/)
})
