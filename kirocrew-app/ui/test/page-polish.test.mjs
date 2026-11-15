// Trace runs full width; Flow has a Retros tab, a boxed "No timing yet" and a
// greyed Phase filter whose why is a tooltip, not a line under the field.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Trace has no centered max width', () => {
  assert.doesNotMatch(source('TraceView.tsx'), /mx-auto|max-w-/)
})

test('Flow: Retros is its own tab, and Overview no longer lists retros', () => {
  const flow = source('FlowView.tsx')
  assert.match(source('nav-api.ts'), /\{ key: 'retros', label: 'Retros' \}/)
  assert.match(flow, /tab === 'retros' \? \(\s*view \? <Retros /)
  assert.equal(flow.match(/<Retros /g).length, 1)
  assert.match(flow, /<Card data-no-timing>\s*<EmptyState[\s\S]{0,120}title="No timing yet"/)
})

test('a disabled filter says why in a tooltip, not in text under it', () => {
  const select = source('FilterSelect.tsx')
  assert.match(select, /<Tooltip text=\{props\.hint\}/)
  assert.doesNotMatch(select, /-hint`\}/)
  assert.doesNotMatch(source('FlowView.tsx'), /Pick a plan first/)
})
