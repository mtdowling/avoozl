// No page part opens from the right edge; dialogs are centered modals
// (modal-layout.test.mjs and modal-cover.test.mjs drive them in Chrome).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

test('no page part opens from the right edge', () => {
  const dir = new URL('../src/', import.meta.url)
  for (const name of readdirSync(dir).filter((f) => /\.tsx$/.test(f) && f !== 'Panel.tsx')) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /side="right"|<Shelf\b|justifyContent: 'flex-end' \}\}>/, `${name} opens a pull-out`)
  }
  assert.equal(existsSync(new URL('Shelf.tsx', dir)), false, 'Shelf.tsx is gone')
})
