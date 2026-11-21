// The shared section heading, the Plans heading buttons, the one usage card
// on Flow, and the Needs you title links.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { attentionTarget, attentionTip } from '../src/in-flight-api.ts'

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
  for (const [file, view] of [
    ['ConflictsView.tsx', 'conflicts'],
    ['PlansView.tsx', 'plans'],
  ])
    assert.match(source(file), new RegExp(`<ViewHeading\\s+id="avoozl-${view}-title"\\s+view="${view}"[\\s\\S]*?actions=\\{`), file)
  assert.match(source('GraphView.tsx'), /<SectionHeading\s+title=\{task\.title\}\s+actions=\{/)
  // The reader's file name is the shared Modal's title; its copy and reveal buttons are the modal's footer.
  assert.match(source('DocumentReader.tsx'), /<Modal\s+id="avoozl-reader"[\s\S]*?title=\{<code>\{target\.document\}<\/code>\}[\s\S]*?footer=\{/)
  assert.match(
    source('SettingsView.tsx'),
    /<SectionHeading level=\{props\.level === 'sub' \? 4 : 3\} title=\{props\.title\} blurb=\{props\.blurb\} actions=\{props\.actions\} icon=\{props\.icon\} \/>/,
  )
  // No hand-made heading row is left beside its buttons.
  for (const name of views) assert.doesNotMatch(source(name), /items-center gap-3">\s*<(ViewHeading|CardTitle)/, name)
})

test('Specs heading: an icon-only Refresh, and no New spec or New task anywhere', () => {
  const plans = source('PlansView.tsx')
  const part = plans.slice(plans.indexOf('function PlansActions'), plans.indexOf("// The row's icon buttons"))
  assert.match(part, /<IconBtn icon=\{RefreshCw\} label="Refresh specs" tooltip=\{REFRESH_PLANS_TIP\}/)
  assert.match(plans, /REFRESH_PLANS_TIP = 'Reload specs from disk\. Imports nothing\.'/)
  assert.match(plans, /actions=\{\s*<PlansActions/)
  for (const name of views) assert.doesNotMatch(source(name), />\s*(New task|New spec|Add task)\s*</, name)
})

test('a Needs you title opens what it is about', () => {
  const base = { key: 'k', kind: 'decision', title: 'T', detail: 'd', tab: 'conflicts', href: null }
  assert.deepEqual(attentionTarget({ ...base, taskId: 'W1' }), { kind: 'task', id: 'W1' })
  assert.deepEqual(attentionTarget({ ...base, kind: 'review', taskId: null, group: { kind: 'review' } }), { kind: 'review' })
  assert.deepEqual(attentionTarget({ ...base, kind: 'content-match', taskId: null }), { kind: 'tab', tab: 'waiting' })
  assert.equal(attentionTip({ ...base, taskId: 'W1' }), 'Open W1 in the drawer')
  assert.equal(attentionTip({ ...base, kind: 'review', taskId: null, group: {} }), 'Open the list of tasks to review')
})

test('Settings > Flow puts each sub-section in its own titled box', () => {
  const flow = source('FlowSettings.tsx')
  assert.match(flow, /function FlowBox\(\{ children \}[\s\S]*?<Card flex flexCol gap="4" data-flow-box>/)
  const titles = [...flow.matchAll(/<FlowBox>\s*<Section title="([^"]+)" blurb="[^"]+"/g)].map((m) => m[1])
  assert.deepEqual(titles, ['Timing', 'Pause on a broken check', 'Local checks first'])
  assert.equal(flow.match(/<FlowBox>/g).length, titles.length)
})
