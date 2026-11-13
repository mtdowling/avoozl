// The Flow tab, the drawer's Timing fold, the Line stopped banner and
// Settings > Flow (design §8.4): pure helpers and how the page wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  bannerText,
  barSegments,
  duration,
  metricCards,
  pdcaText,
  proposalText,
  toFlowForm,
  toFlowSection,
} from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const empty = { tasks: 0, leadTimeMs: null, flowEfficiency: null, firstPassRate: null, changeFailureRate: null, integrationsPerDay: null, timeToFixMs: null }

test('durations and metric cards read like the sketch, with empty text that says what produces a value', () => {
  assert.equal(duration(190 * 60_000), '3 h 10 m')
  assert.equal(duration(42 * 60_000), '42 m')
  assert.equal(duration(null), '–')
  const cards = metricCards({ metrics: { ...empty, tasks: 2, leadTimeMs: 190 * 60_000, flowEfficiency: 0.34, firstPassRate: 0.7 }, previous: { ...empty, tasks: 2, leadTimeMs: 245 * 60_000, flowEfficiency: 0.28, firstPassRate: 0.6 } })
  assert.deepEqual(cards.map((c) => [c.title, c.value, c.was]), [
    ['Lead time', '3 h 10 m', '4 h 5 m'],
    ['Flow efficiency', '34%', '28%'],
    ['First-pass rate', '70%', '60%'],
    ['Time to fix', '–', null],
  ])
  assert.equal(cards[3].empty, 'No line stop yet.')
  assert.equal(metricCards({ metrics: empty, previous: empty })[0].empty, 'Finish a task to see lead time.')
})

test('a stacked bar keeps stage order and shares', () => {
  const parts = barSegments({ queued: 10, coding: 30, tests: 0, review: 20 })
  assert.deepEqual(parts.map((p) => [p.stage, p.share]), [['queued', 1 / 6], ['coding', 0.5], ['review', 1 / 3]])
  assert.deepEqual(barSegments({}), [])
})

test('the banner names the check, branch, culprit, fix task and paused count', () => {
  const stop = { id: 's', projectId: 'app', check: 'npm test', branch: 'main', culprit: '3.2', commit: 'abc1234def', range: { from: null, to: 'abc' }, openedAt: '', closedAt: null, fixTaskId: '3.2.fix-1', fixState: 'running', paused: 4, runAnyway: null }
  assert.equal(bannerText(stop), 'Line stopped: `npm test` fails on main since abc1234 (task 3.2). Fix: 3.2.fix-1, running. 4 tasks paused.')
  assert.match(bannerText({ ...stop, runAnyway: { by: 'dashboard', at: '' } }), /Dispatch resumed by Run anyway\./)
})

test('proposals and PDCA results read as one line each', () => {
  const p = { id: 'p1', type: 'settings', file: 'workspace', key: 'flow.batch.max', from: 3, to: 5, metric: 'lead time', direction: 'down', evidence: 'e', status: 'approved', pdca: { before: 60 * 60_000, after: 61 * 60_000, result: 'no change', window: 10 } }
  assert.equal(proposalText(p), 'flow.batch.max 3 → 5')
  assert.equal(pdcaText(p), 'PDCA: lead time 1 h → 1 h 1 m, did not help.')
  assert.equal(pdcaText({ ...p, status: 'open' }), null)
})

test('Settings > Flow leaves blank fields to their defaults and refuses bad values before saving', () => {
  assert.deepEqual(toFlowSection(toFlowForm({})), { flow: {} })
  const form = { ...toFlowForm({}), max: '5', scope: 'repo', localChecksFirst: 'off', slowFactor: '2.5' }
  assert.deepEqual(toFlowSection(form).flow, { stopTheLine: { scope: 'repo' }, localChecksFirst: false, batch: { max: 5 }, retro: { slowFactor: 2.5 } })
  assert.match(toFlowSection({ ...form, max: '0' }).error, /1–10/)
  assert.match(toFlowSection({ ...form, slowFactor: '1' }).error, /1\.1–20/)
  assert.deepEqual(toFlowForm({ batch: { max: 4 } }).max, '4')
})

test('the page wires the Flow tab, its icon, the banner, the Timing fold and Settings > Flow', () => {
  const app = source('App.tsx'),
    icons = source('icons.ts'),
    dashboard = source('DashboardView.tsx'),
    drawer = source('TaskDrawer.tsx'),
    settings = source('FlowSettings.tsx'),
    flow = source('FlowView.tsx')
  assert.match(app, /\{ key: 'delivery', label: 'Delivery' \},\n  \{ key: 'flow', label: 'Flow' \}/)
  assert.match(icons, /flow: Gauge/)
  assert.match(flow, /<ViewHeading id="avoozl-flow-title" view="flow">/)
  // The banner sits above every other Dashboard section.
  const banner = dashboard.indexOf('<LineBanner'),
    firstSection = dashboard.indexOf('<Pair')
  assert.ok(banner > 0 && banner < firstSection)
  assert.ok(drawer.indexOf('<Fold id="timing"') > drawer.indexOf('<Fold id="delivery"'))
  for (const key of ['flow.stopTheLine.scope', 'flow.localChecksFirst', 'flow.batch.max', 'flow.batch.by', 'flow.retro.everyTasks', 'flow.retro.slowFactor', 'flow.retro.model', 'flow.retro.instructions'])
    assert.ok(settings.includes(`"${key}"`), key)
  assert.match(settings, /Saved on this machine only\./)
  for (const title of ['Timing', 'Stop the line', 'Local checks first', 'Batching', 'Retro']) assert.match(settings, new RegExp(`<Section title="${title}"`))
  // Approve is not red; Run anyway asks first.
  assert.match(flow, /<Btn type="button" primary disabled=\{busy\} onClick=\{\(\) => onDecide\(retro, proposal, 'approve'\)\}>/)
  assert.match(flow, /title: 'Run anyway\?'/)
})

test('the retro model is a dropdown of the models Kiro Crew offers, plus auto', async () => {
  const { parseModels, modelOptions } = await import('../src/flow-api.ts')
  assert.deepEqual(parseModels([{ model_name: 'claude-opus-5.5', display_name: 'Opus 5.5' }, 'auto', 'm2', 'm2']), [
    { value: 'claude-opus-5.5', label: 'Opus 5.5' },
    { value: 'm2', label: 'm2' },
  ])
  assert.deepEqual(parseModels({ models: [{ id: 'x' }] }), [{ value: 'x', label: 'x' }])
  assert.deepEqual(parseModels(null), [])
  assert.deepEqual(modelOptions([], 'gone-model').map((o) => o.value), ['auto', 'gone-model'])
  const settings = source('FlowSettings.tsx')
  assert.match(settings, /<select id="avoozl-flow-model"/)
  assert.doesNotMatch(settings, /<Input id="avoozl-flow-model"/)
})

test('the retro instructions use the shared built-in prompt part', () => {
  const settings = source('FlowSettings.tsx'),
    part = source('PromptInstructions.tsx')
  assert.match(settings, /<PromptInstructions[\s\S]*builtIn=\{value\.retroPrompt\}/)
  assert.match(part, /Added after the built-in prompt\./)
  assert.match(part, /read-only/)
  assert.match(part, /navigator\.clipboard\.writeText/)
})

test('charts and usage use theme colors and no yellow', async () => {
  const { STAGE_COLORS, usageText } = await import('../src/flow-api.ts')
  const yellowish = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    return r > 180 && g > 140 && b < 90
  }
  for (const [stage, color] of Object.entries(STAGE_COLORS)) assert.ok(!yellowish(color), stage)
  const charts = source('FlowCharts.tsx')
  assert.doesNotMatch(charts, /#[0-9a-f]{6}/i, 'chart lines use theme variables')
  assert.match(charts, /minmax\(min\(100%, 16rem\), 1fr\)/, 'one column at 320px')
  assert.equal(usageText({ input: 12000, output: 800, credits: 0, turns: 3 }), '12k in · 800 out')
  assert.equal(usageText({ input: 0, output: 0, credits: 1.5, turns: 1 }), '1.50 credits')
  assert.match(source('FlowCharts.tsx'), /Not available:/)
})
