// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
// The Plans left column in the real app page: Kiro Crew scrolls the app's
// own content pane, which is shorter than the window and, when the plan
// first opens, not yet overflowing. The column must measure against it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { scrollParent, stickyHeight } from '../src/sticky-column.ts'

// The host chain: <main overflow-y:auto> > app root > content pane
// (overflow-y:auto, 160px below the window top) > grid > aside.
function hostFrame({ windowHeight = 900, paneTop = 160, loaded = false } = {}) {
  const main = { name: 'main', parentElement: null, clientHeight: windowHeight - 42, overflowY: 'auto' }
  const root = { name: 'root', parentElement: main, clientHeight: windowHeight - 42, overflowY: 'visible' }
  const pane = {
    name: 'pane',
    parentElement: root,
    clientHeight: windowHeight - paneTop,
    // Not overflowing yet while the plan loads.
    scrollHeight: loaded ? 4000 : windowHeight - paneTop,
    overflowY: 'auto',
    getBoundingClientRect: () => ({ top: paneTop, bottom: windowHeight }),
  }
  const grid = { name: 'grid', parentElement: pane, clientHeight: 0, overflowY: 'visible' }
  const aside = { name: 'aside', parentElement: grid, clientHeight: 0, overflowY: 'auto' }
  return { aside, pane, windowHeight }
}
const styleOf = (node) => ({ overflowY: node.overflowY })

test('the column finds the app pane that scrolls, before the plan has loaded', () => {
  const { aside, pane } = hostFrame({ loaded: false })
  assert.equal(scrollParent(aside, styleOf), pane)
  assert.equal(scrollParent(null, styleOf), null)
})

test('the column is no taller than the visible part of the pane, so its end is reachable', () => {
  const { aside, windowHeight } = hostFrame({ loaded: false })
  const height = stickyHeight(scrollParent(aside, styleOf), windowHeight)
  const visible = windowHeight - 160
  assert.ok(height <= visible, `column ${height}px is taller than the ${visible}px pane`)
  // Measured against the window instead, the column runs past the pane's bottom.
  assert.ok(stickyHeight(null, windowHeight) > visible)
})

// The function this replaced: it skipped a pane that did not overflow yet,
// so a column mounted before its plan loaded was sized to the window.
function previousScrollParent(el) {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement)
    if (/(auto|scroll|overlay)/.test(node.overflowY) && node.scrollHeight > node.clientHeight) return node
  return null
}

test('the previous lookup missed the pane at mount (the bug this fixes)', () => {
  const { aside, windowHeight } = hostFrame({ loaded: false })
  const before = stickyHeight(previousScrollParent(aside), windowHeight)
  const after = stickyHeight(scrollParent(aside, styleOf), windowHeight)
  assert.ok(after < before, `fixed height ${after} should be smaller than the old ${before}`)
})
