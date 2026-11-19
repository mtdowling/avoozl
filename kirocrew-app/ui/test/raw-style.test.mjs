// A view composes parts; only src/ui/ writes classes, styles and CSS variables
// (UC3). Each file outside src/ui/ may write at most the count listed in
// raw-style-allow.json. The list only shrinks: a rise fails, a view not on the
// list must be at zero, and a listed view at zero must leave the list.
//
// A raw style is a className or style attribute, a <style> element, or a
// `var(--` in a string, template or JSX text. Run with RAW_STYLE_UPDATE=1 to
// lower the list after a move; it never raises a count.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'rolldown/utils'

const src = new URL('../src/', import.meta.url)
const srcDir = fileURLToPath(src)
const uiDir = path.join(srcDir, 'ui')
// The standalone host shim and its header are not views (SW1).
const standaloneDir = path.join(srcDir, 'standalone')
const allowUrl = new URL('./raw-style-allow.json', import.meta.url)

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full !== uiDir && full !== standaloneDir) walk(full, found)
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(full)
  }
  return found
}

const countVars = (text) => (text.match(/var\(--/g) ?? []).length

// Counts of each kind of raw style in one source text.
export function rawStyleCount(file, text) {
  const { program } = parseSync(file, text, {
    lang: file.endsWith('x') ? 'tsx' : 'ts',
  })
  const found = { className: 0, style: 0, styleElement: 0, cssVariable: 0 }
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    switch (node.type) {
      case 'JSXAttribute':
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'className') found.className++
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'style') found.style++
        break
      case 'JSXOpeningElement':
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'style') found.styleElement++
        break
      case 'Literal':
        if (typeof node.value === 'string') found.cssVariable += countVars(node.value)
        break
      case 'TemplateElement':
        found.cssVariable += countVars(node.value.raw)
        break
      case 'JSXText':
        found.cssVariable += countVars(node.value)
        break
    }
    for (const key of Object.keys(node)) if (key !== 'type') visit(node[key])
  }
  visit(program)
  return found
}

const total = (found) => Object.values(found).reduce((a, b) => a + b, 0)

function viewCounts() {
  const counts = {}
  for (const file of walk(srcDir)) {
    const n = total(rawStyleCount(file, readFileSync(file, 'utf8')))
    if (n) counts[path.relative(srcDir, file).split(path.sep).join('/')] = n
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

const allow = () => JSON.parse(readFileSync(allowUrl, 'utf8'))

// Files that rose, and listed files that are at zero.
export function compare(current, listed) {
  const rose = []
  for (const [file, n] of Object.entries(current)) if (n > (listed[file] ?? 0)) rose.push(`${file}: ${n}, allowed ${listed[file] ?? 0}`)
  const stale = Object.keys(listed).filter((file) => !current[file])
  return { rose, stale }
}

if (process.env.RAW_STYLE_UPDATE) {
  const current = viewCounts()
  const next = {}
  for (const [file, n] of Object.entries(allow())) if (current[file]) next[file] = Math.min(n, current[file])
  writeFileSync(allowUrl, `${JSON.stringify(next, null, 2)}\n`)
}

test('no view writes more raw styles than the allow-list names', () => {
  assert.deepEqual(compare(viewCounts(), allow()).rose, [])
})

test('a listed view that reached zero leaves the list', () => {
  assert.deepEqual(compare(viewCounts(), allow()).stale, [])
})

test('the check fails on an extra raw style, on a new view, and on a listed view at zero', () => {
  const listed = { 'A.tsx': 2, 'B.tsx': 1 }
  assert.deepEqual(compare({ 'A.tsx': 2, 'B.tsx': 1 }, listed), {
    rose: [],
    stale: [],
  })
  assert.equal(compare({ 'A.tsx': 3, 'B.tsx': 1 }, listed).rose.length, 1)
  assert.equal(compare({ 'A.tsx': 2, 'B.tsx': 1, 'C.tsx': 1 }, listed).rose.length, 1)
  assert.deepEqual(compare({ 'A.tsx': 2 }, listed).stale, ['B.tsx'])
})

test('the counter reads className, style, <style> and var(-- in a view', () => {
  const found = rawStyleCount('x.tsx', 'const a = <div className="a" style={{ color: "var(--x)" }}><style>{`b { color: var(--y) }`}</style><i className={`c`} /></div>')
  assert.deepEqual(found, {
    className: 2,
    style: 1,
    styleElement: 1,
    cssVariable: 2,
  })
})

// Muted text is a Hint, so a new look for hints is one edit (D1, proof
// uc-p1): a view's Box takes no muted text color of its own. Buttons and
// icons in the muted color are not hints and keep it.
const MUTED = { tone: ['muted'], 'css-color': ['muted', 'text-muted-muted'] }
export function mutedBoxes(file, text) {
  const { program } = parseSync(file, text, { lang: 'tsx' })
  let n = 0
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && node.name.name === 'Box')
      for (const a of node.attributes) if (a.type === 'JSXAttribute' && MUTED[a.name.name]?.includes(a.value?.type === 'Literal' ? a.value.value : undefined)) n++
    for (const key of Object.keys(node)) if (key !== 'type') visit(node[key])
  }
  visit(program)
  return n
}

test('muted text in a view is a Hint, not a muted Box', () => {
  const found = walk(srcDir)
    .filter((file) => file.endsWith('.tsx') && mutedBoxes(file, readFileSync(file, 'utf8')))
    .map((file) => path.relative(srcDir, file).split(path.sep).join('/'))
  assert.deepEqual(found, [])
  assert.equal(mutedBoxes('x.tsx', '<><Box tone="muted" /><Box css-color="muted" /><Box tone="danger" /><Hint /></>'), 2)
})
