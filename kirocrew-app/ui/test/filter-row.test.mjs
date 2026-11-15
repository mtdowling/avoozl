// A list column's filters are one line: Filters, the count once, and Refresh
// on the same row (Needs you and Specs).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Needs you shows its count once, on the Filters row', () => {
  const view = source('ConflictsView.tsx')
  assert.equal(view.match(/\{matching\.length\} of \{items\.length\}/g).length, 1)
  assert.match(view, /shown\.length < matching\.length \? `\$\{shown\.length\} shown of \$\{matching\.length\}` : ''/)
  assert.match(source('PlansView.tsx'), /<PlanFilters[^>]*>\s*<span className="text-xs text-muted" role="status">/)
  assert.match(source('FilterPanel.tsx'), /props\.folded && props\.children && <div className="flex min-w-0 flex-1 items-center gap-2">\{props\.children\}<\/div>/)
})
