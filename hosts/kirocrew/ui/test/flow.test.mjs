// The Flow tab, the drawer's Timing fold, the Line stopped banner and
// Settings > Flow (design §8.4): pure helpers and how the page wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { bannerText, barSegments, duration, metricCards, stopRows, toFlowForm, toFlowSection } from '../src/flow-api.ts'

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
    repositoryId: 'app',
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

test('Settings > Flow leaves blank fields to their defaults', () => {
  assert.deepEqual(toFlowSection(toFlowForm({})), { flow: {} })
  const form = { ...toFlowForm({}), scope: 'repo', localChecksFirst: 'off' }
  assert.deepEqual(toFlowSection(form).flow, { stopTheLine: { scope: 'repo' }, localChecksFirst: false })
  // The retro is a skill now, with no settings to keep.
  assert.equal('everyTasks' in toFlowForm({ retro: { everyTasks: 3 } }), false)
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
  assert.match(source('nav-api.ts'), /\{ key: 'waiting', label: 'Needs you' \},\n  \{ key: 'flow', label: 'Flow' \}/)
  assert.match(icons, /flow: Gauge/)
  assert.match(flow, /<ViewHeading id="avoozl-flow-title" view="flow">/)
  // The banner sits above every other Dashboard section.
  const banner = dashboard.indexOf('<LineBanner'),
    firstSection = dashboard.indexOf('<Tiles')
  assert.ok(banner > 0 && banner < firstSection)
  assert.ok(drawer.includes('<SectionBox id="timing"'))
  for (const key of ['flow.stopTheLine.scope', 'flow.localChecksFirst']) assert.ok(settings.includes(`"${key}"`), key)
  for (const title of ['Timing', 'Pause on a broken check', 'Local checks first']) assert.match(settings, new RegExp(`<Section title="${title}"`))
  assert.doesNotMatch(settings, /Batching|flow\.batch/, 'batching has no setting')
  assert.doesNotMatch(settings, /flow\.retro/)
  // Run anyway asks first.
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
})

test('charts use theme colors and no yellow', async () => {
  const { STAGE_COLORS } = await import('../src/flow-api.ts')
  const yellowish = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    return r > 180 && g > 140 && b < 90
  }
  for (const [stage, color] of Object.entries(STAGE_COLORS)) assert.ok(!yellowish(color), stage)
  const charts = source('FlowCharts.tsx')
  assert.doesNotMatch(charts, /#[0-9a-f]{6}/i, 'chart lines use theme variables')
  assert.match(charts, /css-grid-template-columns="repeat-auto-fill-minmax-min-100%-16rem-1fr"/, 'one column at 320px')
  assert.match(source('ui/box.json'), /"repeat-auto-fill-minmax-min-100%-16rem-1fr": "repeat\(auto-fill, minmax\(min\(100%, 16rem\), 1fr\)\)"/)
})

test('Flow lists every line stop, pulled and automatic, newest first, with its time to fix (R64.11)', () => {
  const rows = stopRows(
    [
      { id: 'a', manual: false, check: 'npm test', branch: 'main', repositoryId: 'r1', openedAt: '2026-11-19T04:17:00Z', closedAt: '2026-11-19T04:20:00Z', timeToFixMs: 180_000 },
      {
        id: 'p',
        manual: true,
        by: { kind: 'agent', name: 'session:dashboard:slot-7' },
        who: 'worker for a1',
        reason: 'broken base in r2',
        scope: 'repo',
        repositoryId: 'r2',
        openedAt: '2026-11-19T04:01:00Z',
        closedAt: null,
      },
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
    ],
    (iso) => `at ${iso.slice(11, 16)}`,
  )
  assert.deepEqual(
    rows.map((r) => [r.id, r.kind, r.check, r.title, r.meta]),
    [
      ['q', 'Pulled', null, 'bad base', ['task t1 and its dependents', 'Owner', 'at 04:30', 'fixed in 20 m']],
      // The check is its own part, shown as code: no backticks in the text.
      ['a', 'Automatic', 'npm test', 'failed on main', ['at 04:17', 'fixed in 3 m']],
      // The reason already names r2, so the scope is not repeated; the agent
      // reads as its role and task, not its session id.
      ['p', 'Pulled', null, 'broken base in r2', ['worker for a1', 'at 04:01', 'still open']],
    ],
  )
  const flow = source('FlowView.tsx')
  assert.match(flow, /<LineStops stops=\{view\.stops\} \/>/)
  // Spacing comes from the shared Row and Stack parts.
  assert.match(flow, /<Row gap=\{2\} wrap=\{false\} align="start">[\s\S]{0,200}?<Badge/)
})
