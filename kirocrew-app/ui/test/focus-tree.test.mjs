// The Graph's Frontier and Focus tree (FocusTree.tsx, focus-tree.ts): what
// unlocked, one task's or spec's live chain, drilling in, Back and Forward,
// the ?tree= link, keyboard moves, the item modal, and no read beyond the
// graph.view the page already made. Browser parts run in a real Chrome
// (AVOOZL_CHROME), skipped without one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const tree = await import('../src/focus-tree.ts')
const { chainsGraph } = await import('./browser/graph-chains.ts')
const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

test('Frontier: newly unlocked has every blocker met; waiting has one still open', () => {
  const { ready, waiting } = tree.frontier(chainsGraph)
  assert.deepEqual(ready.map((f) => f.task.id), ['S3', 'B2'])
  assert.deepEqual(ready[0].blockers.map((b) => [b.task.id, b.met]), [['S1', true], ['S2', true]])
  assert.deepEqual(waiting.map((f) => f.task.id), ['S4', 'S5', 'S6', 'Y2', 'Y3', 'B3', 'B5'])
  assert.deepEqual(waiting.find((f) => f.task.id === 'Y3').waitingOn.map((t) => t.id), ['Y2', 'S5'])
  // B4 waits only by sequence order, and Y1 on nothing: in neither list.
  assert.ok(![...ready, ...waiting].some((f) => ['B4', 'Y1', 'Y4'].includes(f.task.id)))
})

test('a draft task is never newly unlocked, and drafts fold in only with the toggle on', async () => {
  const { draftsGraph } = await import('./browser/graph-chains.ts')
  const { withDrafts } = await import('../src/views-api.ts')
  assert.equal(withDrafts(draftsGraph, false), draftsGraph)
  const shown = withDrafts(draftsGraph, true)
  assert.equal(shown.total, chainsGraph.total + 4)
  assert.ok(shown.tasks.filter((t) => t.state === 'draft').every((t) => !t.ready))
  const { ready, waiting } = tree.frontier(shown)
  // M1 waits only on done S1, yet its spec is a draft: not unlocked.
  assert.deepEqual(ready.map((f) => f.task.id), ['S3', 'B2'])
  assert.ok(!waiting.some((f) => f.task.id === 'M1'))
  assert.ok(waiting.some((f) => f.task.id === 'M2'))
  const m2 = tree.focusTree(shown, { kind: 'task', id: 'M2' })
  assert.deepEqual(m2.graph.tasks.map((t) => t.id).sort(), ['M1', 'M2', 'M3', 'M4', 'S3'])
})

test('a task tree is its live chain up and down, with met blockers as ghosts', () => {
  const s3 = tree.focusTree(chainsGraph, { kind: 'task', id: 'S3' })
  assert.deepEqual(s3.graph.tasks.map((t) => t.id).sort(), ['B3', 'B4', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'Y3'])
  assert.deepEqual([...s3.ghosts].sort(), ['S1', 'S2'])
  assert.equal(s3.live, 6)
  assert.ok(s3.graph.edges.find((e) => e.from === 'S1').satisfied, 'a met edge is drawn faded')
  assert.equal(s3.graph.edges.find((e) => e.from === 'B3').kind, 'sequence', 'sequence order stays dashed')
  // Re-rooting changes what is shown: Y3's chain has Y1 and Y2, not S6.
  const y3 = tree.focusTree(chainsGraph, { kind: 'task', id: 'Y3' })
  assert.deepEqual(y3.graph.tasks.map((t) => t.id).sort(), ['B3', 'B4', 'S3', 'S4', 'S5', 'Y1', 'Y2', 'Y3'])
  assert.equal(y3.live, 7)
  assert.equal(tree.focusTree(chainsGraph, { kind: 'task', id: 'nope' }), null)
})

test('a spec tree roots on every task of the spec', () => {
  const billing = tree.focusTree(chainsGraph, { kind: 'spec', id: 'billing' })
  assert.deepEqual([...billing.roots].sort(), ['B1', 'B2', 'B3', 'B4', 'B5'])
  for (const id of ['Y3', 'Y2', 'S5']) assert.ok(billing.graph.tasks.some((t) => t.id === id), `${id} is upstream`)
  assert.equal(tree.rootTitle(chainsGraph, { kind: 'spec', id: 'billing' }), 'Billing')
})

test('the jump box takes a task ID or a spec name, and refuses an unclear one', () => {
  assert.deepEqual(tree.jumpTarget(chainsGraph, 's3'), { kind: 'task', id: 'S3' })
  assert.deepEqual(tree.jumpTarget(chainsGraph, 'Sync engine'), { kind: 'spec', id: 'sync-engine' })
  assert.deepEqual(tree.jumpTarget(chainsGraph, 'refund'), { kind: 'task', id: 'B5' })
  assert.equal(tree.jumpTarget(chainsGraph, 'search'), null, 'many match')
  assert.equal(tree.jumpTarget(chainsGraph, '   '), null)
})

test('links round-trip, and only Kiro Crew\'s app route pushes browser entries', () => {
  for (const place of [
    { tab: 'focus', root: { kind: 'task', id: 'meal-planner.1.2' } },
    { tab: 'focus', root: { kind: 'spec', id: 'search v2&x' } },
    { tab: 'frontier', root: null },
    { tab: 'all', root: null },
  ])
    assert.ok(tree.samePlace(tree.parseGraphLink(tree.placeLink(place)), place), JSON.stringify(place))
  assert.equal(tree.parseGraphLink('?tree=evil:x'), null)
  assert.equal(tree.parseGraphLink('?graph=nope'), null)
  assert.equal(tree.urlBase('/apps/avoozl'), '/apps/avoozl')
  assert.equal(tree.urlBase('/popout/apps/avoozl'), null)
  assert.equal(tree.urlBase('/harness/index.html'), null)
})

test('the trail walks Back and Forward, a new step drops what was ahead, and the browser lands on the nearest', () => {
  const a = { tab: 'frontier', root: null }
  const b = { tab: 'focus', root: { kind: 'task', id: 'S3' } }
  const c = { tab: 'focus', root: { kind: 'task', id: 'Y3' } }
  let t = tree.visit(tree.visit(tree.visit(tree.EMPTY_TRAIL, a), b, true), c, true)
  assert.equal(t.at, 2)
  assert.equal(tree.visit(t, c), t, 'the same place is no step')
  t = tree.step(t, -1)
  assert.ok(tree.samePlace(tree.trailPlace(t), b))
  assert.equal(tree.step(tree.step(t, -1), -1).at, 0, 'nothing before the first')
  assert.equal(tree.visit(t, a).list.length, 3, 'a new step drops the one ahead')
  assert.equal(tree.arrive(t, c).at, 2, 'browser Forward')
  assert.equal(tree.arrive(t, a).at, 0, 'browser Back')
  assert.deepEqual(tree.arrive(t, { tab: 'all', root: null }).url.at(-1), true)
})

test('arrow keys move to the nearest card that way', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 300, y: 0 },
    { id: 'c', x: 300, y: 70 },
    { id: 'd', x: 600, y: 70 },
  ]
  assert.equal(tree.nextNode(nodes, 'a', 'ArrowRight'), 'b')
  assert.equal(tree.nextNode(nodes, 'b', 'ArrowDown'), 'c')
  assert.equal(tree.nextNode(nodes, 'c', 'ArrowRight'), 'd')
  assert.equal(tree.nextNode(nodes, 'a', 'ArrowLeft'), null)
  assert.equal(tree.nextNode(nodes, 'a', 'Tab'), null)
})

test('the Graph reads only graph.view: no new call, GitHub or otherwise', () => {
  for (const file of ['FocusTree.tsx', 'focus-tree.ts']) {
    const text = source(file)
    assert.doesNotMatch(text, /\bfetch\(|api\.(post|get|put|del|request)\(|operation:/, `${file} makes no call of its own`)
  }
  assert.match(source('FocusTree.tsx'), /client\.graph\(id\)/)
  // The whole-graph tab draws from the page's one read.
  assert.match(source('GraphView.tsx'), /useRead\(source \? null : workspaceId, load\)/)
  // Theme variables only: no hex or rgb color in the new view.
  assert.doesNotMatch(source('FocusTree.tsx'), /#[0-9a-f]{3,6}\b|rgba?\(/i)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Graph tests'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

async function openGraph(width = 1280) {
  await page.open(harness.url({ page: 'app', graph: 'chains' }), { width, height: 900, dark: false })
  await page.until(`Boolean(document.querySelector('[data-shell]'))`)
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`)
  await page.evaluate(`(window.__ops = [], document.querySelector('[data-nav-item="dashboard/graph"]').click(), true)`)
  await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
}
const rooted = (id) => page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === ${JSON.stringify(id)}`)

test('Frontier, drill two levels, Back, Forward, the modal and Esc', { skip }, async () => {
  await openGraph()
  assert.equal(await page.evaluate(`document.querySelector('[data-frontier-sub]').textContent`), '2 newly unlocked · 7 still waiting')
  await page.evaluate(`document.querySelector('[data-frontier-row="S3"] button').click()`)
  assert.match(await page.evaluate(`document.querySelector('[data-frontier-why]').textContent`), /All blockers satisfied: S1 · S2 · open tree/)
  await page.evaluate(`[...document.querySelectorAll('[data-frontier-why] button')].find((b) => b.textContent.startsWith('open tree')).click()`)
  await rooted('task:S3')
  assert.equal(await page.evaluate(`document.querySelector('[data-tree-stat]').textContent`), 'tree of S3: 9 nodes · 6 live edges')
  assert.equal(await page.evaluate(`document.querySelector('[data-tree-card="S3"]').hasAttribute('data-root')`), true)
  // Click drills into Y3; Enter on B3 drills again.
  await page.evaluate(`document.querySelector('[data-tree-node="Y3"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await rooted('task:Y3')
  await page.evaluate(`document.querySelector('[data-tree-node="B3"]').focus()`)
  await page.key('Enter', 'Enter', 13)
  await rooted('task:B3')
  // Keyboard focus follows the new root; arrows move between cards.
  await page.until(`document.activeElement?.dataset.treeNode === 'B3'`)
  // B3 had focus before Enter: wait out the new root's focus frame.
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
  await page.key('ArrowRight', 'ArrowRight', 39)
  assert.equal(await page.evaluate(`document.activeElement.dataset.treeNode`), 'B4')
  await page.evaluate(`document.querySelector('[data-graph-nav="back"]').click()`)
  await rooted('task:Y3')
  await page.evaluate(`document.querySelector('[data-graph-nav="back"]').click()`)
  await rooted('task:S3')
  await page.evaluate(`document.querySelector('[data-graph-nav="forward"]').click()`)
  await rooted('task:Y3')
  // The page's Back (Alt+Left) walks the same steps.
  await page.evaluate(`document.querySelector('[data-tree-node="Y3"]').focus()`)
  await page.evaluate(`(document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })), true)`)
  await rooted('task:S3')
  // O opens the full task details, the view Specs opens, not the summary
  // modal; Esc closes them and focus returns to the card.
  const details = `Boolean(document.querySelector('[data-task-modal] [data-tab-panel="overview"] [data-section-box="summary"]'))`
  await page.evaluate(`document.querySelector('[data-tree-node="S3"]').focus()`)
  await page.key('o', 'KeyO', 79)
  await page.until(details)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-graph-item]'))`), false, 'no summary modal')
  assert.ok(await page.evaluate(`document.querySelectorAll('[data-task-modal] [data-tabs="task-tabs"] [role=tab]').length === 6`), 'every tab')
  assert.equal(await page.evaluate(`document.querySelector('[data-focus-tree]').dataset.focusTree`), 'task:S3', 'the graph stays')
  await page.key('Escape', 'Escape', 27)
  await page.until(`!document.querySelector('[data-task-modal]')`)
  await page.until(`document.activeElement?.dataset.treeNode === 'S3'`)
  // The ↗ on a card opens them too, without drilling; Back closes them.
  await page.evaluate(`document.querySelector('[data-tree-open="S6"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await page.until(details)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-graph-item]'))`), false, 'no summary modal')
  assert.equal(await page.evaluate(`document.querySelector('[data-focus-tree]').dataset.focusTree`), 'task:S3')
  await page.evaluate(`(document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })), true)`)
  await page.until(`!document.querySelector('[data-task-modal]')`)
  assert.equal(await page.evaluate(`document.querySelector('[data-focus-tree]').dataset.focusTree`), 'task:S3', 'Back closed the details, not the tree step')
  // All tasks: a click drills into the task's tree.
  await page.evaluate(`document.querySelector('[data-graph-tab="all"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-graph-view] [data-node="B2"]'))`)
  await page.evaluate(`document.querySelector('[data-graph-view] [data-node="B2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await rooted('task:B2')
  // One graph.view read for the Graph itself, plus the task details' own
  // reads each of the two times they opened (TaskDrawer.tsx). The others are
  // Refresh's rate and the nav's own counts, which every page change reads (App.tsx).
  const ops = await page.evaluate('window.__ops')
  const detailReads = ['task.detail', 'task.notes.list', 'task.files', 'task.evidence', 'budget.receipt']
  assert.equal(ops.filter((op) => op === 'graph.view').length, 1 + 2, ops.join(','))
  assert.equal(ops.filter((op) => op === 'task.detail').length, 2, ops.join(','))
  assert.deepEqual([...new Set(ops)].filter((op) => !['graph.view', 'github.settings.get', 'conflicts.view', 'untriaged.view', 'task.summary.request', ...detailReads].includes(op)), [], ops.join(','))
})

test('the jump box roots the tree on a spec; a phone shows one column', { skip }, async () => {
  await openGraph(390)
  await page.evaluate(`(() => { const i = document.querySelector('[data-graph-jump]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'billing'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); return true })()`)
  await rooted('spec:billing')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-tree-list]')) && !document.querySelector('[data-tree-scroll] > svg')`), true)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no sideways scroll')
  await page.evaluate(`(() => { const i = document.querySelector('[data-graph-jump]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'search'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); return true })()`)
  await page.until(`Boolean(document.querySelector('#avoozl-graph-jump-error'))`)
})

test('which press pans: middle anywhere, left off a control, never touch', async () => {
  const { panPress } = await import('../src/drag-pan.ts')
  assert.equal(panPress({ pointerType: 'mouse', button: 0 }, false), true)
  assert.equal(panPress({ pointerType: 'mouse', button: 0 }, true), false, 'left on a card')
  assert.equal(panPress({ pointerType: 'mouse', button: 1 }, true), true, 'middle on a card')
  assert.equal(panPress({ pointerType: 'mouse', button: 2 }, false), false)
  assert.equal(panPress({ pointerType: 'touch', button: 0 }, false), false, 'touch scrolls natively')
})

// A point in the tree's scroll box: on empty space, or on a card's middle.
const spot = (card) =>
  page.evaluate(`(() => {
    const box = document.querySelector('[data-tree-scroll]').getBoundingClientRect()
    const card = ${JSON.stringify(card ?? null)}
    if (card) {
      // Scrolled into sight first, and the point must land on the card.
      const node = document.querySelector('[data-tree-node="' + card + '"]')
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const r = node.querySelector('rect:last-of-type').getBoundingClientRect()
      const at = { x: Math.round(r.left + r.width / 3), y: Math.round(r.top + r.height / 2) }
      return document.elementFromPoint(at.x, at.y)?.closest('[data-tree-node]') === node ? at : null
    }
    // Whole pixels, clear of any card or edge by a few pixels each way.
    const clear = (x, y) => [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].every(([dx, dy]) => {
      const at = document.elementFromPoint(x + dx, y + dy)
      return at && !at.closest('[data-tree-card], [data-tree-edge]') && at.closest('[data-tree-scroll]')
    })
    for (let y = Math.ceil(box.top) + 40; y < box.bottom - 8; y += 6)
      for (let x = Math.floor(box.right) - 16; x > box.left + 8; x -= 6) if (clear(x, y)) return { x, y }
    return null
  })()`)
const scrolled = () => page.evaluate(`(() => { const b = document.querySelector('[data-tree-scroll]'); return { left: b.scrollLeft, top: b.scrollTop } })()`)
const cursorAt = (x, y) => page.evaluate(`getComputedStyle(document.elementFromPoint(${x}, ${y})).cursor`)

test('drag to pan the Focus tree: left on empty space, middle anywhere; a drag never drills', { skip }, async () => {
  // A box smaller than the spec's tree, so it overflows both ways.
  await openGraph()
  await page.evaluate(`(() => { const i = document.querySelector('[data-graph-jump]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'billing'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); return true })()`)
  await rooted('spec:billing')
  await page.evaluate(`(document.querySelector('[data-tree-scroll]').style.cssText += ';width:480px;max-height:150px', true)`)
  // Past the new root's scroll-into-view frame, then from the top left.
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
  await page.evaluate(`(document.querySelector('[data-tree-scroll]').scrollTo(0, 0), true)`)
  assert.equal(await page.evaluate(`(() => { const b = document.querySelector('[data-tree-scroll]'); return b.scrollWidth > b.clientWidth + 100 && b.scrollHeight > b.clientHeight + 40 })()`), true, 'the tree overflows')
  const empty = await spot()
  assert.ok(empty, 'an empty spot in the box')
  assert.equal(await cursorAt(empty.x, empty.y), 'grab')
  // Left drag on empty space pans, and the cursor grabs while it moves.
  let at = await scrolled()
  await page.drag(empty.x, empty.y, empty.x - 80, 8, empty.y - 30, 'left', false)
  await page.until(`document.querySelector('[data-tree-scroll]').hasAttribute('data-panning')`)
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-tree-scroll]')).cursor`), 'grabbing')
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-tree-node="B2"]')).cursor`), 'grabbing', 'over a card too')
  await page.release(empty.x - 80, empty.y - 30)
  assert.deepEqual(await scrolled(), { left: at.left + 80, top: at.top + 30 })
  assert.equal(await page.evaluate(`document.querySelector('[data-tree-scroll]').hasAttribute('data-panning')`), false)
  assert.equal(await page.evaluate(`document.querySelector('[data-focus-tree]').dataset.focusTree`), 'spec:billing')
  // A left drag that starts on a card does not pan, and the card is the
  // pointer's again.
  const card = await spot('B2')
  assert.ok(card, 'B2 in sight')
  assert.equal(await cursorAt(card.x, card.y), 'pointer')
  at = await scrolled()
  await page.drag(card.x, card.y, card.x - 60, 8, card.y - 20)
  assert.deepEqual(await scrolled(), at, 'no pan from a card')
  // A middle drag over a card pans, and neither drills nor opens it.
  const over = await spot('B3')
  assert.ok(over, 'B3 in sight')
  at = await scrolled()
  await page.drag(over.x, over.y, over.x + 50, 8, over.y + 20, 'middle')
  const moved = await scrolled()
  assert.ok(moved.left < at.left || moved.top < at.top, `middle drag panned: ${JSON.stringify([at, moved])}`)
  at = moved
  await page.evaluate('new Promise((r) => setTimeout(r, 100))')
  assert.equal(await page.evaluate(`document.querySelector('[data-focus-tree]').dataset.focusTree`), 'spec:billing', 'no drill')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-graph-item]'))`), false, 'no modal')
  // The wheel still scrolls as before.
  await page.wheel(empty.x, empty.y, 20)
  await page.until(`document.querySelector('[data-tree-scroll]').scrollTop > ${at.top}`)
  // A short press that moves under the threshold is still a click: it drills.
  const b2 = await spot('B2')
  await page.drag(b2.x, b2.y, b2.x + 2, 2, b2.y + 1)
  await rooted('task:B2')
  // All tasks pans with a middle drag too, and the drag opens nothing.
  await page.evaluate(`document.querySelector('[data-graph-tab="all"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-graph-view] [data-node="B2"]'))`)
  // Any task node whose middle is in sight on the canvas.
  const node = await page.evaluate(`(() => {
    for (const n of document.querySelectorAll('[data-graph-view] [data-node]')) {
      const r = n.getBoundingClientRect()
      const at = { id: n.dataset.node, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      if (!n.getAttribute('aria-label').includes('collapsed') && document.elementFromPoint(at.x, at.y)?.closest('[data-node]') === n) return at
    }
    return null
  })()`)
  assert.ok(node, 'a task node in sight in All tasks')
  const before = await page.evaluate(`document.querySelector('[data-graph-view] svg[role="group"] > g').getAttribute('transform')`)
  await page.drag(node.x, node.y, node.x + 40, 8, node.y + 10, 'middle', false)
  await page.until(`document.querySelector('[data-graph-view] svg[role="group"]').hasAttribute('data-panning')`)
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-graph-view] [data-node="${node.id}"]')).cursor`), 'grabbing')
  await page.release(node.x + 40, node.y + 10, 'middle')
  assert.notEqual(await page.evaluate(`document.querySelector('[data-graph-view] svg[role="group"] > g').getAttribute('transform')`), before, 'All tasks panned')
  await page.evaluate('new Promise((r) => setTimeout(r, 100))')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-focus-tree]'))`), false, 'no drill')
})
