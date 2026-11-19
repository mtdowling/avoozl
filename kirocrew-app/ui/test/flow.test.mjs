// The Flow tab, the drawer's Timing fold, the Line stopped banner and
// Settings > Flow (design §8.4): pure helpers and how the page wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { bannerText, barSegments, duration, metricCards, pdcaText, proposalText, stopRows, toFlowForm, toFlowSection } from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const empty = { tasks: 0, leadTimeMs: null, flowEfficiency: null, firstPassRate: null, changeFailureRate: null, integrationsPerDay: null, timeToFixMs: null }

test('durations and metric cards read like the sketch, with empty text that says what produces a value', () => {
  assert.equal(duration(190 * 60_000), '3 h 10 m')
  assert.equal(duration(42 * 60_000), '42 m')
  assert.equal(duration(null), '–')
  const cards = metricCards({
    metrics: { ...empty, tasks: 2, leadTimeMs: 190 * 60_000, flowEfficiency: 0.34, firstPassRate: 0.7 },
    previous: { ...empty, tasks: 2, leadTimeMs: 245 * 60_000, flowEfficiency: 0.28, firstPassRate: 0.6 },
  })
  assert.deepEqual(
    cards.map((c) => [c.title, c.value, c.was]),
    [
      ['Lead time', '3 h 10 m', '4 h 5 m'],
      ['Flow efficiency', '34%', '28%'],
      ['First-pass rate', '70%', '60%'],
      ['Time to fix', '–', null],
      ['Fix work', '–', '–'],
      ['Corrections', '–', null],
    ],
  )
  assert.equal(cards[3].empty, 'No line stop yet.')
  assert.equal(metricCards({ metrics: empty, previous: empty })[0].empty, 'Finish a task to see lead time.')
})

test('a stacked bar keeps stage order and shares', () => {
  const parts = barSegments({ queued: 10, coding: 30, tests: 0, review: 20 })
  assert.deepEqual(
    parts.map((p) => [p.stage, p.share]),
    [
      ['queued', 1 / 6],
      ['coding', 0.5],
      ['review', 1 / 3],
    ],
  )
  assert.deepEqual(barSegments({}), [])
})

test('the banner names the check, branch, culprit, fix task and paused count', () => {
  const stop = {
    id: 's',
    projectId: 'app',
    check: 'npm test',
    branch: 'main',
    culprit: '3.2',
    commit: 'abc1234def',
    range: { from: null, to: 'abc' },
    openedAt: '',
    closedAt: null,
    fixTaskId: '3.2.fix-1',
    fixState: 'running',
    paused: 4,
    runAnyway: null,
  }
  assert.equal(bannerText(stop), 'Line stopped: `npm test` fails on main since abc1234 (task 3.2). Fix: 3.2.fix-1, running. 4 tasks paused.')
  assert.match(bannerText({ ...stop, runAnyway: { by: 'dashboard', at: '' } }), /Dispatch resumed by Run anyway\./)
})

test('proposals and PDCA results read as one line each', () => {
  const p = {
    id: 'p1',
    type: 'settings',
    file: 'workspace',
    key: 'flow.retro.slowFactor',
    from: 3,
    to: 5,
    metric: 'lead time',
    direction: 'down',
    evidence: 'e',
    status: 'approved',
    pdca: { before: 60 * 60_000, after: 61 * 60_000, result: 'no change', window: 10 },
  }
  assert.equal(proposalText(p), 'flow.retro.slowFactor 3 → 5')
  assert.equal(pdcaText(p), 'PDCA: lead time 1 h → 1 h 1 m, did not help.')
  assert.equal(pdcaText({ ...p, status: 'open' }), null)
})

test('Settings > Flow leaves blank fields to their defaults and refuses bad values before saving', () => {
  assert.deepEqual(toFlowSection(toFlowForm({})), { flow: {} })
  const form = { ...toFlowForm({}), scope: 'repo', localChecksFirst: 'off', slowFactor: '2.5' }
  assert.deepEqual(toFlowSection(form).flow, { stopTheLine: { scope: 'repo' }, localChecksFirst: false, retro: { slowFactor: 2.5 } })
  assert.match(toFlowSection({ ...form, everyTasks: '0' }).error, /1–1000/)
  assert.match(toFlowSection({ ...form, slowFactor: '1' }).error, /1\.1–20/)
  // Batching has no setting (R108.8): an old `batch` is not a field and is
  // not saved back.
  assert.equal('max' in toFlowForm({ batch: { max: 4 } }), false)
  assert.deepEqual(toFlowSection(toFlowForm({ batch: { max: 4 } })), { flow: {} })
})

test('the page wires the Flow tab, its icon, the banner, the Timing fold and Settings > Flow', () => {
  const app = source('App.tsx'),
    icons = source('icons.ts'),
    dashboard = source('DashboardView.tsx'),
    drawer = source('TaskDrawer.tsx'),
    settings = source('FlowSettings.tsx'),
    flow = source('FlowView.tsx')
  assert.match(source('nav-api.ts'), /\{ key: 'github', label: 'GitHub' \},\n  \{ key: 'flow', label: 'Flow' \}/)
  assert.match(icons, /flow: Gauge/)
  assert.match(flow, /<ViewHeading id="avoozl-flow-title" view="flow">/)
  // The banner sits above every other Dashboard section.
  const banner = dashboard.indexOf('<LineBanner'),
    firstSection = dashboard.indexOf('<Tiles')
  assert.ok(banner > 0 && banner < firstSection)
  assert.ok(drawer.includes('<SectionBox id="timing"'))
  for (const key of ['flow.stopTheLine.scope', 'flow.localChecksFirst', 'flow.retro.everyTasks', 'flow.retro.slowFactor', 'flow.retro.instructions'])
    assert.ok(settings.includes(`"${key}"`), key)
  assert.match(settings, /Saved on this machine only\./)
  for (const title of ['Timing', 'Pause on a broken check', 'Local checks first', 'Retro']) assert.match(settings, new RegExp(`<Section title="${title}"`))
  assert.doesNotMatch(settings, /Batching|flow\.batch/, 'batching has no setting')
  // Approve is not red; Run anyway asks first.
  assert.match(source('FlowMemory.tsx'), /<Btn type="button" primary disabled=\{busy\} onClick=\{\(\) => onDecide\(proposal, 'approve'\)\}>/)
  assert.match(flow, /title: 'Run anyway\?'/)
})

test('Flow screens keep the owner rules: no visible Stop the line, yellow only for what needs the owner', () => {
  const settings = source('FlowSettings.tsx'),
    flow = source('FlowView.tsx')
  assert.doesNotMatch(settings, /title="Stop the line"/)
  assert.match(settings, /<Section title="Pause on a broken check" blurb="[^"]+" icon=\{Pause\}>/)
})

test('model pickers offer the models Kiro Crew lists, plus auto', async () => {
  const { parseModels, modelOptions } = await import('../src/flow-api.ts')
  assert.deepEqual(parseModels([{ model_name: 'claude-opus-5.5', display_name: 'Opus 5.5' }, 'auto', 'm2', 'm2']), [
    { value: 'claude-opus-5.5', label: 'Opus 5.5' },
    { value: 'm2', label: 'm2' },
  ])
  assert.deepEqual(parseModels({ models: [{ id: 'x' }] }), [{ value: 'x', label: 'x' }])
  assert.deepEqual(parseModels(null), [])
  assert.deepEqual(
    modelOptions([], 'gone-model').map((o) => o.value),
    ['auto', 'gone-model'],
  )
  // The retro's model moved to Settings › Models (ModelsSettings.tsx).
  assert.doesNotMatch(source('FlowSettings.tsx'), /avoozl-flow-model/)
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
  assert.match(charts, /css-grid-template-columns="repeat-auto-fill-minmax-min-100%-16rem-1fr"/, 'one column at 320px')
  assert.match(source('ui/box.json'), /"repeat-auto-fill-minmax-min-100%-16rem-1fr": "repeat\(auto-fill, minmax\(min\(100%, 16rem\), 1fr\)\)"/)
  assert.equal(usageText({ input: 12000, output: 800, credits: 0, turns: 3 }), '12k in · 800 out')
  assert.equal(usageText({ input: 0, output: 0, credits: 1.5, turns: 1 }), '1.50 credits')
  assert.match(source('flow-api.ts'), /Not available:/)
})

test('Flow lists every line stop, pulled and automatic, newest first, with its time to fix (R64.11)', () => {
  const rows = stopRows([
    { id: 'a', manual: false, check: 'npm test', branch: 'main', projectId: 'r1', openedAt: '2026-11-19T04:17:00Z', closedAt: '2026-11-19T04:20:00Z', timeToFixMs: 180_000 },
    { id: 'p', manual: true, by: { kind: 'agent', name: 'session:s1' }, reason: 'broken base', scope: 'repo', projectId: 'r2', openedAt: '2026-11-19T04:01:00Z', closedAt: null },
    {
      id: 'q',
      manual: true,
      by: { kind: 'person', name: 'Owner' },
      reason: 'bad base',
      scope: 'task',
      taskId: 't1',
      openedAt: '2026-11-19T04:30:00Z',
      closedAt: '2026-11-19T04:50:00Z',
      timeToFixMs: 20 * 60_000,
    },
  ])
  assert.deepEqual(
    rows.map((r) => [r.id, r.kind, r.what, r.who, r.fix]),
    [
      ['q', 'Pulled', 'bad base (task t1 and its dependents)', 'Owner', '20 m'],
      ['a', 'Automatic', '\`npm test\` failed on main', null, '3 m'],
      ['p', 'Pulled', 'broken base (repository r2)', 'session:s1', 'open'],
    ],
  )
  const flow = source('FlowView.tsx')
  assert.match(flow, /<LineStops stops=\{view\.stops\} \/>/)
})
