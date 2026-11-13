// Where a task came from: the source line text and the excerpt the drawer
// reads from the file, with the task's own lines marked.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { sourceExcerpt, sourceLine } from '../src/task-api.ts'

test('a source names its file and lines', () => {
  const base = { document: 'todo/a.md', title: null, checked: null, readable: true }
  assert.equal(sourceLine({ ...base, lineStart: null, lineEnd: null }), 'todo/a.md')
  assert.equal(sourceLine({ ...base, lineStart: 4, lineEnd: 4 }), 'todo/a.md, line 4')
  assert.equal(sourceLine({ ...base, lineStart: 4, lineEnd: 6 }), 'todo/a.md, lines 4–6')
})

test('the excerpt keeps context around the task lines and marks them', () => {
  const text = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
  const rows = sourceExcerpt(text, { lineStart: 10, lineEnd: 11 }, 2)
  assert.deepEqual(rows.map((r) => r.number), [8, 9, 10, 11, 12, 13])
  assert.deepEqual(rows.filter((r) => r.hit).map((r) => r.text), ['line 10', 'line 11'])
  assert.equal(sourceExcerpt('a\nb', { lineStart: 1, lineEnd: 1 }, 6).length, 2)
})

test('the drawer shows where the task came from with a reader', () => {
  const drawer = readFileSync(new URL('../src/TaskDrawer.tsx', import.meta.url), 'utf8')
  assert.match(drawer, /<Row label="Came from">/)
  assert.match(drawer, /tasks\.document\(props\.workspaceId, source\.document\)/)
  assert.match(drawer, /no longer in this workspace/)
})

test('the excerpt says which lines it shows, of how many', async () => {
  const { excerptLabel, excerptRange } = await import('../src/task-api.ts')
  const text = Array.from({ length: 512 }, (_, i) => `l${i + 1}`).join('\n') + '\n'
  assert.deepEqual(excerptRange(text, { lineStart: 294, lineEnd: 294 }), { from: 288, to: 300, total: 512 })
  assert.equal(excerptLabel(text, { lineStart: 294, lineEnd: 294 }), 'Lines 288–300 of 512')
  assert.equal(excerptLabel(text, { lineStart: 510, lineEnd: 512 }), 'Lines 504–512 of 512')
  assert.equal(excerptLabel('only', { lineStart: 1, lineEnd: 1 }), 'Line 1 of 1')
})

test('the origin sentence links each mention of the file path', async () => {
  const { linkParts } = await import('../src/task-api.ts')
  const path = '.kiro/specs/s/design.md'
  const parts = linkParts(`Approving .kiro/specs/s/ made this task, from ${path}, line 294.`, path)
  assert.deepEqual(parts, [
    { text: 'Approving .kiro/specs/s/ made this task, from ', link: false },
    { text: path, link: true },
    { text: ', line 294.', link: false },
  ])
  assert.deepEqual(linkParts('no path here', path), [{ text: 'no path here', link: false }])
})

test('the reader finds the block that holds a cited line', async () => {
  const { blockForLine } = await import('../src/task-api.ts')
  const { blocks } = await import('../src/markdown.ts')
  const doc = ['# Title', '', 'Para one', 'still one', '', '- a', '- b', '', '```js', 'x', 'y', '```', '', '## Next'].join('\n')
  const found = blocks(doc)
  assert.deepEqual(found.map((b) => [b.kind, b.line]), [['heading', 1], ['paragraph', 3], ['list', 6], ['code', 9], ['heading', 14]])
  assert.deepEqual(found[2].items.map((i) => i.line), [6, 7])
  // List items render after their list, so a line picks the item.
  const lines = [1, 3, 6, 6, 7, 9, 14]
  assert.equal(blockForLine(lines, 4), 1)
  assert.equal(blockForLine(lines, 7), 4)
  assert.equal(blockForLine(lines, 11), 5)
  assert.equal(blockForLine(lines, 99), 6)
  assert.equal(blockForLine([5], 2), -1)
})

test('Reveal only joins a relative path with no parent steps to the workspace', async () => {
  const { insideWorkspace, lineText } = await import('../src/task-api.ts')
  assert.equal(insideWorkspace('.kiro/specs/s/design.md'), true)
  assert.equal(insideWorkspace('/etc/passwd'), false)
  assert.equal(insideWorkspace('a/../../b.md'), false)
  assert.equal(insideWorkspace('C:\\x.md'), false)
  assert.equal(insideWorkspace(''), false)
  assert.equal(lineText({ lineStart: 294, lineEnd: 294 }), 'Line 294')
  assert.equal(lineText({ lineStart: 4, lineEnd: 6 }), 'Lines 4–6')
  assert.equal(lineText({ lineStart: null, lineEnd: null }), null)
})

test('the full-file reader is a trapped, closable modal over the page', () => {
  const reader = readFileSync(new URL('../src/DocumentReader.tsx', import.meta.url), 'utf8')
  const drawer = readFileSync(new URL('../src/TaskDrawer.tsx', import.meta.url), 'utf8')
  // The plan reader's renderer, highlighter and outline; document.get reads.
  assert.match(reader, /<Markdown text=\{doc\.text\}/)
  assert.match(reader, /registerLanguages\(/)
  assert.match(reader, /outline\(doc\.text/)
  assert.match(reader, /tasks\.document\(workspaceId, target\.document\)/)
  // Esc and Back close it before the drawer under it (it is the newer
  // step in the page's history); Tab wraps; backdrop closes.
  assert.match(reader, /useBackStep\('modal', true, 'Close the file', onClose\)/)
  assert.match(reader, /addEventListener\('keydown', onKey, true\)/)
  assert.match(reader, /event\.key !== 'Tab'/)
  assert.match(reader, /data-reader-backdrop className="absolute inset-0" onClick=\{onClose\}/)
  assert.match(reader, /aria-modal="true"/)
  // No motion when motion is off; full screen when narrow.
  assert.match(reader, /behavior: still \? 'auto' : 'smooth'/)
  // The cited lines stay marked; no flash.
  assert.match(reader, /markCited\(root, target\.lineStart, target\.lineEnd, still\)/)
  assert.doesNotMatch(reader, /FLASH_MS|el\.animate/)
  assert.match(reader, /width: narrow \? '100vw'/)
  // The drawer opens it from the path link, Open full file and the excerpt.
  assert.match(drawer, /data-origin-path/)
  assert.equal((drawer.match(/setFull\(/g) ?? []).length >= 4, true)
  // Came from shows the whole file with the cited lines marked.
  assert.match(drawer, /<CitedFile\s+text=\{reading\.text\}/)
  assert.doesNotMatch(drawer, /sourceExcerpt\(/)
})

test('a citation marks a range, a task block, or a heading through its section', async () => {
  const { citedNodes } = await import('../src/task-api.ts')
  const nodes = [
    { line: 1, tag: 'h1' },
    { line: 3, tag: 'h2' },
    { line: 4, tag: 'p' },
    { line: 6, tag: 'ul' },
    { line: 6, tag: 'li' },
    { line: 7, tag: 'li' },
    { line: 9, tag: 'h3' },
    { line: 10, tag: 'p' },
    { line: 12, tag: 'h2' },
    { line: 13, tag: 'p' },
  ]
  // A range marks every block that starts inside it.
  assert.deepEqual(citedNodes(nodes, 4, 7), [2, 3, 4, 5])
  // One line on a task (list item) marks that item, its whole block.
  assert.deepEqual(citedNodes(nodes, 7, 7), [5])
  // One line on a heading marks it through the next sibling heading.
  assert.deepEqual(citedNodes(nodes, 3, null), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(citedNodes(nodes, 9, 9), [6, 7])
  // One line in a paragraph marks that paragraph only.
  assert.deepEqual(citedNodes(nodes, 13, null), [9])
  assert.deepEqual(citedNodes(nodes, null, null), [])
})

test('the cited file renders the whole text, marks with a class, and skips animation under reduced motion', () => {
  const cited = readFileSync(new URL('../src/CitedFile.tsx', import.meta.url), 'utf8')
  assert.match(cited, /<Markdown text=\{text\}/)
  assert.match(cited, /node\.classList\.add\(CITED_CLASS\)/)
  assert.match(cited, /export const CITED_CLASS = 'avoozl-cited'/)
  assert.match(cited, /box-shadow: inset 3px 0 0 var\(--accent\)/)
  assert.match(cited, /behavior: still \? 'auto' : 'smooth'/)
  assert.match(cited, /prefers-reduced-motion: reduce/)
  assert.match(cited, /maxHeight: props\.maxHeight \?\? 420, overflowY: 'auto'/)
})
