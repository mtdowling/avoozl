// The Workflow map: the model from saved settings, and the page drawn in a
// real Chrome (skipped when none is found) for three configs. GitHub work
// comes in through the triage agent; no label is an order (triage-agent).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { toForm, toPolicy } from '../src/settings-api.ts'
import { WHO_COLOR, buildWorkflowMap, fieldSelector } from '../src/workflow-map.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const SINGLE = {
  mode: 'single-repo',
  repositories: { 'example/code': { baseBranch: 'main', allowedActors: ['sam', 'lee'] } },
}
const PLANS = { mode: 'plans-repo', planningRepository: 'example/plans', repositories: { 'example/code': { baseBranch: 'main' } } }
const map = (policy, mode = policy.mode) => {
  const form = toForm(policy)
  return buildWorkflowMap({ mode, repository: form.repositories[0], planningRepository: form.planningRepository })
}
const cards = (built, lane) => built.lanes.find((item) => item.key === lane).cards
const valueOf = (card, label) => card.values.find((value) => value.label === label)

test('a GitHub repository: the triage lane and the spec lane, and no labels', () => {
  const built = map(SINGLE)
  assert.deepEqual(
    built.lanes.map((lane) => lane.key),
    ['triage', 'spec'],
  )
  assert.deepEqual(built.labels, [])
  const fix = cards(built, 'triage').find((card) => card.key === 'triage-fix')
  assert.equal(valueOf(fix, 'Allowed people').text, 'sam, lee')
  assert.equal(valueOf(fix, 'Allowed people').source, 'set')
  assert.equal(cards(built, 'triage').find((card) => card.key === 'triage-close').who, 'github')
})

test('an unset value shows the default and says so', () => {
  const policy = structuredClone(SINGLE)
  delete policy.repositories['example/code'].allowedActors
  const fix = cards(map(policy), 'triage').find((card) => card.key === 'triage-fix')
  assert.equal(valueOf(fix, 'Allowed people').text, 'anyone with write access')
  assert.equal(valueOf(fix, 'Allowed people').source, 'default')
})

test('plans-repo mode: the plans repository closes the issue', () => {
  const close = cards(map(PLANS), 'triage').find((card) => card.key === 'triage-close')
  assert.equal(close.who, 'avoozl')
  assert.match(close.text, /example\/plans/)
})

test('Local only shows one local-worker lane, no labels, and says why', () => {
  const built = map({ mode: 'local', repositories: { 'example/code': { baseBranch: 'trunk' } } })
  assert.deepEqual(
    built.lanes.map((lane) => lane.key),
    ['local'],
  )
  assert.deepEqual(built.labels, [])
  assert.match(built.note, /hidden in Local only/)
})

test('the merge method shows on the auto-merge card and round-trips (RC28.7)', () => {
  const merge = (built) =>
    valueOf(
      cards(built, 'spec').find((item) => item.key === 'spec-merge'),
      'Merge method',
    )
  assert.equal(merge(map(SINGLE)).text, 'squash')
  assert.equal(merge(map(SINGLE)).source, 'default')
  const policy = structuredClone(SINGLE)
  policy.repositories['example/code'].landing = { method: 'merge' }
  assert.equal(merge(map(policy)).text, 'merge')
  assert.deepEqual(merge(map(policy)).jump, { tab: 'landing', field: 'mergeMethod' })
  assert.deepEqual(toPolicy(toForm(policy)).repositories['example/code'].landing, { method: 'merge' })
  assert.equal(toPolicy(toForm(SINGLE)).repositories['example/code'].landing, undefined)
  // With autoMerge off a person merges, so no method shows.
  const off = structuredClone(SINGLE)
  off.repositories['example/code'].landing = { autoMerge: false }
  assert.equal(merge(map(off)), undefined)
  assert.equal(cards(map(off), 'spec').find((item) => item.key === 'spec-merge').title, 'You merge')
  assert.deepEqual(toPolicy(toForm(off)).repositories['example/code'].landing, { autoMerge: false })
  // A value Avoozl does not accept stays as typed, so the page and the
  // backend both name it.
  const odd = structuredClone(SINGLE)
  odd.repositories['example/code'].landing = { autoMerge: 'yes' }
  assert.equal(toForm(odd).repositories[0].autoMerge, 'yes')
  assert.deepEqual(toPolicy(toForm(odd)).repositories['example/code'].landing, { autoMerge: 'yes' })
})

test('the conflict count round-trips', () => {
  const policy = structuredClone(SINGLE)
  policy.repositories['example/code'].conflicts = { maxAttempts: 2 }
  assert.deepEqual(toPolicy(toForm(policy)).repositories['example/code'].conflicts, { maxAttempts: 2 })
  assert.equal(toPolicy(toForm(SINGLE)).repositories['example/code'].conflicts, undefined)
})

test('every who has its own theme-variable color', () => {
  assert.equal(new Set(Object.values(WHO_COLOR)).size, 4)
  for (const color of Object.values(WHO_COLOR)) assert.match(color, /^var\(--/)
  assert.equal(fieldSelector('x', 'actors'), '#x-actors')
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

test('page: a single repository draws two lanes, and no horizontal scroll at 320 px', { skip }, async () => {
  const page = await draw('single', 320)
  const text = await page.evaluate(`document.querySelector('[data-workflow-map]').innerText`)
  assert.ok(text.includes('sam, lee'))
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-lane]').length`), 2)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-label-row]').length`), 0)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `no sideways scroll: ${(await page.overflow()).join('; ')}`)
  assert.ok((await shown(page, '[data-who-tag]')).every((tag) => ['You', 'Triage agent', 'Avoozl', 'GitHub'].includes(tag)))
})

test('page: plans-repo mode shows the worker lanes and the plans repository', { skip }, async () => {
  const page = await draw('plans')
  const text = await page.evaluate(`document.querySelector('[data-workflow-map]').innerText`)
  assert.match(text, /example\/plans/)
  // Step titles are drawn in capitals where the host stylesheet is loaded.
  assert.match(text, /worker chats build/i)
})

test('page: landing.autoMerge false changes the merge card', { skip }, async () => {
  const page = await draw('single', 1280, { autoMerge: 'off' })
  await page.until(`document.querySelector('[data-step="spec-merge"]')?.textContent.includes('You merge')`)
})

test('page: Local only draws one lane and no labels', { skip }, async () => {
  const page = await draw('local')
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-lane]').length`), 1)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-label-row]').length`), 0)
  const text = await page.evaluate(`document.querySelector('[data-workflow-map]').innerText`)
  assert.match(text, /hidden in Local only/)
  assert.match(text, /trunk/)
})

test('page: a value jumps to its field with no error', { skip }, async () => {
  const page = await draw('single')
  await page.evaluate(`document.querySelector('[data-step="spec-merge"] [data-value="Merge method"] button').click()`)
  assert.deepEqual(page.errors, [])
})
