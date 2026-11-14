// The page's one Back history: tabs, inner tabs, an opened plan, the
// Graph's drill levels, drawers, modals and confirms, forward and back,
// with scroll and selection put back, Esc on the topmost layer, and an
// unsaved dialog asking first.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { changePage, createNav, keyAction, recordChange, settleScroll, typing } from '../src/nav-history.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
// Frames run at once, so a restore settles inside the test.
const now = (step) => step()

// A page like App.tsx: its place, the views' remembered state, a scroller.
function page() {
  const nav = createNav(now)
  const scroller = { scrollTop: 0 }
  nav.scroller.current = scroller
  const place = { tab: 'dashboard', settingsTab: 'workspaces', focus: null, drill: null }
  const apply = (next) => Object.assign(place, Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)))
  const go = (next) => changePage(nav, { ...place }, next, apply, (before, newTab) => (newTab ? `Back to ${before.tab}` : 'Back to the previous Settings section'))
  return { nav, scroller, place, go }
}

test('a tab change is one step; Back returns to the tab, its scroll and its focus', () => {
  const { nav, scroller, place, go } = page()
  scroller.scrollTop = 420
  go({ tab: 'graph', focus: 'W1.3', drill: null })
  scroller.scrollTop = 0
  assert.equal(place.tab, 'graph')
  assert.deepEqual(nav.history.steps().map((s) => [s.kind, s.label]), [['tab', 'Back to dashboard']])
  go({ tab: 'plans', focus: null })
  assert.equal(nav.history.back(), true)
  assert.equal(place.tab, 'graph')
  assert.equal(place.focus, 'W1.3')
  assert.equal(nav.history.back(), true)
  assert.equal(place.tab, 'dashboard')
  assert.equal(scroller.scrollTop, 420)
  // At the root there is nothing to take, so Kiro Crew keeps the press.
  assert.equal(nav.history.back(), false)
  // The same tab again is no step.
  go({ tab: 'dashboard' })
  assert.equal(nav.history.steps().length, 0)
})

test('a Settings section is an inner step; a new visit starts on Workspaces', async () => {
  const { nav, place, go } = page()
  const { settingsTabOnEnter } = await import('../src/settings-api.ts')
  const tabs = ['workspaces', 'repositories', 'github']
  go({ tab: 'settings', settingsTab: settingsTabOnEnter(place.tab, 'settings', place.settingsTab, tabs) })
  assert.equal(place.settingsTab, 'workspaces')
  go({ settingsTab: 'repositories' })
  assert.deepEqual(nav.history.steps().map((s) => s.kind), ['tab', 'inner'])
  nav.history.back()
  assert.equal(place.settingsTab, 'workspaces')
  assert.equal(place.tab, 'settings')
  nav.history.back()
  assert.equal(place.tab, 'dashboard')
})

test('an opened plan comes back when Back returns to its tab, then Back closes it', () => {
  const { nav, scroller, place, go } = page()
  go({ tab: 'plans' })
  // The Plans view: opening a row is a step (useSteppedState).
  let selected = null
  nav.setters.set('plans-selected', (value) => (selected = value))
  scroller.scrollTop = 300
  recordChange(nav, 'select', 'plans-selected', 'Back to all plans', selected)
  selected = 'plan-a'
  nav.memory.set('plans-selected', selected)
  scroller.scrollTop = 0
  // Another tab: the Plans view closes and its state is put away.
  go({ tab: 'delivery' })
  nav.setters.delete('plans-selected')
  assert.equal(nav.memory.size, 0, 'a new tab starts fresh')
  nav.history.back()
  assert.equal(place.tab, 'plans')
  assert.equal(nav.memory.get('plans-selected'), 'plan-a', 'the plan reopens')
  // The view mounts again and reads it back.
  nav.setters.set('plans-selected', (value) => (selected = value))
  nav.history.back()
  assert.equal(selected, null)
  assert.equal(scroller.scrollTop, 300, 'the list scroll comes back')
})

test('a deep link opens the new tab on its inner view; Back returns without it', () => {
  const { nav, place } = page()
  const go = (next, open) => changePage(nav, { ...place }, next, (n) => Object.assign(place, n), (before) => `Back to ${before.tab}`, open)
  go({ tab: 'plans' })
  nav.memory.set('plans-selected', null)
  go({ tab: 'untriaged' }, { 'untriaged-show': 'ideas' })
  assert.equal(place.tab, 'untriaged')
  assert.deepEqual([...nav.memory], [['untriaged-show', 'ideas']], 'the fresh tab starts on Ideas, with nothing else')
  nav.history.back()
  assert.equal(place.tab, 'plans')
  assert.deepEqual([...nav.memory], [['plans-selected', null]], "Plans gets its own state back, not the link's")
  // On the same tab the mounted view is set, with no extra Back step.
  go({ tab: 'untriaged' })
  let shown = 'untriaged'
  nav.setters.set('untriaged-show', (value) => (shown = value))
  const steps = nav.history.steps().length
  go({ tab: 'untriaged' }, { 'untriaged-show': 'ideas' })
  assert.equal(shown, 'ideas')
  assert.equal(nav.history.steps().length, steps)
})

test('the Graph keeps its drill stack and the page history in step', () => {
  const { nav, go } = page()
  go({ tab: 'graph' })
  const graph = []
  const back = () => {
    graph.pop()
    nav.history.sync('graph', graph.length, make)
  }
  const make = () => ({ label: 'Back in the Graph', back: () => nav.handlers.get('graph')?.() })
  nav.handlers.set('graph', back)
  graph.push('epic', 'focus')
  nav.history.sync('graph', graph.length, make)
  assert.equal(nav.history.count('graph'), 2)
  nav.history.back()
  assert.deepEqual(graph, ['epic'])
  assert.equal(nav.history.count('graph'), 1)
  // The Graph's own Back button pops its stack; the page drops a step.
  graph.pop()
  nav.history.sync('graph', graph.length, make)
  assert.equal(nav.history.count('graph'), 0)
  assert.deepEqual(nav.history.steps().map((s) => s.kind), ['tab'])
  // Another visit's levels are not this visit's.
  graph.push('epic')
  nav.history.sync('graph', 1, make)
  go({ tab: 'plans' })
  assert.equal(nav.history.count('graph'), 0)
  nav.history.back()
  assert.equal(nav.history.count('graph'), 1)
})

test('drawers and modals: Back closes the newest, Esc the topmost layer', () => {
  const { nav, go } = page()
  const events = []
  go({ tab: 'graph' })
  let linked = ['task-a']
  const drawer = nav.history.push({
    kind: 'drawer',
    label: 'Close the drawer',
    back: () => (linked.length ? (events.push(`drawer back to ${linked.pop()}`)) : (events.push('drawer closed'), nav.history.release(drawer))),
    dismiss: () => (events.push('drawer closed'), nav.history.release(drawer)),
  })
  const reader = nav.history.push({ kind: 'modal', label: 'Close the file', back: () => (events.push('reader closed'), nav.history.release(reader)) })
  // Back from outside a text field takes the newest step.
  assert.equal(keyAction({ key: 'ArrowLeft', altKey: true, target: { tagName: 'DIV' } }, true, nav.history), 'back')
  nav.history.back()
  // The drawer's Back walks its linked tasks before it closes; Esc closes it.
  nav.history.back()
  assert.equal(keyAction({ key: 'Escape' }, false, nav.history), 'escape')
  nav.history.escape()
  assert.deepEqual(events, ['reader closed', 'drawer back to task-a', 'drawer closed'])
  assert.deepEqual(nav.history.steps().map((s) => s.kind), ['tab'])
  // No layer open: Esc is not ours.
  assert.equal(keyAction({ key: 'Escape' }, true, nav.history), null)
  linked = []
})

test('a dialog with unsaved changes asks first, the same way Cancel does', async () => {
  const { nav } = page()
  let open = true
  let answer = false
  const asked = []
  // RepositoryDialog's dismiss: ask, then discard only on yes.
  const dismiss = () => {
    asked.push('Discard your changes?')
    const confirm = nav.history.push({ kind: 'confirm', label: 'Cancel', back: () => nav.history.release(confirm) })
    return Promise.resolve(answer).then((yes) => {
      nav.history.release(confirm)
      if (yes) {
        open = false
        nav.history.release(modal)
      }
    })
  }
  const modal = nav.history.push({ kind: 'modal', label: 'Close the dialog', back: dismiss })
  nav.history.back()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(open, true, 'No keeps the dialog and its edits')
  assert.deepEqual(asked, ['Discard your changes?'])
  answer = true
  nav.history.back()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(open, false)
  assert.equal(nav.history.steps().length, 0)
  // The wiring: Back and Esc go through the shared Modal, which asks first
  // when `unsaved` is set, then through the dialog's own Cancel.
  const shared = source('Modal.tsx')
  assert.match(shared, /useBackStep\(props\.kind \?\? 'modal', true, props\.backLabel \?\? 'Close the dialog', dismiss\)/)
  assert.match(shared, /if \(!unsaved\) return onDismiss\(\)[\s\S]*?void ask\(unsaved\)\.then\(\(yes\) => \{[\s\S]*?if \(yes\) latest\.current\.onDismiss\(\)/)
  assert.match(source('RepositoriesSettings.tsx'), /unsaved=\{props\.edited && discard\}/)
  for (const name of ['AddPlugin.tsx', 'PackImport.tsx', 'SendToRadar.tsx', 'SetupWizard.tsx'])
    assert.match(source(name), /<(Modal|Shelf)\b[\s\S]*?backLabel="Cancel"[\s\S]*?onDismiss=\{cancel\}/, name)
  assert.match(source('controls.tsx'), /<Modal\s+id="avoozl-confirm"\s+kind="confirm"\s+role="alertdialog"\s+backLabel="Cancel"[\s\S]*?onDismiss=\{\(\) => answer\(false\)\}/)
})

test('the keys and the mouse back button: ours only with a step and from the page', () => {
  const { nav } = page()
  const key = (event, inside = true) => keyAction(event, inside, nav.history)
  assert.equal(key({ key: 'ArrowLeft', altKey: true }), null, 'no step: Kiro Crew has it')
  nav.history.push({ kind: 'tab', label: 'Back', back: () => undefined })
  assert.equal(key({ key: 'ArrowLeft', altKey: true }), 'back')
  assert.equal(key({ key: '[', metaKey: true }), 'back')
  assert.equal(key({ key: '[', metaKey: true }, false), null, 'from outside the page')
  // Alt+Left moves the caret a word in a field; Cmd+[ still goes back.
  assert.equal(key({ key: 'ArrowLeft', altKey: true, target: { tagName: 'TEXTAREA' } }), null)
  assert.equal(key({ key: '[', metaKey: true, target: { tagName: 'INPUT' } }), 'back')
  assert.equal(key({ key: 'ArrowLeft', altKey: true, isComposing: true }), null)
  assert.equal(typing({ isContentEditable: true }), true)
  const wiring = source('NavHistory.tsx')
  // Window capture runs before Kiro Crew's own listeners, which switch
  // chat on Alt+Left and Cmd+[ and step its routes on the mouse button.
  assert.match(wiring, /window\.addEventListener\('keydown', onKey, true\)/)
  assert.match(wiring, /window\.addEventListener\('mouseup', onUp, true\)/)
  assert.match(wiring, /isBackButton\(event\) && fromPage\(event\.target\) && nav\.history\.steps\(\)\.length > 0/)
  assert.match(wiring, /event\.stopImmediatePropagation\(\)/)
  assert.doesNotMatch(wiring, /pushState/)
  // Every modal is portaled to <body>, so it carries the page mark.
  assert.match(source('Modal.tsx'), /data-modal=\{props\.id\}[\s\S]*?\{\.\.\.\{ \[APP_ATTR\]: '' \}\}/)
  assert.match(source('DocumentReader.tsx'), /<Modal\b[^\n]*attrs=\{\{ 'data-document-reader': true \}\}/)
  assert.match(source('App.tsx'), /<div \{\.\.\.\{ \[APP_ATTR\]: '' \}\} style=\{\{ display: 'contents' \}\}>/)
})

test('focus returns to the opener, and a restore waits for the view to grow', () => {
  const wiring = source('NavHistory.tsx')
  assert.match(wiring, /const opener = document\.activeElement/)
  assert.match(wiring, /if \(opener\?\.isConnected && \(!now \|\| now === document\.body\)\) opener\.focus\(\)/)
  // A view still loading is short; the scroll is set again each frame.
  let height = 100
  const element = {
    get scrollTop() {
      return this.top ?? 0
    },
    set scrollTop(value) {
      this.top = Math.min(value, height)
    },
  }
  const frames = []
  settleScroll(element, 400, (step) => frames.push(step))
  assert.equal(element.scrollTop, 100)
  height = 1000
  frames.shift()()
  assert.equal(element.scrollTop, 400)
  assert.equal(frames.length, 0, 'it stops once there')
  // Reduced motion: every restore is instant, with no smooth scrolling.
  assert.doesNotMatch(source('nav-history.ts'), /behavior: 'smooth'/)
})

test('the views use the shared history: inner tabs, the plan, the Graph, the drawer', () => {
  assert.match(source('App.tsx'), /changePage\(\s*nav,\s*here,/)
  // Deep links go through changePage, never a memory write before the switch.
  assert.match(source('App.tsx'), /go\(\{ focus: null, drill: null, tab: 'waiting' \}, \{ 'waiting-section': 'intake', 'untriaged-show': 'ideas' \}\)/)
  assert.doesNotMatch(source('App.tsx'), /nav\.memory\.set\(/)
  assert.match(source('App.tsx'), /onTab=\{\(next\) => go\(\{ settingsTab: next \}\)\}/)
  assert.match(source('SettingsView.tsx'), /useSteppedState<RepositoryTab>\(\s*`settings-repo-tab-\$\{props\.index\}`,\s*'inner',/)
  assert.match(source('UntriagedView.tsx'), /useSteppedState<'untriaged' \| 'radar' \| 'ideas'>\(\s*'untriaged-show',\s*'inner'/)
  assert.match(source('ContentRulesSettings.tsx'), /useSteppedState<'builder' \| 'file'>\(\s*'content-terms-view',\s*'inner'/)
  assert.match(source('PlansView.tsx'), /useSteppedState<string \| null>\(\s*'plans-selected',\s*'select'/)
  assert.match(source('GraphView.tsx'), /useRemembered<DrillEntry\[\]>\('graph-stack', \[\]\)/)
  assert.match(source('TaskDrawer.tsx'), /useBackStep\('drawer',/)
  assert.match(source('NewPlanDrawer.tsx'), /useBackStep\('drawer', true, 'Close New spec', \(\) => void closeRef\.current\(\)\)/)
  assert.match(source('Onboard.tsx'), /<(Modal|Shelf)\b[\s\S]*?backLabel="Cancel"[\s\S]*?onDismiss=\{cancel\}/)
  // No view keeps its own Esc listener any more.
  for (const name of ['Modal.tsx', 'TaskDrawer.tsx', 'AddPlugin.tsx', 'PackImport.tsx', 'SendToRadar.tsx', 'SetupWizard.tsx', 'DocumentReader.tsx', 'controls.tsx', 'PlansView.tsx', 'NewPlanDrawer.tsx', 'Onboard.tsx'])
    assert.doesNotMatch(source(name), /key === 'Escape'|key !== 'Escape'/, name)
})
