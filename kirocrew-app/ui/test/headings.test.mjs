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
  const controls = source('ui/controls.tsx')
  const part = controls.slice(controls.indexOf('export function SectionHeading'), controls.indexOf('export function ViewHeading'))
  // On a phone a heading with `phoneMenu` keeps one row and puts its buttons in More.
  assert.match(part, /<div className=\{`flex items-center gap-x-3 gap-y-2 \$\{menu \? 'flex-nowrap' : 'flex-wrap'\}`\}>/)
  assert.match(part, /<MoreMenu /)
  assert.match(part, /className=\{`m-0 flex min-w-0 items-center gap-2 font-semibold/)
  assert.match(part, /<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2"/)
  // View headings are the same part at level 2.
  assert.match(controls, /export function ViewHeading[\s\S]*?<SectionHeading\s+level=\{props\.level \?\? 2\}/)
})

test('no view uses the host CardTitle, whose bottom margin lifts a title above its buttons', () => {
  for (const name of views) assert.doesNotMatch(source(name), /<CardTitle\b/, name)
})

test('headings with buttons pass them as the heading actions', () => {
  const flow = source('FlowView.tsx'),
    charts = source('FlowCharts.tsx')
  assert.match(charts, /<SectionHeading title="Over time" actions=\{<UnitPicker/)
  assert.match(source('RetrosView.tsx'), /<SectionHeading\s+title="All retros"\s+actions=\{/)
  for (const [file, view] of [
    ['ConflictsView.tsx', 'conflicts'],
    ['UntriagedView.tsx', 'untriaged'],
    ['PlansView.tsx', 'plans'],
  ])
    assert.match(source(file), new RegExp(`<ViewHeading\\s+id="avoozl-${view}-title"\\s+view="${view}"[\\s\\S]*?actions=\\{`), file)
  assert.match(source('PlansView.tsx'), /<SpecCard\s+title="GitHub preview"[\s\S]*?actions=\{/)
  assert.match(source('GraphView.tsx'), /<SectionHeading\s+title=\{task\.title\}\s+actions=\{/)
  assert.match(source('NewPlanDrawer.tsx'), /<Modal\s+id="avoozl-new-plan"[\s\S]*?title="New spec"/)
  // The reader's file name is the shared Modal's title; its copy and reveal buttons are the modal's footer.
  assert.match(source('DocumentReader.tsx'), /<Modal\s+id="avoozl-reader"[\s\S]*?title=\{<code>\{target\.document\}<\/code>\}[\s\S]*?footer=\{/)
  assert.match(
    source('SettingsView.tsx'),
    /<SectionHeading level=\{props\.level === 'sub' \? 4 : 3\} title=\{props\.title\} blurb=\{props\.blurb\} actions=\{props\.actions\} icon=\{props\.icon\} \/>/,
  )
  // No hand-made heading row is left beside its buttons.
  for (const name of views) assert.doesNotMatch(source(name), /items-center gap-3">\s*<(ViewHeading|CardTitle)/, name)
})

test('Specs heading: New spec, then an icon-only Refresh last; New task only in a spec', () => {
  const plans = source('PlansView.tsx')
  const part = plans.slice(plans.indexOf('function PlansActions'), plans.indexOf("// The row's icon buttons"))
  const at = (text) => part.indexOf(text)
  assert.ok(at('New spec') > 0 && at('New spec') < at('RefreshCw') && at('Idea') === -1 && at('New task') === -1, 'order')
  assert.equal(part.match(/<IconLabel (?:style=\{COMPACT_BTN\} )?icon=\{Plus\}/g).length, 1)
  // New task is in the spec's own view, and nowhere else on the page.
  assert.match(plans, /<Box data-new-task as="span" contents>/)
  for (const name of views.filter((n) => n !== 'PlansView.tsx' && n !== 'Panel.tsx')) assert.doesNotMatch(source(name), />\s*New task\s*</, name)
  assert.match(part, /<IconBtn icon=\{RefreshCw\} label="Refresh specs" tooltip=\{REFRESH_PLANS_TIP\}/)
  assert.match(plans, /REFRESH_PLANS_TIP = 'Reload specs from disk\. Imports nothing\.'/)
  assert.match(plans, /actions=\{\s*<PlansActions/)
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
  assert.match(charts, /\{message \|\| !usage \? \(\s*<Hint as="p" size="sm">\s*\{message\}\s*<\/Hint>/)
})

test('a Needs you title opens what it is about', () => {
  const base = { key: 'k', kind: 'decision', title: 'T', detail: 'd', tab: 'conflicts', href: null }
  assert.deepEqual(attentionTarget({ ...base, taskId: 'W1' }), { kind: 'task', id: 'W1' })
  assert.deepEqual(attentionTarget({ ...base, kind: 'review', taskId: null, group: { kind: 'review' } }), { kind: 'review' })
  assert.deepEqual(attentionTarget({ ...base, kind: 'content-match', taskId: null }), { kind: 'tab', tab: 'waiting' })
  assert.equal(attentionTip({ ...base, taskId: 'W1' }), 'Open W1 in the drawer')
  assert.equal(attentionTip({ ...base, kind: 'review', taskId: null, group: {} }), 'Open the list of tasks to review')
  const dashboard = source('DashboardView.tsx')
  // A button role on an inline link, so a long title wraps beside its tag:
  // Tab reaches it, Enter and Space press it, and its name is the title.
  assert.match(
    dashboard,
    /<(?:a|PlainLink)\s+role="button"\s+tabIndex=\{0\}[\s\S]{0,200}onClick=\{onTitle\}[\s\S]{0,300}event\.key === 'Enter' \|\| event\.key === ' '[\s\S]{0,200}data-attention-title\s*>\s*\{item\.title\}/,
  )
  assert.match(dashboard, /onTitle=\{\(\) => \{\s*const target = attentionTarget\(item\)/)
  assert.match(dashboard, /target\.kind === 'review' && item\.group\) drawer\.openReview/)
  assert.match(dashboard, /target\.kind === 'task'\) drawer\.openTask\(target\.id\)/)
})

test('Settings > Flow puts each sub-section in its own titled box', () => {
  const flow = source('FlowSettings.tsx')
  assert.match(flow, /function Box\(\{ children \}[\s\S]*?<Card className="flex flex-col gap-4" data-flow-box>/)
  const titles = [...flow.matchAll(/<Box>\s*<Section title="([^"]+)" blurb="[^"]+"/g)].map((m) => m[1])
  assert.deepEqual(titles, ['Timing', 'Pause on a broken check', 'Local checks first', 'CI', 'Retro'])
  assert.equal(flow.match(/<Box>/g).length, titles.length)
  // Retro: when it runs, then the built-in prompt and your instructions.
  // Its model is under Settings › Models.
  const retro = flow.slice(flow.indexOf('title="Retro"'))
  assert.ok(retro.indexOf('title="When it runs"') < retro.indexOf('<PromptInstructions'))
  assert.equal(retro.includes('avoozl-flow-model'), false)
})
