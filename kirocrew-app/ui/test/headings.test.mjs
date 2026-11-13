// The shared section heading, the Plans heading buttons, the one usage card
// on Flow, and the Needs you title links.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { attentionTarget, attentionTip } from '../src/dashboard-api.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const views = readdirSync(src).filter((name) => name.endsWith('.tsx'))

test('one section heading: title and buttons on one centered row, buttons right and wrapping', () => {
  const controls = source('controls.tsx')
  const part = controls.slice(controls.indexOf('export function SectionHeading'), controls.indexOf('export function ViewHeading'))
  assert.match(part, /<div className="flex flex-wrap items-center gap-x-3 gap-y-2">/)
  assert.match(part, /className=\{`m-0 flex min-w-0 items-center gap-2 font-semibold/)
  assert.match(part, /<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2"/)
  // View headings are the same part at level 2.
  assert.match(controls, /export function ViewHeading[\s\S]*?<SectionHeading level=\{2\}/)
})

test('no view uses the host CardTitle, whose bottom margin lifts a title above its buttons', () => {
  for (const name of views) assert.doesNotMatch(source(name), /<CardTitle\b/, name)
})

test('headings with buttons pass them as the heading actions', () => {
  const flow = source('FlowView.tsx'),
    charts = source('FlowCharts.tsx')
  assert.match(charts, /<SectionHeading title="Over time" actions=\{<UnitPicker/)
  assert.match(flow, /<SectionHeading\s+title="Retros"\s+actions=\{/)
  for (const [file, view] of [
    ['ConflictsView.tsx', 'conflicts'],
    ['DeliveryView.tsx', 'delivery'],
    ['UntriagedView.tsx', 'untriaged'],
    ['PlansView.tsx', 'plans'],
    ['DashboardView.tsx', 'dashboard'],
  ])
    assert.match(source(file), new RegExp(`<ViewHeading\\s+id="avoozl-${view}-title"\\s+view="${view}"[\\s\\S]*?actions=\\{`), file)
  assert.match(source('PlansView.tsx'), /<SectionHeading\s+title="GitHub preview"[\s\S]*?actions=\{/)
  assert.match(source('GraphView.tsx'), /<SectionHeading\s+title=\{task\.title\}\s+actions=\{/)
  assert.match(source('NewPlanDrawer.tsx'), /<SectionHeading\s+level=\{2\}\s+id="avoozl-new-plan-title"[\s\S]*?actions=\{/)
  assert.match(source('DocumentReader.tsx'), /<SectionHeading\s+id="avoozl-reader-title"[\s\S]*?actions=\{/)
  assert.match(source('SettingsView.tsx'), /<SectionHeading level=\{props\.level === 'sub' \? 4 : 3\} title=\{props\.title\} blurb=\{props\.blurb\} actions=\{props\.actions\} \/>/)
  // No hand-made heading row is left beside its buttons.
  for (const name of views) assert.doesNotMatch(source(name), /items-center gap-3">\s*<(ViewHeading|CardTitle)/, name)
})

test('Plans heading: New plan, New task, then an icon-only Refresh last', () => {
  const plans = source('PlansView.tsx')
  const part = plans.slice(plans.indexOf('function PlansActions'), plans.indexOf('// The row\'s icon buttons'))
  const at = (text) => part.indexOf(text)
  assert.ok(at('New plan') > 0 && at('New plan') < at('New task') && at('New task') < at('RefreshCw'), 'order')
  assert.equal(part.match(/<IconLabel icon=\{Plus\}/g).length, 2)
  assert.match(part, /<IconBtn icon=\{RefreshCw\} label="Refresh plans" tooltip=\{REFRESH_PLANS_TIP\}/)
  assert.match(plans, /REFRESH_PLANS_TIP = 'Reload plans from disk\. Imports nothing\.'/)
  assert.match(plans, /actions=\{\s*workspace && !row \? \(\s*<PlansActions/)
  for (const name of views) assert.doesNotMatch(source(name), />\s*Add task\s*</, name)
})

test('Flow shows Tokens and credits once, with one message when there is nothing', async () => {
  const charts = source('FlowCharts.tsx')
  assert.equal(charts.match(/Tokens and credits"/g).length, 1)
  assert.doesNotMatch(source('FlowView.tsx'), /Tokens and credits/)
  const { usageMessage } = await import('../src/flow-api.ts')
  assert.match(usageMessage({ available: false }), /^Not available:/)
  assert.match(usageMessage(undefined), /^Not available:/)
  assert.equal(usageMessage({ available: true, total: { turns: 0 } }), 'No turns recorded for these tasks yet.')
  assert.equal(usageMessage({ available: true, total: { turns: 3 } }), null)
  assert.match(charts, /\{message \|\| !usage \? \(\s*<p className="text-sm text-muted">\{message\}<\/p>/)
})

test('a Needs you title opens what it is about', () => {
  const base = { key: 'k', kind: 'decision', title: 'T', detail: 'd', tab: 'conflicts', href: null }
  assert.deepEqual(attentionTarget({ ...base, taskId: 'W1' }), { kind: 'task', id: 'W1' })
  assert.deepEqual(attentionTarget({ ...base, kind: 'review', taskId: null, group: { kind: 'review' } }), { kind: 'review' })
  assert.deepEqual(attentionTarget({ ...base, kind: 'content-match', taskId: null }), { kind: 'tab', tab: 'conflicts' })
  assert.equal(attentionTip({ ...base, taskId: 'W1' }), 'Open W1 in the drawer')
  assert.equal(attentionTip({ ...base, kind: 'review', taskId: null, group: {} }), 'Open the list of tasks to review')
  const dashboard = source('DashboardView.tsx')
  // A real button: Tab reaches it, Enter and Space press it, and its name is the title.
  assert.match(dashboard, /<button type="button" className="text-left font-medium underline" onClick=\{onTitle\} aria-describedby=\{describedBy\} data-attention-title>\s*\{item\.title\}/)
  assert.match(dashboard, /onTitle=\{\(\) => \{\s*const target = attentionTarget\(item\)/)
  assert.match(dashboard, /target\.kind === 'review' && item\.group\) drawer\.openReview/)
  assert.match(dashboard, /target\.kind === 'task'\) drawer\.openTask\(target\.id\)/)
})

test('Settings > Flow puts each sub-section in its own titled box', () => {
  const flow = source('FlowSettings.tsx')
  assert.match(flow, /function Box\(\{ children \}[\s\S]*?<Card className="flex flex-col gap-4" data-flow-box>/)
  const titles = [...flow.matchAll(/<Box>\s*<Section title="([^"]+)" blurb="[^"]+"/g)].map((m) => m[1])
  assert.deepEqual(titles, ['Timing', 'Stop the line', 'Local checks first', 'Batching', 'Retro'])
  assert.equal(flow.match(/<Box>/g).length, titles.length)
  // Retro keeps the model dropdown, then the built-in prompt and your instructions.
  const retro = flow.slice(flow.indexOf('title="Retro"'))
  assert.ok(retro.indexOf('title="When it runs"') < retro.indexOf('id="avoozl-flow-model"'))
  assert.ok(retro.indexOf('<select id="avoozl-flow-model"') < retro.indexOf('<PromptInstructions'))
})
