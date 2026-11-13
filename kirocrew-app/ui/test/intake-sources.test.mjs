// Settings > Plugins > Intake sources: each source's status, what it can
// set off, who counts, the Add a source form, and the page in a real Chrome
// (skipped when none is found).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { emptySourceForm, sourceEntry, sourceStatus, sourceTriggers, viaLabel, whoCounts } from '../src/plugins-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const at = (minutes) => new Date(NOW - minutes * 60_000).toISOString()
const plugin = (id, state, tracker) => ({ id, source: 'machine', state, reason: null, health: null, capabilities: { tracker } })
const PLUGINS = [plugin('tracker', 'approved', ['poll', 'actor']), plugin('quiet', 'disabled', ['poll']), plugin('mute', 'approved', ['poll'])]
const row = (via, extra = {}) => ({ id: 's', scope: 'machine', entry: { via, repository: 'o/app' }, error: null, state: null, ...extra })
const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a source is on, off, in error or waiting, with its poll and items', () => {
  const items = { total: 3, untriaged: 1, lastAt: at(30) }
  const ok = sourceStatus(row('plugin:tracker', { state: { readAt: at(5), cursor: 'c', error: null, more: true }, items }), PLUGINS, NOW)
  assert.equal(ok.tone, 'ok')
  assert.deepEqual(ok.facts, ['Polled 5 min ago, more next tick', '3 items, 1 untriaged', 'newest 30 min ago'])
  const failed = sourceStatus(row('plugin:tracker', { state: { readAt: at(90), cursor: 'c', error: 'poll failed: 401' } }), PLUGINS, NOW)
  assert.deepEqual([failed.tone, failed.problem], ['error', 'poll failed: 401'])
  // A disabled plugin is off, even with an old error.
  const off = sourceStatus(row('plugin:quiet', { state: { readAt: at(90), cursor: null, error: 'down' } }), PLUGINS, NOW)
  assert.equal(off.tone, 'off')
  assert.match(off.problem, /Plugin quiet is disabled/)
  assert.equal(sourceStatus(row('plugin:tracker'), PLUGINS, NOW).tone, 'waiting')
  assert.equal(sourceStatus(row('mcp', { items: { total: 0, untriaged: 0, lastAt: null } }), PLUGINS, NOW).label, 'No item yet')
  assert.equal(sourceStatus(row('mcp', { items }), PLUGINS, NOW).tone, 'ok')
  const bad = sourceStatus(row('plugin:gone', { error: 'names plugin gone' }), PLUGINS, NOW)
  assert.deepEqual([bad.tone, bad.label], ['error', 'Not used'])
})

test('what a source can set off, who counts, and where it comes from', () => {
  assert.equal(sourceTriggers(row('plugin:tracker'), PLUGINS).level, 'Full rules')
  assert.equal(sourceTriggers(row('plugin:mute'), PLUGINS).level, 'No rules')
  assert.equal(sourceTriggers(row('mcp'), PLUGINS).level, 'Untriaged only')
  assert.equal(whoCounts({ via: 'plugin:tracker' }), 'Anyone with write or higher (default)')
  assert.equal(whoCounts({ via: 'plugin:tracker', minimumPermission: 'triage' }), 'Anyone with triage or higher')
  assert.equal(whoCounts({ via: 'plugin:tracker', allowedActors: ['sam', 'riley'] }), 'sam, riley')
  assert.match(whoCounts({ via: 'mcp' }), /Not used/)
  assert.equal(viaLabel('plugin:tracker'), 'Plugin tracker')
  assert.match(viaLabel('mcp'), /^MCP/)
})

test('the form saves who counts for a plugin only, and names the field to fix', () => {
  const form = { ...emptySourceForm(), id: 'tickets', via: 'plugin:tracker', repository: 'o/app' }
  assert.deepEqual(sourceEntry({ ...form, minimumPermission: 'triage' }, []).entry, { via: 'plugin:tracker', repository: 'o/app', minimumPermission: 'triage' })
  assert.deepEqual(sourceEntry({ ...form, who: 'people', allowedActors: 'sam, riley', minimumPermission: 'triage' }, []).entry, {
    via: 'plugin:tracker',
    repository: 'o/app',
    allowedActors: ['sam', 'riley'],
  })
  assert.equal(sourceEntry({ ...form, who: 'people' }, []).field, 'allowedActors')
  // An MCP caller is the owner: who counts is never saved for it.
  assert.deepEqual(sourceEntry({ ...form, via: 'mcp', who: 'people', allowedActors: 'sam', minimumPermission: 'admin' }, []).entry, { via: 'mcp', repository: 'o/app' })
  assert.equal(sourceEntry({ ...form, id: '' }, []).field, 'id')
  assert.equal(sourceEntry({ ...form, repository: '' }, []).field, 'repository')
})

test('the form uses the shared Modal and radio fold-out, and status lives in one place', () => {
  const page = source('IntakeSources.tsx')
  assert.match(page, /<Modal\s+id="avoozl-intake-add"/)
  for (const name of ['intake-via', 'intake-who', 'intake-scope']) assert.match(page, new RegExp(`<RadioFold\\s+name="${name}"`))
  assert.doesNotMatch(page, /<select[^>]*>\s*<option value="mcp">/, 'Comes from is a radio choice, not a select')
  assert.match(page, /<Tooltip text=\{SCOPE_TIP\[scope\]\}>/, 'tooltips are the shared Tooltip')
  // The Intake tab shows only a source's error and points to Settings.
  const view = source('UntriagedView.tsx')
  assert.doesNotMatch(view, /Items arrive through MCP|Read on the next tick/)
  assert.match(view, /data-open-intake-sources/)
  assert.match(source('App.tsx'), /onOpenSources=\{\(\) => go\(\{ settingsTab: 'plugins', tab: 'settings' \}\)\}/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the intake page tests'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const TONES = `JSON.stringify([...document.querySelectorAll('[data-intake-source-row]')].map((el) => [el.dataset.intakeSourceRow, el.dataset.tone ?? null]))`

for (const width of [375, 768, 1280])
  test(`at ${width} px each source is one box with its status, and Add a source opens the dialog`, { skip }, async () => {
    await page.open(harness.url({ page: 'intake', theme: 'light' }), { width, height: 900, dark: false })
    await page.until(`document.querySelectorAll('[data-intake-source-row]').length === 4`)
    assert.deepEqual(JSON.parse(await page.evaluate(TONES)), [
      ['github', null],
      ['tickets', 'error'],
      ['ops', 'off'],
      ['nightly', 'waiting'],
    ])
    // Each box is titled for screen readers, and nothing runs off the page.
    assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-intake-source-row]')].every((el) => document.getElementById(el.getAttribute('aria-labelledby'))?.tagName === 'H4')`), true)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add a source').click()`)
    await page.until(`Boolean(document.querySelector('[data-modal="avoozl-intake-add"]'))`)
    assert.equal(await page.evaluate(`document.activeElement?.id`), 'intake-id')
    // A label names its field; the hint and raw name describe it.
    assert.equal(await page.evaluate(`document.querySelector('label[for="intake-id"]').textContent.trim()`), 'Name (required)')
    assert.equal(await page.evaluate(`document.getElementById('intake-id').getAttribute('aria-describedby')`), 'intake-id-hint intake-id-raw')
    assert.deepEqual(page.errors, [])
  })

test('with no source the empty state says what to do', { skip }, async () => {
  await page.open(harness.url({ page: 'intake', theme: 'dark', empty: '1' }), { width: 768, height: 900, dark: true })
  await page.until(`Boolean(document.querySelector('[data-intake-empty]'))`)
  assert.match(await page.evaluate(`document.querySelector('[data-intake-empty]').textContent`), /No other source yet.*Add a source/)
})
