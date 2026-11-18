// The Activity tab (design §4.19, R71): its pure helpers and how the page
// wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ACTIVITY_FILTER_STORE, filterActive, filterChoices, githubItem, retentionAutosave, retentionInput, rowTarget } from '../src/activity-api.ts'
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

test('filter choices come from the log with their counts, and keep the one in use', () => {
  const page = { items: [], total: 0, sources: ['github', 'local'], kinds: ['dispatch'], actors: ['owner'], counts: { source: { github: 2, local: 5 }, kind: { dispatch: 7 } }, retentionDays: 30 }
  const choices = filterChoices(page, { kind: 'github.close' })
  assert.deepEqual(
    choices.sources.map((o) => [o.label, o.count]),
    [['GitHub', 2], ['This workspace', 5]],
  )
  assert.deepEqual(
    choices.kinds.map((o) => [o.value, o.count]),
    [['dispatch', 7], ['github.close', 0]],
  )
  // An older app sends no counts: each choice counts 0, and still shows.
  assert.deepEqual(filterChoices({ ...page, counts: undefined }, {}).actors, [{ value: 'owner', label: 'owner', count: 0 }])
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
  assert.match(view, /<ViewHeading id="avoozl-activity-title" view="activity">/)
  // Refresh is on the top line beside pause, as on Home (page-refresh.tsx).
  assert.match(view, /usePublishRefresh\(useRefreshCountdown\(workspaceId,/)
  // The filters and Keep activity sit in the left nav, under Activity.
  // As rows and chips like the Specs rail: no dropdowns.
  assert.match(view, /<NavSlotFor section="activity">\s*<div role="search" aria-label="Filter activity" data-nav-filters="avoozl-activity"/)
  assert.doesNotMatch(view, /<select|kind: 'select'|NavFilters/)
  assert.match(view, /<RailChips id="kinds"[^>]*picked=\{filter\.kind\}/)
  assert.match(view, /<RailChips id="people"[^>]*picked=\{filter\.actor\}/)
  assert.match(view, /<RailBlock id="keep" icon=\{Clock\} title="Keep activity">\s*<KeepActivity /)
  assert.match(view, /<ShowMore left=\{page\.total - rows\.length\}/)
  assert.equal(PAGE, 100)
  // GitHub opens in a new tab with no opener; a task opens the drawer.
  assert.match(view, /target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(view, /rel="noreferrer"/)
  assert.match(view, /drawer\.openTask\(target\.id\)/)
  assert.match(source('activity-api.ts'), /'activity\.list', \{ \.\.\.filter, offset \}/)
})

// A fake clock so the 800 ms pause runs without waiting.
function autosave(known = '') {
  const sent = []
  let now = 0, next = 1
  const timers = new Map()
  const box = retentionAutosave({
    save: (days) => sent.push(days),
    setTimer: (run, ms) => (timers.set(next, { at: now + ms, run }), next++),
    clearTimer: (id) => timers.delete(id),
  })
  box.reset(known)
  const wait = (ms) => {
    now += ms
    for (const [id, t] of [...timers]) if (t.at <= now) (timers.delete(id), t.run())
  }
  return { box, sent, wait }
}

test('Keep activity: typing then a pause saves once, after 800 ms', () => {
  const { box, sent, wait } = autosave()
  box.change('14')
  wait(799)
  assert.deepEqual(sent, [])
  wait(1)
  assert.deepEqual(sent, [14])
  wait(5000)
  assert.deepEqual(sent, [14])
})

test('Keep activity: fast typing saves once, with the last value', () => {
  const { box, sent, wait } = autosave()
  for (const text of ['1', '12', '120']) (box.change(text), wait(300))
  assert.deepEqual(sent, [])
  wait(800)
  assert.deepEqual(sent, [120])
})

test('Keep activity: an invalid value never saves, not even on blur', () => {
  const { box, sent, wait } = autosave()
  for (const bad of ['0', '366', '2.5', 'ten']) (box.change(bad), wait(900), box.flush(bad))
  assert.deepEqual(sent, [])
})

test('Keep activity: blur saves at once, once; an unchanged value does not save', () => {
  const { box, sent, wait } = autosave('10')
  box.change('20')
  box.flush('20')
  wait(900)
  box.flush('20')
  assert.deepEqual(sent, [20])
  box.change('10')
  box.change('20')
  wait(900)
  assert.deepEqual(sent, [20])
  box.reset('')
  box.flush('')
  assert.deepEqual(sent, [20])
})

test('Keep activity: clearing the field saves the default (null)', () => {
  const { box, sent, wait } = autosave('10')
  box.change('')
  wait(800)
  assert.deepEqual(sent, [null])
})

test('Keep activity has no Save button and saves on blur and Enter', () => {
  const view = source('ActivityView.tsx')
  const keep = view.slice(view.indexOf('function KeepActivity'), view.indexOf('export default function ActivityView'))
  assert.doesNotMatch(keep, /Save<|<TipBtn/)
  assert.match(keep, /onBlur=\{\(\) => auto\.current\?\.flush\(text\)\}/)
  assert.match(keep, /event\.key === 'Enter'/)
  assert.match(keep, /'Saving…'/)
  assert.match(keep, /'Saved'/)
})

test('a GitHub intake row links owner/repo#N to the item, from stored data', () => {
  const github = (extra = {}) => row({ source: 'github', kind: 'intake.item', summary: 'New pr nupp-lang/foo#12 from github', ...extra })
  assert.deepEqual(githubItem(github()), { before: 'New pr ', text: 'nupp-lang/foo#12', after: ' from github', href: 'https://github.com/nupp-lang/foo/pull/12' })
  assert.equal(githubItem(github({ summary: 'New issue nupp-lang/foo#3 from github' })).href, 'https://github.com/nupp-lang/foo/issues/3')
  // The stored link wins; an unsafe one is ignored.
  assert.equal(githubItem(github({ link: 'https://ghe.example/nupp-lang/foo/pull/12' })).href, 'https://ghe.example/nupp-lang/foo/pull/12')
  assert.equal(githubItem(github({ link: 'javascript:alert(1)' })).href, 'https://github.com/nupp-lang/foo/pull/12')
  assert.equal(githubItem(github({ source: 'plugin' })), null)
  assert.equal(githubItem(github({ redacted: true })), null)
  assert.match(source('ActivityView.tsx'), /<a href=\{item\.href\} target="_blank" rel="noopener noreferrer"/)
})
