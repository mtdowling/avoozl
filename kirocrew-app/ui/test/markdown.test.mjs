import assert from 'node:assert/strict'
import test from 'node:test'
import { blocks, inline } from '../src/markdown.ts'
import { documentTabs } from '../src/plans-api.ts'

test('plan Markdown reads as headings, lists, checkboxes, tables and code', () => {
  const doc = [
    '# Design',
    '',
    'A loader, then a **validator**.',
    '',
    '- [ ] 1 Load config',
    '  - [x] 1.1 Read the file',
    '1. First',
    '',
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '```js',
    'x <script>',
    '```',
    '> Quoted',
    '---',
  ].join('\n')
  assert.deepEqual(
    blocks(doc).map((b) => b.kind),
    ['heading', 'paragraph', 'list', 'list', 'table', 'code', 'quote', 'rule'],
  )
  const [, , checks] = blocks(doc)
  assert.deepEqual(
    checks.items.map((i) => [i.text, i.checked, i.depth]),
    [
      ['1 Load config', false, 0],
      ['1.1 Read the file', true, 1],
    ],
  )
  // Code stays text; the renderer never sets HTML.
  assert.equal(blocks(doc)[5].text, 'x <script>')
})

test('inline marks parse, and only http(s) links are kept', () => {
  assert.deepEqual(inline('a `b` **c** _d_'), [
    { kind: 'text', text: 'a ' },
    { kind: 'code', text: 'b' },
    { kind: 'text', text: ' ' },
    { kind: 'strong', children: [{ kind: 'text', text: 'c' }] },
    { kind: 'text', text: ' ' },
    { kind: 'em', children: [{ kind: 'text', text: 'd' }] },
  ])
  assert.equal(inline('[x](https://example.com/a)')[0].href, 'https://example.com/a')
  assert.equal(inline('[x](javascript:alert(1))')[0].href ?? null, null)
})

test('a spec folder shows its documents in reading order', () => {
  const docs = { name: 's', folder: '.kiro/specs/s/', hash: 'h', documents: { 'tasks.md': 't', 'design.md': 'd', 'bugfix.md': 'b' } }
  assert.deepEqual(
    documentTabs(docs).map((tab) => tab.label),
    ['Bugfix', 'Design', 'Tasks'],
  )
  assert.deepEqual(documentTabs(null), [])
})
