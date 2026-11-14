// The shared filter panel, paging, tooltip and details icon.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { PAGE, moreLabel, visibleCount } from '../src/paging.ts'
import { TOOLTIP_DELAY, TOOLTIP_MARGIN, placeTooltip, tooltipController } from '../src/tooltip.ts'
import {
  ACTION_TIPS,
  conflictChoices,
  conflictFilterActive,
  matchesConflict,
  readConflictFilter,
  writeConflictFilter,
} from '../src/conflicts-api.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const views = readdirSync(src).filter((name) => name.endsWith('.tsx'))

test('every list shows PAGE rows, then PAGE more a click', () => {
  assert.equal(visibleCount(1, PAGE * 3 + 7), PAGE)
  assert.equal(visibleCount(2, PAGE * 3 + 7), PAGE * 2)
  assert.equal(visibleCount(4, PAGE * 3 + 7), PAGE * 3 + 7)
  assert.equal(visibleCount(1, 3), 3)
  assert.equal(moreLabel(PAGE * 2 + 12), `Show ${PAGE} more (${PAGE * 2 + 12} left)`)
  assert.equal(moreLabel(12), 'Show 12 more (12 left)')
})

test('lists page through the one hook and button, and a filter change resets them', () => {
  const controls = source('controls.tsx')
  assert.match(controls, /export function usePages\(reset: string\)/)
  assert.match(controls, /const pages = state\.reset === reset \? state\.pages : \{\}/)
  assert.match(controls, /export function ShowMore/)
  for (const [name, ids] of [
    ['DashboardView.tsx', ['flight', 'attention', 'next']],
    ['ConflictsView.tsx', ['conflicts']],
    ['TaskDrawer.tsx', ['timeline']],
  ])
    for (const id of ids) {
      assert.match(source(name), new RegExp(`pages\\.take\\('${id}'`), `${name} ${id}`)
      assert.match(source(name), new RegExp(`<ShowMore \\{\\.\\.\\.pages\\.more\\('${id}'`), `${name} ${id}`)
    }
  assert.match(source('DeliveryView.tsx'), /pages\.take\(id, cards\)/)
  assert.match(source('DeliveryView.tsx'), /reset=\{JSON\.stringify\(filter\)\}/)
  assert.match(source('PlansView.tsx'), /pages\.take\(group\.category, group\.rows\)/)
  assert.match(source('PlansView.tsx'), /reset=\{JSON\.stringify\(filter\)\}/)
  assert.match(source('ConflictsView.tsx'), /const pages = usePages\(reset\)/)
  // No list keeps its own limit.
  for (const name of views) assert.doesNotMatch(source(name), /GROUP_LIMIT|LANE_LIMIT|const SHOWN = /, name)
})

test('Graph, Delivery, Plans and Conflicts use the one boxed filter panel', () => {
  assert.match(source('FilterBar.tsx'), /<FilterPanel/)
  assert.match(source('PlansView.tsx'), /<FilterPanel\s+id="avoozl-plans"/)
  assert.match(source('ConflictsView.tsx'), /<FilterPanel\s+id="avoozl-conflicts"/)
  assert.match(source('GraphView.tsx'), /<FilterBar id="avoozl-graph"/)
  assert.match(source('DeliveryView.tsx'), /<FilterBar id="avoozl-delivery"/)
  const panel = source('FilterPanel.tsx')
  assert.match(panel, /<Card>\s*<div role="search"/)
  assert.match(panel, /useMedia\('\(max-width: 767px\)'\)/)
  // Conflicts lost its kind tabs; kind is a filter.
  assert.doesNotMatch(source('ConflictsView.tsx'), /SegmentedControl/)
  for (const label of ['Search', 'Kind', 'Spec', 'Epic', 'Repository', 'Age', 'Changed by'])
    assert.match(source('ConflictsView.tsx'), new RegExp(`label: '${label}'`), label)
})

const item = (kind, taskId, extra = {}) => ({ kind, taskId, title: taskId, detail: 'd', authority: 'local', issue: null, ...extra })
const graph = {
  tasks: [
    { id: 'a', title: 'a', epic: 'e1', spec: 'one', repository: 'org/x' },
    { id: 'g', title: 'g', epic: 'e2', spec: 'two', repository: null },
  ],
  epics: [
    { id: 'e1', title: 'Epic one', count: 1 },
    { id: 'e2', title: 'Epic two', count: 1 },
  ],
}
const now = Date.parse('2026-11-12T12:00:00Z')

test('Conflicts filter: kind with counts, plan, epic, repository, age and who changed it', () => {
  const items = [
    item('needs-human', 'a', { reason: 'review', openedAt: '2026-11-12T11:00:00Z' }),
    item('github-conflict', 'g', { field: 'title', changedBy: 'octo', changedAt: '2026-11-01T00:00:00Z' }),
  ]
  const choices = conflictChoices(items, graph)
  assert.deepEqual(
    choices.kinds.map((k) => k.label),
    ['GitHub edits (1)', 'Decisions (0)', 'Needs you (1)', 'Sessions and resources (0)'],
  )
  assert.deepEqual(choices.changedBy, [{ value: 'octo', label: 'octo' }])
  assert.deepEqual(
    choices.repositories.map((r) => r.value),
    ['org/x', '(none)'],
  )
  const keep = (filter) => items.filter((i) => matchesConflict(i, filter, graph.tasks.find((t) => t.id === i.taskId), now)).map((i) => i.taskId)
  assert.deepEqual(keep({}), ['a', 'g'])
  assert.deepEqual(keep({ kind: 'github-conflict' }), ['g'])
  assert.deepEqual(keep({ plan: 'spec:one' }), ['a'])
  assert.deepEqual(keep({ epic: 'e2' }), ['g'])
  assert.deepEqual(keep({ repository: '(none)' }), ['g'])
  assert.deepEqual(keep({ age: '7d' }), ['g'])
  assert.deepEqual(keep({ changedBy: 'octo' }), ['g'])
  assert.deepEqual(keep({ q: 'A' }), ['a'])
  assert.equal(conflictFilterActive({}), false)
  assert.equal(conflictFilterActive({ kind: 'decision' }), true)
})

test('Conflicts filter is saved per workspace and drops unknown values', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  writeConflictFilter(storage, 'w1', { kind: 'decision', age: '1d', q: 'x' })
  assert.deepEqual(readConflictFilter(storage, 'w1'), { kind: 'decision', age: '1d', q: 'x' })
  assert.deepEqual(readConflictFilter(storage, 'w2'), {})
  store.set('avoozl.conflict-filters.w3', JSON.stringify({ kind: 'nope', age: '2y', epic: 5 }))
  assert.deepEqual(readConflictFilter(storage, 'w3'), {})
})

test('Conflicts select-all says what it covers, and bulk acts on exactly that', () => {
  const view = source('ConflictsView.tsx')
  assert.match(view, /Select the \{shown\.length\} shown/)
  assert.match(view, /Select all \{matching\.length\} matching/)
  assert.match(view, /const picked = matching\.filter\(\(item\) => selected\.has\(itemKey\(item\)\)\)/)
  assert.match(view, /Bulk acts on these \$\{picked\.length\}/)
  assert.match(view, /tasks\.settle\(workspaceId, action, picked\.flatMap\(settleTargets\), revision\)/)
  // A filter change clears the selection with the list.
  assert.match(view, /useEffect\(\(\) => setSelected\(new Set\(\)\), \[reset\]\)/)
  for (const tip of Object.values(ACTION_TIPS)) assert.ok(tip.split(/\s+/).length <= 12, tip)
})

const timers = () => {
  const queue = []
  return {
    queue,
    setTimer: (run, ms) => {
      queue.push({ run, ms })
      return queue.length - 1
    },
    clearTimer: (id) => {
      if (queue[id]) queue[id].run = null
    },
    fire: () => queue.forEach((t) => t.run?.()),
  }
}

test('tooltip: hover waits, keyboard focus shows at once, leave, blur and Esc hide', () => {
  const t = timers()
  const seen = []
  const tip = tooltipController({ onChange: (open) => seen.push(open), setTimer: t.setTimer, clearTimer: t.clearTimer })
  tip.enter('mouse')
  assert.equal(tip.open, false)
  assert.equal(t.queue[0].ms, TOOLTIP_DELAY)
  t.fire()
  assert.equal(tip.open, true)
  tip.leave()
  assert.equal(tip.open, false)
  tip.focus(true)
  assert.equal(tip.open, true, 'keyboard focus shows at once')
  tip.key('Escape')
  assert.equal(tip.open, false)
  tip.focus(false)
  assert.equal(tip.open, false, 'a mouse click focus does not show it')
  tip.focus(true)
  tip.blur()
  assert.equal(tip.open, false)
  tip.enter('touch')
  t.fire()
  assert.equal(tip.open, false, 'touch never shows a hover tooltip')
  tip.enter('mouse')
  tip.leave()
  t.fire()
  assert.equal(tip.open, false, 'leaving before the delay cancels it')
  assert.deepEqual(seen, [true, false, true, false, true, false])
})

test('tooltip: one open at a time', () => {
  const a = tooltipController({ onChange: () => {} })
  const b = tooltipController({ onChange: () => {} })
  a.focus(true)
  b.focus(true)
  assert.equal(a.open, false)
  assert.equal(b.open, true)
  b.hide()
})

test('tooltip: above by default, flips below at the top edge, shifts inside the sides', () => {
  const view = { width: 800, height: 600 }
  const tip = { width: 120, height: 24 }
  const mid = placeTooltip({ top: 300, left: 400, width: 40, height: 20 }, tip, view)
  assert.equal(mid.side, 'top')
  assert.ok(mid.top + tip.height <= 300)
  const top = placeTooltip({ top: 2, left: 400, width: 40, height: 20 }, tip, view)
  assert.equal(top.side, 'bottom')
  assert.ok(top.top >= 22)
  const left = placeTooltip({ top: 300, left: 0, width: 20, height: 20 }, tip, view)
  assert.equal(left.left, TOOLTIP_MARGIN)
  const right = placeTooltip({ top: 300, left: 790, width: 10, height: 20 }, tip, view)
  assert.equal(right.left + tip.width, view.width - TOOLTIP_MARGIN)
  // The arrow still points at the anchor after a shift.
  assert.ok(right.arrow > tip.width / 2)
})

test('tooltip renders in a fixed layer, is described, honors reduced motion, and replaces title=', () => {
  const tooltip = source('Tooltip.tsx')
  assert.match(tooltip, /createPortal\(/)
  assert.match(tooltip, /position: 'fixed'/)
  assert.match(tooltip, /role="tooltip" hidden/)
  assert.match(tooltip, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(tooltip, /--warn|yellow|amber/i)
  const controls = source('controls.tsx')
  assert.match(controls, /aria-describedby=\{describedBy\}/)
  // No native title tooltip is left on a page element. Component props named
  // title (cards, sections, folds) are not HTML attributes.
  const html = /<(button|span|a|code|td|tr|p|Btn)\b[^>]*\btitle=/
  for (const name of views) assert.doesNotMatch(source(name), html, name)
})

test('every details button uses the one details icon; Eye stays for show-on-page only', () => {
  assert.match(source('icons.ts'), /export const DetailsIcon = Info/)
  for (const name of views) assert.doesNotMatch(source(name), /icon=\{Info\}/, name)
  const eyes = views.flatMap((name) => [...source(name).matchAll(/icon=\{Eye\}[\s\S]{0,1500}?<\/IconLabel>/g)].map((m) => m[0]))
  assert.equal(eyes.length, 2)
  for (const eye of eyes) assert.match(eye, /Show the (matched line|lines this task was made from here)/)
})

test('each view heading and its nav tab show the same icon, hidden from readers', () => {
  const icons = source('icons.ts')
  const map = icons.slice(icons.indexOf('export const VIEW_ICONS'))
  for (const view of ['dashboard', 'plans', 'graph', 'delivery', 'conflicts', 'settings']) assert.match(map, new RegExp(`${view}: \\w+`), view)
  for (const [file, view] of [
    ['DashboardView.tsx', 'dashboard'],
    ['PlansView.tsx', 'plans'],
    ['GraphView.tsx', 'graph'],
    ['DeliveryView.tsx', 'delivery'],
    ['ConflictsView.tsx', 'conflicts'],
    ['SettingsView.tsx', 'settings'],
  ])
    assert.match(source(file), new RegExp(`<ViewHeading\\s+id="avoozl-${view}-title"\\s+view="${view}"[\\s>]`), file)
  assert.match(source('App.tsx'), /<ViewLabel view=\{t\.key\}>\{t\.label\}<\/ViewLabel>/)
  const controls = source('controls.tsx')
  assert.match(controls, /<Icon size=\{level === 2 \? 18 : 16\} aria-hidden="true"/)
  assert.match(controls, /<Icon size=\{ICON\} aria-hidden="true"/)
  assert.doesNotMatch(controls.slice(controls.indexOf('export function ViewHeading')), /warn|yellow/)
})


test('repository rows join checkouts with their GitHub settings, and GitHub-only entries follow', async () => {
  const { repositoryRows, githubHref } = await import('../src/repository-rows.ts')
  const rows = repositoryRows(
    [
      { id: 'nupp', name: 'nupp', localCheckout: '/x/nupp', github: 'nupp-lang/nupp', baseBranch: 'main' },
      { id: 'local', name: 'local', localCheckout: '/x/local', github: null, baseBranch: 'trunk' },
    ],
    [{ name: 'example/plans', baseBranch: 'main' }, { name: 'nupp-lang/nupp', baseBranch: 'core-dev' }],
  )
  assert.deepEqual(
    rows.map((r) => [r.key, r.policy, r.github, r.branch, r.folder]),
    [
      ['checkout:nupp', 1, 'nupp-lang/nupp', 'core-dev', '/x/nupp'],
      ['checkout:local', -1, null, 'trunk', '/x/local'],
      ['policy:0', 0, 'example/plans', 'main', null],
    ],
  )
  assert.equal(githubHref('o/r'), 'https://github.com/o/r')
  assert.equal(githubHref('javascript:alert(1)'), null)
})

test('workspace states read as plain words; yellow only where the owner must act', async () => {
  const { WORKSPACE_STATES, workspaceState } = await import('../src/workspace-api.ts')
  assert.equal(workspaceState('closed').label, 'On')
  assert.equal(workspaceState('stopped').label, 'Turned off')
  assert.equal(workspaceState('draining').label, 'Finishing work')
  for (const [state, entry] of Object.entries(WORKSPACE_STATES))
    assert.equal(entry.variant === 'warning', ['degraded', 'quarantined'].includes(state), state)
  assert.match(source('WorkspaceView.tsx'), /Add a workspace/)
  assert.match(source('WorkspaceView.tsx'), /A workspace is a folder with your specs\. Pick one that already has them, or start a new one\./)
  assert.doesNotMatch(source('WorkspaceView.tsx'), /Add or initialize/)
})
