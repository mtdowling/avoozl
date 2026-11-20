// Phase 34 in the page (design §4.21, §4.22, §4.25): the Evidence section,
// the findings and Ready to merge items in Needs you, and how they are wired.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { mediaUrl, sizeText } from '../src/evidence-api.ts'
import { CONFLICT_TABS, noActionReason } from '../src/conflicts-api.ts'
import { CONFLICT_LABELS } from '../src/views-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const file = (type) => ({ name: 'f', type, size: 1, sha256: 'x' })

test('only an image or video renders inline, from clean base64', () => {
  assert.equal(mediaUrl(file('image/png'), 'iVBORw0K'), 'data:image/png;base64,iVBORw0K')
  assert.equal(mediaUrl(file('video/mp4'), 'AAAA'), 'data:video/mp4;base64,AAAA')
  assert.equal(mediaUrl(file('image/svg+xml'), 'AAAA'), null)
  assert.equal(mediaUrl(file('text/html'), 'AAAA'), null)
  assert.equal(mediaUrl(file('image/png'), 'AA"onload'), null)
  assert.equal(sizeText(512), '512 B')
  assert.equal(sizeText(2048), '2 KB')
  assert.equal(sizeText(3 * 1048576), '3.0 MB')
})

test('findings and pull requests Avoozl opened are Needs you items with their own actions', () => {
  const item = { kind: 'investigation', taskId: 'a1', title: 't', detail: 'd', authority: 'local' }
  assert.equal(noActionReason(item), null)
  assert.ok(CONFLICT_TABS.find((tab) => tab.key === 'needs-human').keep(item))
  assert.ok(CONFLICT_LABELS.investigation)
  for (const reason of ['draft-pr', 'pr-merge']) assert.equal(noActionReason({ ...item, kind: 'needs-human', reason }), null, reason)
  const page = source('ConflictsView.tsx')
  for (const words of ['Go ahead', 'Investigate again', 'Approve', 'Merge', 'Open pull request']) assert.ok(page.includes(words), words)
  assert.match(source('views-api.ts'), /'investigation\.decide'/)
  assert.match(source('views-api.ts'), /'landing\.ready'/)
  assert.match(source('views-api.ts'), /'landing\.merge'/)
  assert.match(source('TaskDrawer.tsx'), /<EvidenceFold [^>]*box=\{\{ id: 'evidence'/)
  assert.match(source('evidence-api.ts'), /'task\.evidence'/)
})
