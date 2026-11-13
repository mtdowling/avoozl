// Round 3 of the owner's feedback: confirm steps, the shared filter bar,
// highlighting with a custom language, Conflicts helpers, icons and the
// accordion. No DOM renderer here (react-dom is not a dependency), so wiring
// is checked in the source and logic directly.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { MAX_HIGHLIGHT, highlight, registerLanguages, toGrammar, tokenStyle } from '../src/highlight.ts'
import { outline } from '../src/markdown.ts'
import { bulkAction, confirmSettle, liveChats, tabCounts, whyLine } from '../src/conflicts-api.ts'
import { itemRef } from '../src/chat-api.ts'
import { drillGraph, nodeClick } from '../src/graph-layout.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const views = readdirSync(src).filter((name) => name.endsWith('.tsx'))

// Every button whose words delete, discard or cannot be undone in one click.
const DESTRUCTIVE = /^(Remove|Dismiss|Discard|Delete|Supersede|Re-apply|Allow once|Settle|Create replacement)\b/

test('every destructive button asks first through a red confirm', () => {
  const plain = []
  for (const name of views) {
    const text = source(name)
    // A host <Btn> (not a DangerBtn) whose label is destructive.
    // Attributes may hold arrow functions, so `=>` does not end the tag.
    for (const m of text.matchAll(/<(?:Btn|IconLabel|IconBtn|button)\b((?:=>|[^>])*)>\s*([^<{]*)/g)) {
      const label = `${m[2].trim()} ${/aria-label=["{`]+([^"`}]+)/.exec(m[1])?.[1] ?? ''}`.trim()
      if (DESTRUCTIVE.test(m[2].trim()) || DESTRUCTIVE.test(/label=["{`]+([^"`}]+)/.exec(m[1])?.[1] ?? '')) plain.push(`${name}: ${label}`)
    }
  }
  // Two labels open or edit an unsaved form rather than act: Supersede opens
  // the replacement form (its Create replacement asks), and TaskForm's Remove
  // drops a prerequisite from the form before Save.
  // Plans' trash buttons open DeletePlanDialog, whose red Delete plan button
  // is the confirm itself (it says what happens and can't be sent by Enter).
  // Routing's Remove choice drops a row from the rule form before Save, and
  // Providers' limit Remove drops a row from the Thresholds form before Save.
  const forms = new Set(['DeliveryDetails.tsx: Supersede', 'TaskForm.tsx: Remove', 'PlansView.tsx: )}', 'PlansView.tsx: ', 'PlansView.tsx: Delete spec', 'RoutingView.tsx: '])
  assert.deepEqual(plain.filter((entry) => !forms.has(entry)), [])
  // The ones the owner named, each a DangerBtn with its own copy.
  const settings = source('SettingsView.tsx')
  assert.match(source('RepositoriesSettings.tsx'), /title: `Remove \$\{row\.name\} from this workspace\?`/)
  assert.match(settings, /action: 'Remove rule'/)
  assert.match(settings, /action: 'Discard changes'/)
  assert.match(source('PluginsSettings.tsx'), /action: 'Remove plugin'/)
  assert.match(source('ConflictsView.tsx'), /confirm=\{confirmSettle\('dismiss', 1, item\.title\)\}/)
  // Bulk resolve asks before it settles anything.
  assert.match(source('ConflictsView.tsx'), /if \(!\(await ask\(confirmSettle\(action, settleCount\(picked\)\)\)\)\) return/)
  // DangerBtn runs onConfirm only on yes; the dialog's confirm is red and
  // focus starts on Cancel.
  const controls = source('controls.tsx')
  assert.match(controls, /ask\(props\.confirm\)\.then\(\(yes\) => yes && props\.onConfirm\(\)\)/)
  assert.match(controls, /background: 'var\(--danger\)'/)
  assert.match(controls, /cancel\.current\?\.focus\(\)/)
  assert.match(source('App.tsx'), /<ConfirmProvider>/)
  // Removing a workspace is not offered on this page, so it needs no step.
  assert.doesNotMatch(source('WorkspaceView.tsx'), /Remove workspace/)
})

test('confirm copy names the thing and what happens', () => {
  const copy = confirmSettle('dismiss', 1, 'Parse the header')
  assert.equal(copy.title, 'Dismiss: Parse the header?')
  assert.match(copy.body, /leave the list/)
  assert.equal(copy.action, 'Dismiss')
  assert.equal(confirmSettle('reviewed', 4).title, 'Mark reviewed: 4 tasks?')
})

test('Graph and Delivery share one filter bar, one saved state per workspace', () => {
  for (const name of ['GraphView.tsx', 'DeliveryView.tsx']) {
    const text = source(name)
    assert.match(text, /useSharedFilter\(workspaceId\)/, name)
    assert.match(text, /<FilterBar id="avoozl-(graph|delivery)" filter=\{filter\} choices=\{choices\}/, name)
  }
  const bar = source('FilterBar.tsx')
  for (const label of ['Search', 'Plan', 'Epic', 'Repository', 'State', 'Wave', 'Owner', 'Needs me', 'Clear']) assert.match(bar, new RegExp(label), label)
})

test('a fence in a custom language highlights from its JSON grammar; an unknown one stays plain', () => {
  const loaded = registerLanguages({
    nupp: {
      tokens: [
        { type: 'comment', pattern: '--.*' },
        { type: 'keyword', pattern: '\\b(?:fn|let|return)\\b' },
        { type: 'number', pattern: '\\b\\d+\\b' },
        { type: 'string', pattern: '"[^"]*"' },
      ],
    },
    broken: { tokens: [{ type: 'keyword', pattern: '(' }] },
  })
  assert.deepEqual(loaded, ['nupp'])
  const tokens = highlight('fn main() -- entry\n  let x = 42', 'nupp')
  const typed = tokens.filter((t) => typeof t !== 'string').map((t) => [t.types.at(-1), t.content.join('')])
  assert.deepEqual(typed, [
    ['keyword', 'fn'],
    ['comment', '-- entry'],
    ['keyword', 'let'],
    ['number', '42'],
  ])
  assert.equal(tokens.map((t) => (typeof t === 'string' ? t : t.content.join(''))).join(''), 'fn main() -- entry\n  let x = 42')
  assert.equal(highlight('anything', 'no-such-language'), null)
  assert.equal(highlight('x', null), null)
  assert.equal(highlight('x'.repeat(MAX_HIGHLIGHT + 1), 'nupp'), null)
  assert.equal(toGrammar({ tokens: [{ type: 'keyword', pattern: '[' }] }), null)
  // Bundled languages work under their fence aliases.
  assert.ok(highlight('const a = 1', 'ts').some((t) => typeof t !== 'string' && t.types.includes('keyword')))
  // Colors are theme variables and never the warning yellow.
  assert.match(tokenStyle(['keyword']).color, /^var\(--tile-purple/)
  assert.equal(tokenStyle(['comment']).fontStyle, 'italic')
  assert.doesNotMatch(source('highlight.ts'), /--warn/)
  // The global Prism the grammars need is put back afterwards.
  assert.equal(globalThis.Prism, undefined)
})

test('headings get anchors for the plan outline, and prose has a readable measure', () => {
  const heads = outline('# Title\n\n## One\n\ntext\n\n## Two\n### Deep', 'avoozl-doc-design')
  assert.deepEqual(
    heads.map((h) => [h.level, h.text]),
    [
      [1, 'Title'],
      [2, 'One'],
      [2, 'Two'],
      [3, 'Deep'],
    ],
  )
  assert.match(heads[1].id, /^avoozl-doc-design-one-\d+$/)
  assert.match(source('PlansView.tsx'), /export const PROSE_MEASURE = '80ch'/)
  assert.match(source('Markdown.tsx'), /id=\{idPrefix \? headingId\(idPrefix, block\.text, i\) : undefined\}/)
})

test('the plan view keeps a sticky left column that stacks on narrow pages, with Edit and Discuss', () => {
  const plans = source('PlansView.tsx')
  assert.match(plans, /position: 'sticky'/)
  assert.match(plans, /useMedia\(STACK\)/)
  assert.match(plans, /Edit spec/)
  assert.match(plans, /Discuss spec/)
  assert.match(plans, /chat\.ask\(discussSeed\(row\)\)/)
  // The plan view has no Add task; the list and the Graph keep theirs.
  const detail = plans.slice(plans.indexOf('{row && ('))
  assert.doesNotMatch(detail.slice(0, detail.indexOf('</div>')), /addTask/)
  for (const label of ["Open this spec's documents and tasks", "Show this spec's tasks in the Graph", "Show this spec's tasks in Delivery", 'Open this spec to check and approve it', 'Start a planner chat to change this spec'])
    assert.ok(plans.includes(`tooltip="${label}"`), label)
})

test('Conflicts: tab counts, a plain why, bulk only for one kind, attach to a live chat', () => {
  const item = (kind, taskId, extra = {}) => ({ kind, taskId, title: taskId, detail: 'd', authority: 'local', issue: null, ...extra })
  const items = [item('needs-human', 'a', { reason: 'review' }), item('needs-human', 'b', { reason: 'review' }), item('decision', 'c'), item('github-conflict', 'g', { field: 'title', changedBy: 'octo' })]
  assert.deepEqual(tabCounts(items), { all: 4, 'github-conflict': 1, decision: 1, 'needs-human': 2, other: 0 })
  assert.match(whyLine(items[3]), /^octo changed title on GitHub/)
  assert.match(whyLine(items[0]), /waits for your review/)
  assert.equal(bulkAction(items.slice(0, 2)), 'reviewed')
  assert.equal(bulkAction(items.slice(0, 3)), null)
  assert.equal(bulkAction([items[2]]), null, 'a decision needs its own answer')
  assert.deepEqual(itemRef(item('github-conflict', 'g', { field: 'title' })), { kind: 'github-conflict', taskId: 'g', field: 'title' })
  const delivery = (id, sessions) => ({ id, sessions })
  const chats = liveChats([
    delivery('a', [
      { slot: 'r', role: 'security', attempt: 1, status: 'working' },
      { slot: 'w', role: 'worker', attempt: 1, status: 'working' },
    ]),
    delivery('b', [{ slot: 'x', role: 'worker', attempt: 1, status: 'closed' }]),
  ])
  assert.equal(chats.get('a'), '/chat?sid=w')
  assert.equal(chats.has('b'), false)
  // The Conflicts top tab shows a yellow count only when there is one.
  assert.match(source('App.tsx'), /t\.key === 'conflicts' && conflicts > 0 \?/)
  assert.match(source('App.tsx'), /<Badge variant="warning">\{conflicts\}<\/Badge>/)
})

test('drill-in shows one epic, or one task with everything up and down its chain', () => {
  const task = (id, epic) => ({ id, title: id, epic, kind: 'leaf', state: 'waiting' })
  const graph = {
    revision: 1,
    epics: [],
    statuses: [],
    repositories: [],
    total: 5,
    tasks: [task('a', 'e1'), task('b', 'e1'), task('c', 'e2'), task('d', 'e2'), task('z', 'e3')],
    edges: [
      { from: 'a', to: 'b', blocking: true },
      { from: 'b', to: 'c', blocking: true },
      { from: 'c', to: 'd', blocking: true },
    ],
  }
  assert.deepEqual(drillGraph(graph, { kind: 'epic', id: 'e1', title: 'E1' }).tasks.map((t) => t.id), ['a', 'b'])
  assert.deepEqual(drillGraph(graph, { kind: 'focus', id: 'b', title: 'b' }).tasks.map((t) => t.id), ['a', 'b', 'c', 'd'])
  assert.equal(drillGraph(graph, null), graph)
  assert.equal(nodeClick({ members: { total: 2, done: 0 } }, false), 'drill')
})

test('icons sit on buttons, and every icon is one the host module has', () => {
  const icons = source('icons.ts')
  const names = [...icons.slice(icons.indexOf('export {'), icons.indexOf("} from 'lucide-react'")).matchAll(/\b([A-Z]\w+),/g)].map((m) => m[1])
  const typed = source('kirocrew-app-sdk.d.ts')
  for (const name of names) assert.match(typed, new RegExp(`export const ${name}: LucideIcon`), name)
  for (const name of views) assert.doesNotMatch(source(name), /from 'lucide-react'/, `${name} imports icons through icons.ts`)
  const host = process.env.KIROCREW_LUCIDE_NAMES
  if (host) {
    const known = new Set(JSON.parse(readFileSync(host, 'utf8')))
    assert.deepEqual(names.filter((n) => n.length > 1 && !known.has(n)), [])
  }
  const delivery = source('DeliveryView.tsx')
  for (const icon of ['Play', 'Pause', 'RotateCcw', 'DetailsIcon']) assert.match(delivery, new RegExp(`icon=\\{${icon}\\}`), icon)
  assert.match(delivery, /tooltip=\{DEFER_TIP\}/)
  assert.match(source('delivery-api.ts'), /DEFER_TIP = 'Pauses new dispatch\. A running chat is left alone\. Resume undoes it\.'/)
})
