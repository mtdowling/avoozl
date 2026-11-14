// The page has no DOM renderer in its tests (react-dom is not a dependency),
// so these check the drawer's wiring in the source: every view opens it, it
// closes on Escape, the close button and the backdrop, it moves focus in and
// back, and it has no motion under prefers-reduced-motion.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Graph nodes, Home lists and Conflicts items open the drawer', () => {
  for (const name of ['GraphView.tsx', 'DashboardView.tsx', 'ConflictsView.tsx'])
    assert.match(source(name), /drawer\.openTask\(/, name)
  assert.match(source('GraphView.tsx'), /drawer\.addTask\(/)
  assert.match(source('PlansView.tsx'), /drawer\.addTask\(/)
  assert.match(source('App.tsx'), /<TaskDrawerProvider workspaceId=\{active\} onFocus=/)
})

test('the drawer closes on Escape, its button and the backdrop, and returns focus', () => {
  const drawer = source('TaskDrawer.tsx')
  // Esc closes it through the page's Back history; Back walks its own
  // linked-task history first.
  assert.match(drawer, /useBackStep\('drawer', open && Boolean\(workspaceId\), 'Close the drawer', \(\) => \(history\.length \? back\(\) : close\(\)\), close\)/)
  assert.match(drawer, /data-drawer-backdrop\s+onClick=\{close\}/)
  assert.match(drawer, /aria-label="Close task details"/)
  assert.match(drawer, /panel\.current\?\.focus\(\)/)
  assert.match(drawer, /returnTo\.current\?\.focus\?\.\(\)/)
  assert.match(drawer, /prefers-reduced-motion: reduce/)
  assert.match(drawer, /transition: still \|\| dragging \? 'none'/)
  assert.match(drawer, /max-width: 767px/)
  assert.match(drawer, /role="dialog"/)
})

test('the drawer shows every section, and a linked task opens in it', () => {
  const drawer = source('TaskDrawer.tsx')
  for (const label of ['Summary', 'Description', 'Edges', 'Delivery', 'Conflicts', 'Timeline'])
    assert.match(drawer, new RegExp(`label: '${label}'`))
  // Sections are an accordion of native <details> (the host ships none),
  // Summary open by default; Edit is a button that opens the form.
  assert.match(drawer, /<Fold id="summary" group="task-drawer" title="Summary" open=\{detail\.conflicts\.length === 0\}>/)
  for (const id of ['description', 'links', 'delivery', 'conflicts', 'timeline']) assert.match(drawer, new RegExp(`<Fold id="${id}" group="task-drawer"`))
  // The Waits on / Blocks fold is Edges; its id stays 'links' so saved state and deep links still work.
  assert.match(drawer, /<Fold id="links" group="task-drawer" title="Edges">/)
  assert.match(drawer, /\{ key: 'links', label: 'Edges' \}/)
  assert.doesNotMatch(drawer, /label: 'Links' \}|title="Links"/)
  assert.match(drawer, /label: 'Links and notes'/)
  assert.doesNotMatch(drawer, /SegmentedControl/)
  assert.match(source('controls.tsx'), /<details\b/)
  assert.match(drawer, /setEditing\(!editing\)/)
  // Focus shows the task's chain in the Graph; Ask in a chat seeds a chat.
  assert.match(drawer, /props\.onFocus!\(task\.id, task\.title\)/)
  assert.match(drawer, /chat\.ask\(\{ tasks: \[task\.id\] \}\)/)
  assert.match(drawer, /onClick=\{\(\) => open\(link\.id\)\}/)
  for (const action of ['Retry', 'Defer', 'Resume', 'SupersedeForm', 'ConflictActions', 'TaskForm'])
    assert.match(drawer, new RegExp(action))
})

test('In flight rows have Info and an Attach link to their session', () => {
  const dashboard = source('DashboardView.tsx')
  assert.match(dashboard, /<IconBtn icon=\{DetailsIcon\} label=\{`Details for \$\{row\.title\}`\} tooltip="Open the task drawer" onClick=\{onInfo\} \/>/)
  // A remote chat attaches only through Kiro Crew's MC-10 (R41.14).
  assert.match(dashboard, /const href = attachHref\(row\.session\)/)
  assert.match(dashboard, /href=\{linkHref\(href\)\}/)
  // Needs you comes first in reading order, In flight beside it.
  assert.ok(dashboard.indexOf('Needs you (') < dashboard.indexOf('In flight ('))
})

test('a Graph node click opens its task in the drawer, and a drag does not', () => {
  const graph = source('GraphView.tsx')
  // Node's own click goes to select, which asks nodeClick about drags.
  assert.match(graph, /onClick=\{\(\) => props\.onSelect\(node\)\}/)
  assert.match(graph, /const action = nodeClick\(node, moved\.current\)[\s\S]{0,400}drawer\.openTask\(node\.id\)/)
  // A collapsed group opens its level: an epic, a plan, then a phase.
  assert.match(graph, /if \(action === 'drill'\) \{\s*const next = drillInto\(drill, node\.group, node\.title\)/)
  // A press that moves past the threshold marks the gesture as a drag.
  assert.match(graph, /start\.moved = moved\.current = true/)
})

test('a Plans row, its name and Open docs open the plan in view', () => {
  const plans = source('PlansView.tsx')
  assert.match(plans, /<tr[\s\S]{0,120}onClick=\{\(\) => props\.onOpen\(row\)\}/)
  assert.match(plans, /onClick=\{stop\(\(\) => props\.onOpen\(row\)\)\}\s*>\s*\{row\.name\}/)
  assert.match(plans, /onOpen=\{\(\) => props\.onOpen\(row\)\}/)
  assert.match(plans, /<IconBtn icon=\{DetailsIcon\} label=\{`Open docs for \$\{row\.name\}`\} tooltip="Open this spec's documents and tasks"/)
  // Opening sets the row at once, with no reload first, and scrolls to it.
  assert.match(plans, /const open = \(next: PlanRow\) => openPlan\(next\.key\)/)
  assert.match(plans, /detailTop\.current\?\.scrollIntoView/)
  // Graph and Delivery buttons filter to the plan; App passes the filter on.
  assert.match(plans, /onScope=\{\(target\) => props\.onScope\(target, row\)\}/)
  assert.match(plans, /props\.onScope\?\.\(target, \{ plan: rowPlanKey\(next\) \}\)/)
  // App sets the tabs' shared filter, then opens the tab.
  const app = source('App.tsx')
  assert.match(app, /<PlansView\s+workspaceId=\{active\}\s+onScope=\{scopeTo\}\s+onDrill=\{openDrill\}\s+newPlanRequest=\{planGoal\}/)
  // Plan a goal opens the same New plan drawer on the Plans tab, not a chat.
  assert.match(app, /setPlanGoal\(\(request\) => \(\{ n: request\.n \+ 1 \}\)\)\s*go\(\{ focus: null, drill: null, tab: 'plans' \}\)/)
  assert.doesNotMatch(app, /openChat/)
  assert.match(plans, /if \(props\.newPlanRequest\?\.n\) setCreating\(\{ seed: props\.newPlanRequest\.seed \}\)/)
  assert.match(app, /if \(active\) setSharedFilter\(active, filter\)/)
  assert.match(app, /<GraphView workspaceId=\{active\} focus=\{focus\} drill=\{drill\} onDrill=\{setDrill\} \/>/)
})

test('the progress bar uses theme variables and is still under reduced motion', () => {
  const plans = source('PlansView.tsx')
  assert.match(plans, /useMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(plans, /transition: still \? 'none'/)
  assert.match(plans, /var\(--ok\)/)
  assert.match(plans, /var\(--border\)/)
  assert.doesNotMatch(plans.slice(plans.indexOf('export function ProgressBar'), plans.indexOf('const STATUS_VARIANT')), /#[0-9a-f]{3,6}\b/i)
  assert.match(plans, /no tasks/)
})

test('a review group opens in the drawer with its tasks and a confirmed Mark reviewed', () => {
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /openReview: \(group, onReviewed\) =>/)
  assert.match(drawer, /<ReviewPanel/)
  assert.match(drawer, /onClick=\{\(\) => props\.open\(task\.id\)\}/)
  assert.match(source('ConflictsView.tsx'), /ask\(confirmSettle\('reviewed', count/)
  for (const name of ['ConflictsView.tsx', 'DashboardView.tsx']) assert.match(source(name), /drawer\.openReview\(/, name)
  assert.match(source('GraphView.tsx'), /task\.review && <Badge>review<\/Badge>/)
})
