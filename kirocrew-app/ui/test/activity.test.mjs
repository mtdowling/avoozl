// The Activity tab (design §4.19, R71): its pure helpers and how the page
// wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ACTIVITY_FILTER_STORE, filterActive, filterOptions, retentionInput, rowTarget } from '../src/activity-api.ts'
import { PAGE } from '../src/paging.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const row = (extra = {}) => ({ seq: 1, at: '2026-11-13T00:00:00Z', source: 'local', actor: 'owner', kind: 'dispatch', summary: 'Dispatched a1', targetId: null, link: null, redacted: false, ...extra })

test('a task row opens the drawer, a GitHub row opens its https link, anything else goes nowhere', () => {
  assert.deepEqual(rowTarget(row({ targetId: 'a1', task: true })), { kind: 'task', id: 'a1' })
  assert.deepEqual(rowTarget(row({ link: 'https://github.com/o/app/issues/4' })), { kind: 'link', href: 'https://github.com/o/app/issues/4' })
  assert.equal(rowTarget(row({ link: 'javascript:alert(1)' })), null)
  assert.equal(rowTarget(row({ link: 'http://github.com/o/app' })), null)
  assert.equal(rowTarget(row({ targetId: 'gone' })), null)
})

test('filter choices come from the log and keep the one in use', () => {
  const page = { items: [], total: 0, sources: ['github', 'local'], kinds: ['dispatch'], actors: ['owner'], retentionDays: 30 }
  const options = filterOptions(page, { kind: 'github.close' })
  assert.deepEqual(
    options.sources.map((o) => o.label),
    ['All', 'GitHub', 'This workspace'],
  )
  assert.deepEqual(
    options.kinds.map((o) => o.value),
    ['', 'dispatch', 'github.close'],
  )
  assert.equal(filterActive({}), false)
  assert.equal(filterActive({ actor: 'owner' }), true)
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  ACTIVITY_FILTER_STORE.write(storage, 'w1', { source: 'mcp' })
  assert.deepEqual(ACTIVITY_FILTER_STORE.read(storage, 'w1'), { source: 'mcp' })
  assert.deepEqual(ACTIVITY_FILTER_STORE.read(storage, 'w2'), {})
})

test('Keep activity takes 1–365 whole days, and blank means the default', () => {
  assert.deepEqual(retentionInput(''), { days: null })
  assert.deepEqual(retentionInput(' 14 '), { days: 14 })
  for (const bad of ['0', '366', '2.5', 'ten']) assert.ok(retentionInput(bad).error, bad)
})

test('the tab: its own nav entry and icon, the shared heading, filter panel and 100-row pages', () => {
  const app = source('App.tsx'),
    view = source('ActivityView.tsx')
  assert.match(source('nav-api.ts'), /\{ key: 'activity', label: 'Activity' \}/)
  assert.match(app, /tab === 'activity' \? \(\s*<ActivityView workspaceId=\{active\} \/>/)
  assert.match(source('icons.ts'), /activity: History,/)
  assert.match(view, /<ViewHeading\s+id="avoozl-activity-title"\s+view="activity"[\s\S]*?actions=\{/)
  assert.match(view, /<Section title="Keep activity"[^>]*level="card"/)
  assert.match(view, /<Card className="flex flex-col gap-4">\s*<Section title="Keep activity"/)
  assert.match(view, /<FilterPanel\s+id="avoozl-activity"/)
  for (const key of ['source', 'kind', 'actor']) assert.match(view, new RegExp(`key: '${key}'`), key)
  assert.match(view, /<ShowMore left=\{page\.total - rows\.length\}/)
  assert.equal(PAGE, 100)
  // GitHub opens in a new tab with no opener; a task opens the drawer.
  assert.match(view, /target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(view, /rel="noreferrer"/)
  assert.match(view, /drawer\.openTask\(target\.id\)/)
  assert.match(source('activity-api.ts'), /'activity\.list', \{ \.\.\.filter, offset \}/)
})
