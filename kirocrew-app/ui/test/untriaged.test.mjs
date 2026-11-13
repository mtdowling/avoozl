// The Untriaged tab's pure helpers (design §8.5) and how the page wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  age,
  emptyText,
  filterActive,
  filterOptions,
  matchesFilter,
  selectionHandOff,
  toggleSelected,
  triageRows,
} from '../src/untriaged-api.ts'
import { emptyRepository, toForm, toPolicy, untriagedDefault } from '../src/settings-api.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const NOW = Date.parse('2026-11-12T12:00:00Z')
const link = (n) => ({ url: '/issue-radar', exact: false, tooltip: `pick #${n}` })
const item = (number, extra = {}) => ({
  kind: 'issue',
  number,
  title: `Item ${number}`,
  url: `https://github.com/o/app/issues/${number}`,
  repository: 'o/app',
  author: 'alice',
  createdAt: new Date(NOW - 2 * 86400000).toISOString(),
  labels: [],
  comments: 0,
  links: { github: `https://github.com/o/app/issues/${number}`, issueRadar: link(number), review: null },
  ...extra,
})

test('filters by repository, kind, age, author and label', () => {
  const pr = item(6, { kind: 'pr', author: 'bob', labels: ['deps'], createdAt: new Date(NOW - 40 * 86400000).toISOString() })
  const one = item(1)
  assert.equal(matchesFilter(one, {}, NOW), true)
  assert.equal(matchesFilter(pr, { kind: 'issue' }, NOW), false)
  assert.equal(matchesFilter(pr, { kind: 'pr', author: 'bob', label: 'deps' }, NOW), true)
  assert.equal(matchesFilter(one, { age: '7' }, NOW), true)
  assert.equal(matchesFilter(one, { age: '1' }, NOW), false)
  assert.equal(matchesFilter(pr, { age: 'older' }, NOW), true)
  assert.equal(matchesFilter(one, { repository: 'o/lib' }, NOW), false)
  assert.equal(filterActive({}), false)
  assert.equal(filterActive({ label: 'deps' }), true)
  const options = filterOptions({ enabled: true, mode: 'single-repo', total: 2, repositories: [{ repository: 'o/app' }], items: [one, pr] })
  assert.deepEqual(options.authors.map((o) => o.value), ['alice', 'bob'])
  assert.deepEqual(options.labels.map((o) => o.value), ['deps'])
})

test('age is short and selection toggles rows', () => {
  assert.equal(age(new Date(NOW - 5 * 3600000).toISOString(), NOW), '5 h')
  assert.equal(age(new Date(NOW - 2 * 86400000).toISOString(), NOW), '2 d')
  assert.equal(age(null, NOW), '')
  const on = toggleSelected(new Set(), ['o/app#1', 'o/app#6'], true)
  assert.deepEqual([...toggleSelected(on, ['o/app#1'], false)], ['o/app#6'])
})

test('the bulk link opens Issue Radar and names the selection, as the fallback', () => {
  const bulk = selectionHandOff([item(1), item(6, { kind: 'pr' }), item(2, { repository: 'o/lib' })])
  assert.equal(bulk.url, '/issue-radar')
  assert.equal(bulk.exact, false)
  assert.match(bulk.tooltip, /can't take a selection from a link yet/)
  assert.match(bulk.tooltip, /o\/app #1, #6; o\/lib #2/)
  assert.match(selectionHandOff([]).tooltip, /Select GitHub rows/)
})

test('the empty state says what untriaged means and where to change it', () => {
  const checked = { enabled: true, mode: 'single-repo', total: 0, items: [], repositories: [{ repository: 'o/app', checkedAt: '2026-11-12T11:00:00Z', error: null }] }
  assert.match(emptyText(checked).subtitle, /no trigger rule, triage label or Avoozl task covers/)
  assert.match(emptyText(checked).subtitle, /Settings › Repositories › Triggers and labels › Untriaged/)
  assert.match(emptyText({ ...checked, repositories: [{ repository: 'o/app', checkedAt: null, error: null }] }).title, /Not checked yet/)
})

test('triage label checkboxes keep saved names GitHub no longer has', () => {
  assert.deepEqual(triageRows(['Triaged', 'gone'], ['bug', 'triaged']), [
    { name: 'bug', checked: false, missing: false },
    { name: 'triaged', checked: true, missing: false },
    { name: 'gone', checked: true, missing: true },
  ])
  assert.deepEqual(triageRows(['x'], null), [{ name: 'x', checked: true, missing: false }])
})

test('Settings round-trips untriaged and shows the default filter', () => {
  const github = {
    mode: 'single-repo',
    repositories: { 'o/app': { baseBranch: 'main', untriaged: { triageLabels: ['triaged'], ignoreOlderThanDays: 30, notify: true } } },
  }
  const form = toForm(github)
  assert.deepEqual(form.repositories[0].untriaged, { filter: '', triageLabels: ['triaged'], ignoreOlderThanDays: '30', notify: true })
  assert.deepEqual(toPolicy(form).repositories['o/app'].untriaged, { triageLabels: ['triaged'], ignoreOlderThanDays: 30, notify: true })
  assert.equal(toPolicy({ ...form, repositories: [emptyRepository('o/x')] }).repositories['o/x'].untriaged, undefined)
  assert.equal(untriagedDefault(['triaged', 'needs info']), '-label:triaged -label:"needs info"')
})

test('the tab is hidden outside GitHub modes and its badge is not yellow', () => {
  const app = source('App.tsx')
  assert.match(app, /TABS\.filter\(\(t\) => t\.key !== 'untriaged' \|\| untriaged !== null\)/)
  assert.match(app, /setUntriaged\(list\.enabled \? list\.total : null\)/)
  assert.match(app, /<Badge variant="info">\{untriaged\}<\/Badge>/)
  assert.match(source('icons.ts'), /untriaged: Inbox/)
  const view = source('UntriagedView.tsx')
  assert.match(view, /rel: 'noopener noreferrer'/)
  assert.match(view, /<ViewHeading id="avoozl-untriaged-title" view="untriaged">/)
})

test('Send to Issue Radar takes issues from one repository only', async () => {
  const { sendable } = await import('../src/untriaged-api.ts')
  assert.equal(sendable([]).ok, false)
  assert.match(sendable([item(1), item(6, { kind: 'pr' })]).reason, /Crews work issues/)
  assert.match(sendable([item(1), item(2, { repository: 'o/lib' })]).reason, /one repository/)
  assert.deepEqual(sendable([item(1), item(5)]), {
    ok: true,
    reason: 'Pick a crew and send 2 issues to it. You confirm the label first.',
    repository: 'o/app',
  })
})

test('the crew picker says what each crew watches and warns about an empty scope', async () => {
  const { crewLine, radarState } = await import('../src/untriaged-api.ts')
  assert.equal(crewLine({ id: 'c1', name: 'A', labels: ['radar', 'bugs'], status: null, emptyScope: false }), 'Watches radar, bugs. Avoozl adds radar.')
  assert.match(crewLine({ id: 'c2', name: 'B', labels: [], status: null, emptyScope: true }), /takes every open issue/)
  const radar = (extra) => ({ ...item(3), claimed: false, needsHuman: false, needsHumanLabel: 'crew: needs human', handoff: null, ...extra })
  assert.deepEqual(radarState(radar({ needsHuman: true, claimed: true })), { text: 'Needs you', tone: 'warning' })
  assert.deepEqual(radarState(radar({ claimed: true })), { text: 'Crew working', tone: 'info' })
  assert.equal(radarState(radar()).text, 'Waiting for a crew')
})

test('the dialog writes only after preview and its confirm button; Cancel is on every step', () => {
  const dialog = source('SendToRadar.tsx')
  const api = source('untriaged-api.ts')
  // The page's only write is the confirmed hand-off.
  assert.match(api, /'untriaged\.handoff', \{ \.\.\.input, preview: true \}/)
  assert.match(api, /'untriaged\.handoff', \{ \.\.\.input, confirm: true \}/)
  assert.match(dialog, /setPreview\(await client\.preview\(/)
  assert.match(dialog, /data-radar-send onClick=\{\(\) => void send\(\)\}/)
  assert.match(dialog, /\{step < 2 && \(\s*<Btn type="button" onClick=\{cancel\}>\s*Cancel/)
  assert.match(dialog, /useBackStep\('modal', true, 'Cancel', cancel\)/)
  assert.match(dialog, /role="dialog"\s*aria-modal="true"/)
  assert.match(dialog, /data-radar-empty-scope/)
  const view = source('UntriagedView.tsx')
  assert.match(view, /With Issue Radar \(\$\{radarItems\.length\}\)/)
  assert.match(view, /Send selected to Issue Radar/)
})

test('a crew asking for a person reads plainly in Conflicts', async () => {
  const { whyLine } = await import('../src/conflicts-api.ts')
  assert.equal(
    whyLine({ kind: 'needs-human', reason: 'crew', taskId: null, title: 't', detail: 'An Issue Radar crew added "crew: needs human".' }),
    'An Issue Radar crew added "crew: needs human".',
  )
})

test('rows link the repository and the author to GitHub, in a new tab', async () => {
  const { authorHref, repositoryHref } = await import('../src/untriaged-api.ts')
  const item = { repository: 'octo/app', author: 'mona', url: 'https://github.com/octo/app/issues/3', links: { github: 'https://github.com/octo/app/issues/3' } }
  assert.equal(repositoryHref(item), 'https://github.com/octo/app')
  assert.equal(authorHref(item), 'https://github.com/mona')
  assert.equal(authorHref({ ...item, author: null }), null)
  const enterprise = { ...item, links: { github: 'https://git.example.com/octo/app/pull/9' } }
  assert.equal(repositoryHref(enterprise), 'https://git.example.com/octo/app')
  const view = (await import('node:fs')).readFileSync(new URL('../src/UntriagedView.tsx', import.meta.url), 'utf8')
  for (const part of ['RepoLink', 'AuthorLink'])
    assert.match(view, new RegExp(`function ${part}[\\s\\S]{0,300}target="_blank" rel="noopener noreferrer"`))
  assert.doesNotMatch(view, />\{item\.repository\}<\/td>|>\{item\.author \?\? ''\}<\/td>/)
})

test('Intake: the tab is renamed, lists every source, and filters by source', async () => {
  const { itemKey, itemName, sourceOf } = await import('../src/untriaged-api.ts')
  const app = source('App.tsx')
  assert.match(app, /\{ key: 'untriaged', label: 'Intake' \}/)
  assert.match(app, /<ViewLabel view="untriaged">Intake<\/ViewLabel>/)
  assert.doesNotMatch(app, />Untriaged</)
  const view = source('UntriagedView.tsx')
  assert.match(view, /<ViewHeading id="avoozl-untriaged-title" view="untriaged">\s*Intake\s*</)
  // Untriaged stays as the tab's default filter.
  assert.match(view, /\{ key: 'untriaged', label: `Untriaged \(\$\{list\.items\.length\}\)` \}/)
  assert.match(view, /<th style=\{HEAD\}>Source<\/th>/)
  const ticket = item(null, {
    source: 'tickets',
    id: 'T-1',
    kind: 'ticket',
    url: 'https://tickets.example.test/T-1',
    links: { github: null, item: 'https://tickets.example.test/T-1', issueRadar: null, review: null },
    start: { plan: true, deliver: true },
  })
  const one = item(1)
  assert.equal(sourceOf(one), 'github')
  assert.equal(itemKey(ticket), 'tickets:T-1')
  assert.equal(itemKey(one), 'o/app#1')
  assert.equal(itemName(ticket), 'tickets T-1')
  assert.equal(matchesFilter(ticket, { source: 'tickets' }, NOW), true)
  assert.equal(matchesFilter(one, { source: 'tickets' }, NOW), false)
  const options = filterOptions({ enabled: true, mode: null, total: 2, repositories: [], sources: [{ id: 'tickets' }], items: [one, ticket] })
  assert.deepEqual(options.sources.map((o) => o.value), ['github', 'tickets'])
  // Issue Radar takes GitHub rows only.
  assert.match(selectionHandOff([ticket]).tooltip, /Select GitHub rows/)
  const { sendable } = await import('../src/untriaged-api.ts')
  assert.match(sendable([ticket]).reason, /Issue Radar works GitHub issues/)
})

test('Plan this and Deliver this ask first and name the item', () => {
  const view = source('UntriagedView.tsx')
  assert.match(view, /const yes = await ask\(/)
  assert.match(view, /title: `Deliver \$\{name\}\?`/)
  assert.match(view, /title: `Plan \$\{name\}\?`/)
  assert.match(view, /if \(!yes\) return/)
  assert.match(source('untriaged-api.ts'), /action === 'deliver' \? 'intake\.deliver' : 'intake\.plan'/)
})

test('an intake source form saves a valid entry and names what to fix', async () => {
  const { emptySourceForm, sourceEntry } = await import('../src/plugins-api.ts')
  const form = { ...emptySourceForm(), id: 'tickets', via: 'plugin:fake-tracker', repository: 'o/app', labelFields: 'component, queue' }
  assert.deepEqual(sourceEntry(form, []), {
    id: 'tickets',
    entry: { via: 'plugin:fake-tracker', repository: 'o/app', labelFields: ['component', 'queue'] },
  })
  assert.match(sourceEntry({ ...form, id: 'github' }, []).error, /built in/)
  assert.match(sourceEntry({ ...form, id: 'Bad Name' }, []).error, /lowercase/)
  assert.match(sourceEntry(form, ['tickets']).error, /already exists/)
  assert.match(sourceEntry({ ...form, repository: '' }, []).error, /repository/)
  const settings = source('IntakeSources.tsx')
  assert.match(settings, /\.avoozl\.json may be public/)
  assert.match(settings, /action: 'Remove source'/)
})
