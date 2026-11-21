// Plans: every spec is in one list, and the plan view's details are a box on
// its Overview tab.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const plans = readFileSync(new URL('../src/PlansView.tsx', import.meta.url), 'utf8')

test('every spec is in one list: name, status chip, task count and epic', () => {
  assert.match(plans, /export function SpecList/)
  assert.match(plans, /<Badge variant=\{SPEC_CHIP_VARIANT\[chip\]\}>\{SPEC_CHIP_LABEL\[chip\]\}<\/Badge>/)
  assert.match(plans, /row\.epicTitle \?\? 'No epic'/)
  assert.doesNotMatch(plans, /HomeBadge/)
  assert.doesNotMatch(plans, /data-plan-group|EpicsView/)
})

test('the plan view has no details panel in the list column; its details are a box on the Overview tab', () => {
  assert.doesNotMatch(plans, /SpecDetailsPanel/)
  assert.match(plans, /<SpecDetailsBox>\{specRail\}<\/SpecDetailsBox>/)
  assert.match(plans, /\n\s+fill\n/)
  assert.doesNotMatch(plans, /useStickyHeight|useRailWidth|SPEC_RAIL/)
})
