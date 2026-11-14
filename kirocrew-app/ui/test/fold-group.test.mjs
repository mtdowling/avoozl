// Folds that share a group are exclusive: opening one closes the others.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const controls = readFileSync(new URL('../src/controls.tsx', import.meta.url), 'utf8')

// closeOthers is plain logic; load it without the JSX around it.
const body = controls.match(/export function closeOthers[\s\S]*?\n}\n/)[0]
const closeOthers = new Function(`${body.replace(/^export /, '').replace(/: \{ open: boolean \}|: Iterable<\{ open: boolean \}>/g, '')}; return closeOthers`)()

test('opening one fold closes the others in its group', () => {
  const folds = [{ open: true }, { open: false }, { open: true }]
  folds[1].open = true
  closeOthers(folds[1], folds)
  assert.deepEqual(folds.map((f) => f.open), [false, true, false])
})

test('closing a fold leaves the others alone', () => {
  const folds = [{ open: true }, { open: false }]
  closeOthers(folds[1], folds)
  assert.deepEqual(folds.map((f) => f.open), [true, false])
})

test('Fold uses native <details name>, with the toggle fallback scoped to its own group', () => {
  assert.match(controls, /name=\{group\}/)
  assert.match(controls, /data-fold-group=\{group\}/)
  assert.match(controls, /closeOthers\(el, el\.ownerDocument\.querySelectorAll<HTMLDetailsElement>\(`details\[data-fold-group="\$\{CSS\.escape\(group\)\}"\]`\)\)/)
  // The summary stays a native <summary>, so keyboard and screen readers work.
  assert.match(controls, /<summary\b/)
})

test('the drawer folds are one group with one section open at first', () => {
  const drawer = readFileSync(new URL('../src/TaskDrawer.tsx', import.meta.url), 'utf8')
  const folds = [...drawer.matchAll(/<Fold id="(\w+)" group="([\w-]+)"/g)]
  assert.equal(folds.length, 10)
  assert.deepEqual([...new Set(folds.map((m) => m[2]))], ['task-drawer'])
  assert.match(drawer, /id="summary"[^>]*open=\{detail\.conflicts\.length === 0\}/)
  assert.match(drawer, /id="conflicts"[^>]*open=\{detail\.conflicts\.length > 0\}/)
})
