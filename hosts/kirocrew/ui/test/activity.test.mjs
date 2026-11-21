// The Activity tab (design §4.19, R71): its pure helpers and how the page
// wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ACTIVITY_FILTER_STORE, SOURCE_LABELS, filterActive, filterChoices, activityParts, actorHref, retentionAutosave, retentionInput, rowTarget } from '../src/activity-api.ts'
import { PAGE } from '../src/paging.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const row = (extra = {}) => ({
  seq: 1,
  at: '2026-11-13T00:00:00Z',
  source: 'local',
  actor: 'owner',
  kind: 'dispatch',
  summary: 'Dispatched a1',
  targetId: null,
  link: null,
  redacted: false,
  ...extra,
})

test('a task row opens the drawer, a GitHub row opens its item, anything else goes nowhere', () => {
  const known = ['o/app']
  assert.deepEqual(rowTarget(row({ targetId: 'a1', task: true }), known), { kind: 'task', id: 'a1' })
  assert.deepEqual(rowTarget(row({ link: 'https://github.com/o/app/issues/4' }), known), { kind: 'link', href: 'https://github.com/o/app/issues/4' })
  // A GitHub link to a repository the workspace lacks (or in local mode) is text.
  assert.equal(rowTarget(row({ link: 'https://github.com/o/app/issues/4' }), []), null)
  assert.equal(rowTarget(row({ link: 'https://github.com/evil/x/pull/1' }), known), null)
  assert.deepEqual(rowTarget(row({ link: 'https://tracker.example/T-1' }), known), { kind: 'link', href: 'https://tracker.example/T-1' })
  assert.equal(rowTarget(row({ link: 'javascript:alert(1)' }), known), null)
  assert.equal(rowTarget(row({ link: 'http://github.com/o/app' }), known), null)
  assert.equal(rowTarget(row({ targetId: 'gone' }), known), null)
})

test('filter choices come from the log with their counts, and keep the one in use', () => {
  const page = {
    items: [],
    total: 0,
    sources: ['github', 'local'],
    kinds: ['dispatch'],
    actors: ['owner'],
    counts: { source: { github: 2, local: 5 }, kind: { dispatch: 7 } },
    retentionDays: 30,
  }
  const choices = filterChoices(page, { kind: 'github.close' })
  assert.deepEqual(
    choices.sources.map((o) => [o.label, o.count]),
    [
      ['GitHub', 2],
      ['This workspace', 5],
    ],
  )
  assert.deepEqual(
    choices.kinds.map((o) => [o.value, o.count]),
    [
      ['dispatch', 7],
      ['github.close', 0],
    ],
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
  let now = 0,
    next = 1
  const timers = new Map()
  const box = retentionAutosave({
    save: (days) => sent.push(days),
    setTimer: (run, ms) => (timers.set(next, { at: now + ms, run }), next++),
    clearTimer: (id) => timers.delete(id),
  })
  box.reset(known)
  const wait = (ms) => {
    now += ms
    for (const [id, t] of [...timers]) if (t.at <= now) timers.delete(id), t.run()
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
  for (const text of ['1', '12', '120']) box.change(text), wait(300)
  assert.deepEqual(sent, [])
  wait(800)
  assert.deepEqual(sent, [120])
})

test('Keep activity: an invalid value never saves, not even on blur', () => {
  const { box, sent, wait } = autosave()
  for (const bad of ['0', '366', '2.5', 'ten']) box.change(bad), wait(900), box.flush(bad)
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

// The links in a row's summary, as [text, href] pairs.
const known = ['o/app', 'nupp-lang/foo']
const links = (extra, repositories = known) =>
  activityParts(row({ repository: 'o/app', ...extra }), repositories)
    .filter((part) => part.href)
    .map((part) => [part.text, part.href])

test('an intake row links owner/repo#N only for a repository the workspace has', () => {
  assert.deepEqual(links({ source: 'github', kind: 'intake.item', summary: 'New pr nupp-lang/foo#12 from github' }), [
    ['nupp-lang/foo#12', 'https://github.com/nupp-lang/foo/pull/12'],
  ])
  assert.deepEqual(links({ source: 'github', kind: 'intake.item', summary: 'New issue nupp-lang/foo#3 from github' }), [
    ['nupp-lang/foo#3', 'https://github.com/nupp-lang/foo/issues/3'],
  ])
  // Text naming a repository the workspace does not have stays text, and a
  // stored URL is never used.
  assert.deepEqual(links({ source: 'github', kind: 'intake.item', summary: 'New pr evil/repo#1 from github', link: 'https://github.com/evil/repo/pull/1' }), [])
})

test('task rows link their commit and branch in the task repository', () => {
  assert.deepEqual(links({ kind: 'task.landed', summary: 'a1 landed at 0123456789ab after 2 tries' }), [['0123456789ab', 'https://github.com/o/app/commit/0123456789ab']])
  assert.deepEqual(links({ kind: 'task.ticked', summary: 'a1 is done: ticked in tasks.md on avoozl/spec/a1 at 0123abc' }), [
    ['avoozl/spec/a1', 'https://github.com/o/app/tree/avoozl/spec/a1'],
    ['0123abc', 'https://github.com/o/app/commit/0123abc'],
  ])
  assert.deepEqual(links({ kind: 'plan.approved', summary: 'rewrite approved by me@x.dev in commit 0123456789ab on rewrite-v3' }), [
    ['0123456789ab', 'https://github.com/o/app/commit/0123456789ab'],
    ['rewrite-v3', 'https://github.com/o/app/tree/rewrite-v3'],
  ])
  assert.deepEqual(links({ kind: 'worker.released', summary: 'Released the worker session for a1: its tick on main won' }), [['main', 'https://github.com/o/app/tree/main']])
  // "on" names a branch only in the kinds that write one.
  assert.deepEqual(links({ kind: 'github.board-resumed', summary: 'a1 moved out of Deferred on the board' }), [])
})

test('pull request, issue and check rows link to GitHub', () => {
  assert.deepEqual(links({ source: 'github', kind: 'github.check', summary: 'Check test failed on pull request #12' }), [
    ['test', 'https://github.com/o/app/pull/12/checks'],
    ['pull request #12', 'https://github.com/o/app/pull/12'],
  ])
  assert.deepEqual(links({ source: 'github', kind: 'github.close', summary: 'Issue #2 closed by pull request #10' }), [
    ['Issue #2', 'https://github.com/o/app/issues/2'],
    ['pull request #10', 'https://github.com/o/app/pull/10'],
  ])
  assert.deepEqual(links({ source: 'github', kind: 'github.handback', summary: 'Crew Nova handed back issue #6: it needs a person' }), [
    ['issue #6', 'https://github.com/o/app/issues/6'],
  ])
  assert.deepEqual(links({ kind: 'note', summary: 'Spec issue #7 published' }), [['issue #7', 'https://github.com/o/app/issues/7']])
  assert.deepEqual(links({ kind: 'note', summary: 'Labeled #8' }), [['#8', 'https://github.com/o/app/issues/8']])
})

test('a GitHub login links to its profile, in the summary and the Who cell', () => {
  const close = {
    source: 'github',
    kind: 'github.close',
    actor: 'octo',
    targetId: 'a1',
    task: true,
    link: 'https://github.com/o/app/issues/4',
    summary: "octo closed a1's issue without merged code (completed); dependents released",
  }
  // The task's Target opens the drawer, so its issue follows the summary.
  assert.deepEqual(links(close), [
    ['octo', 'https://github.com/octo'],
    ['#4', 'https://github.com/o/app/issues/4'],
  ])
  assert.equal(actorHref(row(close), known), 'https://github.com/octo')
  assert.equal(actorHref(row({ ...close, source: 'local' }), known), null)
  assert.equal(actorHref(row(close), []), null)
  const token = {
    source: 'github',
    kind: 'github.token',
    actor: 'gh',
    summary: 'New GitHub token from gh on github.com for land on o/app: signed in as octo, full access, no expiry.',
  }
  assert.deepEqual(links(token), [
    ['o/app', 'https://github.com/o/app'],
    ['octo', 'https://github.com/octo'],
  ])
  // A token row may name its provider as the actor, so Who stays text.
  assert.equal(actorHref(row(token), known), null)
})

test('with no GitHub repository, or redacted, a row stays text', () => {
  const summary = 'a1 landed at 0123456789ab after 2 tries'
  assert.deepEqual(activityParts(row({ kind: 'task.landed', summary, repository: null }), []), [{ text: summary }])
  assert.deepEqual(links({ kind: 'task.landed', summary, repository: null }), [])
  assert.deepEqual(links({ kind: 'task.landed', summary, repository: 'other/repo' }), [])
  assert.deepEqual(links({ kind: 'note', summary: 'Merged pull request #3', redacted: true }), [])
  // The text around the links is kept as it is.
  assert.equal(
    activityParts(row({ kind: 'task.landed', summary, repository: 'o/app' }), known)
      .map((part) => part.text)
      .join(''),
    summary,
  )
})

test('the page opens each GitHub link in a new tab, from the shared helper', () => {
  const view = source('ActivityView.tsx')
  assert.match(view, /<TextLink href=\{linkHref\(url\)\} target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(view + source('activity-api.ts'), /https:\/\/github\.com/)
})

test('the tick is a source with its own label and filter row', () => {
  assert.equal(SOURCE_LABELS.tick, 'Tick')
  const page = { items: [], total: 3, sources: ['local', 'tick'], kinds: ['tick.failed'], actors: ['avoozl'], counts: { source: { local: 1, tick: 2 } }, retentionDays: 30 }
  assert.deepEqual(filterChoices(page, {}).sources, [
    { value: 'local', label: 'This workspace', count: 1 },
    { value: 'tick', label: 'Tick', count: 2 },
  ])
})
