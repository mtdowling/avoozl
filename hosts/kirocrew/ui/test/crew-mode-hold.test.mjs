// A workspace a Crew Mode conductor drove waits in Needs you until a person
// chooses Let the tick run it (worker-paths WP1.3).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the crew-mode item asks first, then saves against the file hash it was read with', () => {
  const needs = source('ConflictsView.tsx')
  assert.match(needs, /item\.reason === 'crew-mode'/)
  assert.match(needs, /Let the tick run it/)
  assert.match(needs, /views\.letTickRun\(workspaceId, item\.hash \?\? undefined\)/)
  assert.match(source('views-api.ts'), /run<unknown>\('delivery\.runner\.release', expectedHash \? \{ expectedHash \} : \{\}, workspaceId\)/)
})
