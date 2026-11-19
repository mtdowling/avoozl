// The Workflow map (radar-coder RC22): the model from saved settings, and the
// page drawn in a real Chrome (skipped when none is found) for three configs.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { emptyRepository, toForm, toPolicy } from '../src/settings-api.ts'
import { WHO_COLOR, WORKFLOW_STATUS, buildWorkflowMap, fieldSelector } from '../src/workflow-map.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const SINGLE = {
  mode: 'single-repo',
  repositories: {
    'example/code': {
      baseBranch: 'main',
      allowedActors: ['sam', 'lee'],
      release: { capacity: 3, mode: 'step' },
      managedLabels: { ready: 'go-crew' },
      crewLabels: { inProgress: 'taken', needsHuman: 'wants-person' },
      radar: { planLabel: 'shape-it' },
    },
  },
}
const PLANS = { mode: 'plans-repo', planningRepository: 'example/plans', repositories: { 'example/code': { baseBranch: 'main', concurrency: 4 } } }
const map = (policy, ship = null, mode = policy.mode) => {
  const form = toForm(policy)
  return buildWorkflowMap({ mode, repository: form.repositories[0], ship, planningRepository: form.planningRepository })
}
const cards = (built, lane) => built.lanes.find((item) => item.key === lane).cards
const valueOf = (card, label) => card.values.find((value) => value.label === label)

test('single repository: three lanes with the saved label names', () => {
  const built = map(SINGLE)
  assert.deepEqual(
    built.lanes.map((lane) => lane.key),
    ['maintenance', 'epic', 'review'],
  )
  const epic = Object.fromEntries(cards(built, 'epic').map((card) => [card.key, card]))
  assert.equal(valueOf(epic['epic-plan-label'], 'Planning label').text, 'shape-it')
  assert.equal(valueOf(epic['epic-approve'], 'Approval label').text, 'avoozl:plan-approved')
  assert.equal(valueOf(epic['epic-punt'], 'Escalation label').text, 'wants-person')
  assert.equal(valueOf(epic['epic-mark'], 'In-progress label').text, 'taken')
  assert.equal(valueOf(epic['epic-plan-label'], 'Allowed people').text, 'sam, lee')
  // Who codes is gone (R91.6): the worker builds, and no card names a coder.
  assert.equal(epic['epic-build-worker'].title, 'Worker chats build')
  assert.equal(epic['epic-release'], undefined)
  assert.ok(cards(built, 'epic').every((card) => !card.values.some((value) => value.label === 'Who codes')))
  assert.match(built.lanes[0].muted, /Avoozl hands them no work/)
  assert.equal(valueOf(cards(built, 'maintenance')[1], 'Ready label').text, 'go-crew')
})

test('an unset value shows the default and says so; a set one does not', () => {
  const built = map({ mode: 'single-repo', repositories: { 'example/code': { baseBranch: 'main' } } })
  const label = cards(built, 'epic').find((card) => card.key === 'epic-plan-label')
  assert.deepEqual([valueOf(label, 'Planning label').text, valueOf(label, 'Planning label').source], ['avoozl:plan', 'default'])
  assert.equal(
    valueOf(
      cards(map(SINGLE), 'epic').find((card) => card.key === 'epic-plan-label'),
      'Planning label',
    ).source,
    'set',
  )
})

test('the merge card follows delivery.ship', () => {
  const merge = (ship) => cards(map(SINGLE, ship), 'epic').find((card) => card.key === 'epic-merge')
  assert.equal(merge('manual').who, 'you')
  assert.equal(valueOf(merge('manual'), 'Merge').text, 'you merge')
  assert.equal(merge('auto-merge').who, 'avoozl')
  assert.equal(valueOf(merge(null), 'Merge').source, 'default')
})

test('plans-repo mode: no Tasks at once value, maintenance is muted, the plans repository closes the issue', () => {
  const built = map(PLANS)
  assert.match(built.lanes[0].muted, /Issue Radar/)
  const release = cards(built, 'epic').find((card) => card.key === 'epic-start')
  // `concurrency` only set the retired local workers; the map no longer shows it.
  assert.equal(
    release.values.some((value) => value.label === 'Tasks at once'),
    false,
  )
  assert.equal(cards(built, 'epic').find((card) => card.key.startsWith('epic-build')).title, 'Worker chats build')
  assert.match(cards(built, 'maintenance').at(-1).text, /example\/plans/)
  // A crew still punts to Avoozl: Radar is an intake source (R91.6).
  assert.equal(cards(built, 'epic').find((card) => card.key === 'epic-punt').muted, undefined)
})

test('Local only shows one local-worker lane, no labels, and says why', () => {
  const built = map({ mode: 'local', repositories: { 'example/code': { baseBranch: 'trunk' } } })
  assert.deepEqual(
    built.lanes.map((lane) => lane.key),
    ['local'],
  )
  assert.deepEqual(built.labels, [])
  assert.match(built.note, /hidden in Local only/)
  assert.equal(valueOf(cards(built, 'local')[3], 'Landing branch').text, 'trunk')
})

test('defaults: Radar labels are Radar defaults and Avoozl labels use the avoozl: prefix', () => {
  const rows = Object.fromEntries(map({ mode: 'single-repo', repositories: { 'example/code': { baseBranch: 'main' } } }).labels.map((row) => [row.key, row.name]))
  assert.deepEqual(rows, {
    plan: 'avoozl:plan',
    needsHuman: 'crew: needs human',
    inProgress: 'crew: in progress',
    ready: 'avoozl:ready',
    approval: 'avoozl:plan-approved',
    conflict: 'avoozl:merge-conflict',
    review: 'avoozl:review',
    drafted: 'avoozl:drafted',
  })
})

test('the review lane is muted with its reason until a review label setting exists; a held value is used', () => {
  const lane = map(SINGLE).lanes[2]
  assert.match(lane.muted, /no setting yet/)
  const review = lane.cards.find((card) => card.key === 'review-label')
  assert.deepEqual([review.values[0].text, review.values[0].source], ['avoozl:review', 'placeholder'])
  const form = toForm({ mode: 'single-repo', repositories: { 'example/code': { radar: { reviewLabel: 'look-at-me', draftedLabel: 'drafted-by-avoozl' } } } })
  const wired = buildWorkflowMap({ mode: 'single-repo', repository: form.repositories[0], ship: null }).lanes[2]
  assert.equal(wired.muted, undefined)
  assert.equal(wired.cards.find((card) => card.key === 'review-label').values[0].text, 'look-at-me')
})

test('tags come from the one table, and no card text writes a tag', () => {
  const built = map(SINGLE)
  const all = built.lanes.flatMap((lane) => lane.cards)
  for (const card of all) {
    assert.equal(card.tag, WORKFLOW_STATUS[card.key], card.key)
    assert.doesNotMatch(`${card.title} ${card.text}`, /fake-tested|not proven live|not built yet/i, card.key)
  }
  assert.ok(all.some((card) => card.tag === 'fake-tested'))
})

test('the Labels table lists each label, its writer and a setting to open', () => {
  const rows = Object.fromEntries(map(SINGLE).labels.map((row) => [row.key, row]))
  assert.deepEqual(
    ['plan', 'needsHuman', 'inProgress', 'ready', 'approval', 'conflict', 'review', 'drafted'].filter((key) => !rows[key]),
    [],
  )
  assert.equal(rows.plan.name, 'shape-it')
  assert.equal(rows.plan.writer, 'you')
  assert.equal(rows.ready.writer, 'avoozl')
  assert.deepEqual(rows.plan.jump, { tab: 'radar', field: 'plan' })
  assert.equal(rows.review.jump, undefined)
})

test('the conflict count round-trips, and no crew conflict-fix card shows', () => {
  const policy = structuredClone(SINGLE)
  policy.repositories['example/code'].conflicts = { maxAttempts: 2 }
  assert.equal(
    cards(map(policy), 'epic').find((item) => item.key === 'epic-conflict-fix'),
    undefined,
  )
  assert.deepEqual(toPolicy(toForm(policy)).repositories['example/code'].conflicts, { maxAttempts: 2 })
  assert.equal(toPolicy(toForm(SINGLE)).repositories['example/code'].conflicts, undefined)
})

test('the merge method shows on the auto-merge card and round-trips (RC28.7)', () => {
  const merge = (built) =>
    valueOf(
      cards(built, 'epic').find((item) => item.key === 'epic-merge'),
      'Merge method',
    )
  assert.equal(merge(map(SINGLE)).text, 'squash')
  assert.equal(merge(map(SINGLE)).source, 'default')
  const policy = structuredClone(SINGLE)
  policy.repositories['example/code'].merge = { method: 'merge' }
  assert.equal(merge(map(policy)).text, 'merge')
  assert.deepEqual(merge(map(policy)).jump, { tab: 'landing', field: 'mergeMethod' })
  // The older merge.method is saved as landing.method (§4.25).
  assert.equal(toPolicy(toForm(policy)).repositories['example/code'].merge, undefined)
  assert.deepEqual(toPolicy(toForm(policy)).repositories['example/code'].landing, { method: 'merge' })
  assert.equal(toPolicy(toForm(SINGLE)).repositories['example/code'].landing, undefined)
  // The landing block's autoMerge wins over delivery.ship.
  const off = structuredClone(SINGLE)
  off.repositories['example/code'].landing = { autoMerge: false }
  assert.equal(merge(map(off, 'auto-merge')), undefined)
  assert.deepEqual(toPolicy(toForm(off)).repositories['example/code'].landing, { autoMerge: false })
  // A value Avoozl does not accept stays as typed, so the page and the
  // backend both name it.
  const odd = structuredClone(SINGLE)
  odd.repositories['example/code'].landing = { autoMerge: 'yes' }
  assert.equal(toForm(odd).repositories[0].autoMerge, 'yes')
  assert.deepEqual(toPolicy(toForm(odd)).repositories['example/code'].landing, { autoMerge: 'yes' })
  assert.equal(merge(map(SINGLE, 'manual')), undefined)
})

test('every who has its own theme-variable color', () => {
  assert.equal(new Set(Object.values(WHO_COLOR)).size, 4)
  for (const color of Object.values(WHO_COLOR)) assert.match(color, /^var\(--/)
  assert.equal(fieldSelector('x', 'plan'), '#x-label-planLabel')
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Workflow map page test'
let harness, browser
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

async function draw(config, width = 1280, extra = {}) {
  const page = await browser.page()
  await page.open(harness.url({ page: 'workflow-map', config, ...extra }), { width, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-harness-crash],[data-error-boundary]')) || document.querySelectorAll('[data-step]').length > 0`)
  await page.evaluate('new Promise((r) => setTimeout(r, 150))')
  assert.equal(await page.evaluate(`document.querySelector('[data-harness-crash],[data-error-boundary]')?.textContent ?? null`), null, `${config}: crashed`)
  assert.deepEqual(page.errors, [], `${config}: errors were thrown`)
  return page
}
const shown = (page, selector) => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.textContent)`)

test('page: issue-radar single repository shows the configured labels, and no horizontal scroll at 320 px', { skip }, async () => {
  const page = await draw('single', 320)
  const text = await page.evaluate(`document.querySelector('[data-workflow-map]').innerText`)
  for (const name of ['shape-it', 'avoozl:plan-approved', 'avoozl:merge-conflict', 'go-crew', 'taken', 'wants-person', 'sam, lee']) assert.ok(text.includes(name), name)
  assert.doesNotMatch(text, /to plan|plan approved/)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-lane]').length`), 3)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `no sideways scroll: ${(await page.overflow()).join('; ')}`)
  assert.ok((await shown(page, '[data-who-tag]')).every((tag) => ['You', 'Radar crew', 'Avoozl', 'GitHub'].includes(tag)))
  assert.ok((await shown(page, '[data-status-tag]')).includes('fake-tested'))
  assert.match(await page.evaluate(`document.querySelector('[data-workflow-blurb]').textContent`), /read from its saved settings/)
  // The Labels table matches the config.
  assert.deepEqual(await shown(page, '[data-label-row="plan"] code'), ['shape-it'])
  assert.deepEqual(await shown(page, '[data-label-row="ready"] code'), ['go-crew'])
})

test('page: plans-repo mode shows the worker lanes and the plans repository', { skip }, async () => {
  const page = await draw('plans')
  const text = await page.evaluate(`document.querySelector('[data-workflow-map]').innerText`)
  assert.match(text, /example\/plans/)
  assert.match(text, /Worker chats build/)
  assert.equal(await page.evaluate(`document.querySelector('[data-lane="maintenance"]').dataset.laneOff`), 'true')
  assert.deepEqual(await shown(page, '[data-label-row="plan"] code'), ['avoozl:plan'])
  assert.match(await page.evaluate(`document.querySelector('[data-label-row="plan"]').textContent`), /\(default\)/)
})

test('page: manual ship changes the merge card', { skip }, async () => {
  const page = await draw('single', 1280, { ship: 'manual' })
  await page.until(`document.querySelector('[data-step="epic-merge"]')?.textContent.includes('You merge')`)
})

test('page: Local only draws one lane and no labels', { skip }, async () => {
  const page = await draw('local')
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-lane]').length`), 1)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-label-row]').length`), 0)
  const text = await page.evaluate(`document.querySelector('[data-workflow-map]').innerText`)
  assert.match(text, /hidden in Local only/)
  assert.match(text, /trunk/)
  assert.doesNotMatch(text, /kept-but-unused/)
})

test('page: a value jumps to its field, opening the fold around it', { skip }, async () => {
  const page = await draw('single')
  assert.equal(await page.evaluate(`document.querySelector('[data-fold] ').open`), false)
  await page.evaluate(`document.querySelector('[data-step="epic-plan-label"] [data-value="Planning label"] button').click()`)
  await page.until(`document.activeElement?.id === 't-label-planLabel'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-fold] ').open`), true)
})

test('the escalation label Avoozl recommends is one name in the page and the docs', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const name = /RECOMMENDED_ESCALATION_LABEL = '([^']+)'/.exec(read('../src/SettingsView.tsx'))?.[1]
  assert.equal(name, 'crew: needs avoozl')
  // Issue Radar skips an issue only when its label starts with crew:.
  assert.match(name, /^crew: /)
  for (const doc of ['../../../docs/policies.md', '../../../docs/dogfood-checklist.md', '../../../docs/overview.md']) assert.ok(read(doc).includes(name), doc)
})
