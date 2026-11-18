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

test('the task modal is the shared Modal: Esc, the X and Close close it, and focus returns', () => {
  const drawer = source('TaskDrawer.tsx')
  // The shared Modal owns Esc, the backdrop, the X, the footer Close, the
  // focus trap and the return of focus; Back walks the linked-task history first.
  assert.match(drawer, /<Modal\s+id="avoozl-drawer"\s+role="dialog"\s+kind="drawer"/)
  assert.match(drawer, /onDismiss=\{close\}/)
  assert.match(drawer, /onBack=\{\(\) => \(history\.length \? back\(\) : close\(\)\)\}/)
  assert.match(drawer, /Add task after this/)
  assert.match(drawer, /api_\.addTask\(\{ prerequisite: mode\.id \}\)/)
  assert.doesNotMatch(drawer, /aria-modal|fixed inset-0|useBackStep/)
  const modal = source('Modal.tsx')
  assert.match(modal, /data-modal-footer-close/)
  assert.match(modal, /max-width: 767px/)
  assert.match(modal, /before\.focus\(\)/)
})

test('the drawer shows every section, and a linked task opens in it', () => {
  const drawer = source('TaskDrawer.tsx')
  for (const label of ['Summary', 'Description', 'Edges', 'Delivery', 'Conflicts', 'Timeline'])
    assert.match(drawer, new RegExp(`label: '${label}'`))
  // Sections are bordered boxes that fold, all open at once; Edit is a
  // button that opens the form.
  assert.match(drawer, /<SectionBox id="summary" title="Summary">/)
  for (const id of ['description', 'links', 'delivery', 'conflicts', 'timeline']) assert.match(drawer, new RegExp(`<SectionBox id="${id}" title=`))
  // The Waits on / Blocks box is Edges; its id stays 'links' so saved state and deep links still work.
  assert.match(drawer, /<SectionBox id="links" title="Edges">/)
  assert.match(drawer, /\{ key: 'links', label: 'Edges' \}/)
  // The task's own links have their own box, keyed apart from Edges.
  assert.match(drawer, /\{ key: 'task-links', label: 'Links' \}/)
  assert.doesNotMatch(drawer, /notes'/)
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

test('In flight rows have Info and a Session link to their chat', () => {
  const dashboard = source('DashboardView.tsx')
  assert.match(dashboard, /<IconBtn icon=\{DetailsIcon\} label=\{`Details for \$\{row\.title\}`\} tooltip="Open the task drawer" onClick=\{onInfo\} \/>/)
  // A remote chat attaches only through Kiro Crew's MC-10 (R41.14); a
  // `process` child has no chat, so it has no Session link (R98.1).
  assert.match(dashboard, /href = processRow \? null : attachHref\(row\.session\)/)
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

test('a spec row opens the spec in the detail column', () => {
  const plans = source('PlansView.tsx')
  assert.match(plans, /data-plan-row=\{row\.key\}[\s\S]{0,160}onClick=\{\(\) => props\.onOpen\(row\)\}/)
  assert.match(plans, /<SpecList\s+rows=\{rows\}\s+selected=\{row\?\.key \?\? null\}\s+onOpen=\{open\}/)
  // Opening sets the row at once, with no reload first, and scrolls to it.
  assert.match(plans, /const open = \(next: PlanRow\) => openPlan\(next\.key\)/)
  assert.match(plans, /detailTop\.current\?\.scrollIntoView/)
  // Graph and Delivery buttons filter to the plan; App passes the filter on.
  assert.match(plans, /props\.onScope\?\.\(target, \{ plan: rowPlanKey\(next\) \}\)/)
  // App sets the tabs' shared filter, then opens the tab.
  const app = source('App.tsx')
  assert.match(app, /<PlansView\s+workspaceId=\{active\}\s+onScope=\{scopeTo\}\s+onDrill=\{openDrill\}\s+newPlanRequest=\{planGoal\}/)
  // Plan a goal opens the same New plan drawer on the Plans tab, not a chat.
  assert.match(app, /setPlanGoal\(\(request\) => \(\{ n: request\.n \+ 1 \}\)\)\s*go\(\{ focus: null, drill: null, tab: 'plans' \}\)/)
  assert.doesNotMatch(app, /openChat/)
  assert.match(plans, /if \(props\.newPlanRequest\?\.n\) setCreating\(\{ seed: props\.newPlanRequest\.seed \}\)/)
  assert.match(app, /if \(active\) setSharedFilter\(active, filter\)/)
  // The Graph page wraps GraphView as its All tasks tab (FocusTree.tsx).
  assert.match(app, /<GraphPage\s+workspaceId=\{active\}[\s\S]*?focus=\{focus\}\s+drill=\{drill\}\s+onDrill=\{setDrill\}\s+onOpenSpecs=\{\(\) => chooseTab\('plans'\)\}\s+\/>/)
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
  assert.match(source('NeedsYouContext.tsx'), /onClick=\{\(\) => drawer\.openTask\(task\.id\)\}/)
  assert.match(source('ConflictsView.tsx'), /ask\(confirmSettle\('reviewed', count/)
  for (const name of ['ConflictsView.tsx', 'DashboardView.tsx']) assert.match(source(name), /drawer\.openReview\(/, name)
  assert.match(source('GraphView.tsx'), /task\.review && <Badge>review<\/Badge>/)
})
