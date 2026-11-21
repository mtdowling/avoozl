// A greyed filter's why is a tooltip, not a line under the field.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a disabled filter says why in a tooltip, not in text under it', () => {
  const select = source('FilterSelect.tsx')
  assert.match(select, /<Tooltip text=\{props\.hint\}/)
  assert.doesNotMatch(select, /-hint`\}/)
})
