// The Workflow map (radar-coder RC22): the model from saved settings, and the
// page drawn in a real Chrome (skipped when none is found) for three configs.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { emptyRepository, toForm } from '../src/settings-api.ts'
import { WHO_COLOR, WORKFLOW_STATUS, buildWorkflowMap, fieldSelector } from '../src/workflow-map.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const SINGLE = {
  mode: 'single-repo',
  repositories: {
    'example/code': {
      baseBranch: 'main',
      coder: 'issue-radar',
      allowedActors: ['sam', 'lee'],
      release: { capacity: 3, mode: 'step' },
      managedLabels: { ready: 'go-crew' },
      crewLabels: { claim: 'taken', needsHuman: 'wants-person' },
      radar: { planLabel: 'shape-it', approvalLabel: 'ship-it', conflictLabel: 'rebase-me' },
    },
  },
}
const PLANS = { mode: 'plans-repo', planningRepository: 'example/plans', repositories: { 'example/code': { baseBranch: 'main', coder: 'worker', concurrency: 4 } } }
const map = (policy, ship = null, mode = policy.mode) => {
  const form = toForm(policy)
  return buildWorkflowMap({ mode, repository: form.repositories[0], ship, planningRepository: form.planningRepository })
}
const cards = (built, lane) => built.lanes.find((item) => item.key === lane).cards
const valueOf = (card, label) => card.values.find((value) => value.label === label)

test('issue-radar single repository: three lanes with the saved label names, N and mode', () => {
  const built = map(SINGLE)
  assert.deepEqual(built.lanes.map((lane) => lane.key), ['maintenance', 'epic', 'review'])
  const epic = Object.fromEntries(cards(built, 'epic').map((card) => [card.key, card]))
  assert.equal(valueOf(epic['epic-plan-label'], 'Planning label').text, 'shape-it')
  assert.equal(valueOf(epic['epic-approve'], 'Approval label').text, 'ship-it')
  assert.equal(valueOf(epic['epic-punt'], 'Needs-human label').text, 'wants-person')
  assert.equal(valueOf(epic['epic-claim'], 'Claim label').text, 'taken')
  assert.equal(valueOf(epic['epic-release'], 'Ready label').text, 'go-crew')
  assert.equal(valueOf(epic['epic-release'], 'Release N').text, '3')
  assert.equal(valueOf(epic['epic-release'], 'Release mode').text, 'step')
  assert.equal(valueOf(epic['epic-plan-label'], 'Allowed people').text, 'sam, lee')
  assert.equal(valueOf(epic['epic-build-radar'], 'Who codes').text, 'Issue Radar crew')
  assert.equal(built.lanes[0].muted, undefined)
  assert.equal(valueOf(cards(built, 'maintenance')[1], 'Ready label').text, 'go-crew')
})

test('an unset value shows the default and says so; a set one does not', () => {
  const built = map({ mode: 'single-repo', repositories: { 'example/code': { baseBranch: 'main' } } })
  const release = cards(built, 'epic').find((card) => card.key === 'epic-release' || card.key === 'epic-start')
  assert.deepEqual([valueOf(release, 'Release N').text, valueOf(release, 'Release N').source], ['2', 'default'])
  assert.equal(valueOf(release, 'Ready label').source, 'default')
  assert.equal(map(SINGLE).lanes[1].cards.find((card) => card.key === 'epic-release' || card.key === 'epic-start').values[0].source, 'set')
})

test('the merge card follows delivery.ship', () => {
  const merge = (ship) => cards(map(SINGLE, ship), 'epic').find((card) => card.key === 'epic-merge')
  assert.equal(merge('manual').who, 'you')
  assert.equal(valueOf(merge('manual'), 'Merge').text, 'you merge')
  assert.equal(merge('auto-merge').who, 'avoozl')
  assert.equal(valueOf(merge(null), 'Merge').source, 'default')
})

test('the worker coder in plans-repo mode: tasks start at once-N, maintenance is muted, the plans repository closes the issue', () => {
  const built = map(PLANS)
  assert.match(built.lanes[0].muted, /Issue Radar/)
  const release = cards(built, 'epic').find((card) => card.key === 'epic-release' || card.key === 'epic-start')
  assert.equal(valueOf(release, 'Tasks at once').text, '4')
  assert.equal(cards(built, 'epic').find((card) => card.key.startsWith('epic-build')).title, 'Worker chats build')
  assert.match(cards(built, 'maintenance').at(-1).text, /example\/plans/)
  assert.equal(cards(built, 'epic').find((card) => card.key === 'epic-punt').muted?.length > 0, true)
})

test('a remote coder names a managed remote provider and is tagged not built', () => {
  const form = emptyRepository('example/code')
  form.coder = 'remote'
  const build = cards(buildWorkflowMap({ mode: 'single-repo', repository: form, ship: null }), 'epic').find((card) => card.key.startsWith('epic-build'))
  assert.equal(build.tag, 'not built')
  assert.match(build.title, /managed remote provider/)
})

test('Local only shows one local-worker lane, no labels, and says why', () => {
  const built = map({ mode: 'local', repositories: { 'example/code': { baseBranch: 'trunk', coder: 'issue-radar' } } })
  assert.deepEqual(built.lanes.map((lane) => lane.key), ['local'])
  assert.deepEqual(built.labels, [])
  assert.match(built.note, /hidden in Local only/)
  assert.equal(valueOf(cards(built, 'local')[3], 'Landing branch').text, 'trunk')
})

test('defaults: Radar labels are Radar defaults and Avoozl labels use the avoozl: prefix', () => {
  const rows = Object.fromEntries(map({ mode: 'single-repo', repositories: { 'example/code': { baseBranch: 'main' } } }).labels.map((row) => [row.key, row.name]))
  assert.deepEqual(rows, {
    plan: 'avoozl:plan',
    needsHuman: 'crew: needs human',
    claim: 'crew: in progress',
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
  assert.deepEqual(['plan', 'needsHuman', 'claim', 'ready', 'approval', 'conflict', 'review', 'drafted'].filter((key) => !rows[key]), [])
  assert.equal(rows.plan.name, 'shape-it')
  assert.equal(rows.plan.writer, 'you')
  assert.equal(rows.ready.writer, 'avoozl')
  assert.deepEqual(rows.plan.jump, { tab: 'crews', field: 'plan' })
  assert.equal(rows.review.jump, undefined)
})

test('every who has its own theme-variable color', () => {
  assert.equal(new Set(Object.values(WHO_COLOR)).size, 4)
  for (const color of Object.values(WHO_COLOR)) assert.match(color, /^var\(--/)
  assert.match(fieldSelector('x', 'plan'), /#x-plan-label/)
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
  for (const name of ['shape-it', 'ship-it', 'rebase-me', 'go-crew', 'taken', 'wants-person', 'sam, lee']) assert.ok(text.includes(name), name)
  assert.doesNotMatch(text, /to plan|plan approved/)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-lane]').length`), 3)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
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
  await page.until(`document.activeElement?.id === 't-plan-label'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-fold] ').open`), true)
})
