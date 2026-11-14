// Source-level checks for the Dashboard rows and the badge colors. The page
// has no CSS of its own, so these read the source the host renders.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const dashboard = source('DashboardView.tsx')

// The Section titles inside each <Pair>, in order.
function rows() {
  return [...dashboard.matchAll(/<Pair height=\{ROW_HEIGHT\.(\w+)\}>([\s\S]*?)<\/Pair>/g)].map((m) => ({
    row: m[1],
    titles: [...m[2].matchAll(/<Section\s+title=\{?[`"]([^`"($]+)/g)].map((t) => t[1].trim()),
  }))
}

test('the Dashboard has a one-line state header, then two paired rows in the owner order', () => {
  assert.deepEqual(rows(), [
    { row: 'flight', titles: ['In flight', 'Progress by epic'] },
    { row: 'blocked', titles: ['Needs you', 'Up next'] },
  ])
  // The state buttons sit in the Dashboard heading row; countsStyles lays
  // them out by width. There is no separate Tasks by state title or card.
  // It is the shared heading: the total, Refresh and Untriaged beside the
  // title, the state buttons as its right-aligned actions.
  const header = dashboard.match(/<ViewHeading\s+id="avoozl-dashboard-title"\s+view="dashboard"([\s\S]*?)>\s*Dashboard\s*<\/ViewHeading>/)
  assert.ok(header, 'the heading row exists')
  assert.match(header[1], /actions=\{[\s\S]*<StateCounts counts=\{summary\.counts\}/)
  assert.match(header[1], /wideActions=\{layout !== 'wide'\}/)
  assert.ok(header[1].indexOf('meta=') < header[1].indexOf('<StateCounts'))
  assert.equal(dashboard.match(/<StateCounts\b/g).length, 1)
  assert.doesNotMatch(dashboard, /Tasks by state \(/)
  assert.doesNotMatch(dashboard, /<h3[^>]*>Tasks by state/)
  assert.match(dashboard, /style=\{styles\.list as CSSProperties\}[^>]*data-state-counts=\{props\.layout\}/)
  assert.match(dashboard, /const layout = countsLayout\(useMedia\(WIDE\), useMedia\(SMALL\)\)/)
  // The total stays, small and muted, beside the title, once; each button
  // names its state and count.
  assert.equal(dashboard.match(/\} tasks<\/span>/g).length, 1)
  assert.match(header[1], /<span className="whitespace-nowrap text-xs text-muted tabular-nums">\{value\.total\} tasks<\/span>/)
  assert.match(dashboard, /aria-label=\{`\$\{state\.label\}: \$\{props\.counts\[state\.id\]\} tasks\. Show them in Delivery`\}/)
  // No yellow: needs-you is the only state that asks for the owner.
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf('const STATE_COLOR'), dashboard.indexOf('const KIND_LABEL')), /warn|yellow|amber/i)
  assert.match(dashboard, /onPick=\{\(state\) => props\.onScope\?\.\('delivery', \{ state \}\)\}/)
})

test('Needs you rows act with icon buttons, and epic rows open the Graph drilled in', () => {
  assert.match(dashboard, /<IconBtn icon=\{DetailsIcon\}/)
  assert.match(dashboard, /<IconBtn icon=\{MessageSquare\} label=\{`Ask in a chat about/)
  assert.match(dashboard, /icon=\{item\.tab === 'conflicts' \? Check : ExternalLink\}/)
  assert.match(dashboard, /props\.onDrill\?\.\(\{ kind: 'epic', id: entry\.epic, title \}\)/)
  // The running count shows only when an epic has a chat running.
  assert.match(dashboard, /\{entry\.running > 0 && \(/)
})

test('wide rows have one fixed height; narrow rows stack with no height', () => {
  assert.match(dashboard, /export const WIDE = '\(min-width: 1024px\)'/)
  assert.match(
    dashboard,
    /style=\{wide \? \{ gridTemplateColumns: 'minmax\(0, 1fr\) minmax\(0, 1fr\)', height \} : undefined\}/,
  )
  assert.match(dashboard, /ROW_HEIGHT = \{ flight: '\d+rem', blocked: '\d+rem' }/)
})

test('each card fills its row and scrolls inside itself', () => {
  assert.match(dashboard, /<Card className="flex h-full min-h-0 flex-col">/)
  assert.match(dashboard, /<div data-scroll className="min-h-0 flex-1 overflow-y-auto">/)
  // Every card on the Dashboard goes through Section, so every card scrolls.
  assert.equal(dashboard.match(/<Card\b/g).length, 1)
})

test('Up next is a table whose tasks open the drawer', () => {
  assert.equal(dashboard.match(/<table /g).length, 1)
  assert.match(dashboard, /<TaskLink id=\{task\.id\}[^>]*onOpen=\{\(\) => drawer\.openTask\(task\.id\)\}/)
})

// The owner removed these cards twice; this fails if either comes back.
test('the home page has no Recently completed or Recent activity card, and reads neither', () => {
  for (const text of [/Recently completed/, /Recent activity/, /RecentActivity/, /ROW_HEIGHT\.recent/, /activity\.recent|chats\.activity|ACTIVITY_LIMIT/, /\.recent\b/])
    assert.doesNotMatch(dashboard, text, String(text))
  assert.doesNotMatch(source('dashboard-api.ts'), /\brecent\b/)
})

test('wave badges use the wave variant, which maps to Kiro purple, not yellow', () => {
  assert.match(dashboard, /<Badge variant="wave">wave \{task\.wave\}<\/Badge>/)
  const badge = source('Badge.tsx')
  assert.match(badge, /wave: \{ variant: 'aim' \}/)
  assert.doesNotMatch(badge.match(/wave: \{[^}]*\}/)[0], /warn/)
  // Only `warning` maps to the host's yellow.
  assert.deepEqual([...badge.matchAll(/(\w+): \{ variant: 'warn'/g)].map((m) => m[1]), ['warning'])
  // No variant at all is grey, not the host's yellow fallback.
  assert.match(badge, /\{ variant: 'muted' as const \}/)
})

test('every page badge goes through Badge.tsx, and no color falls back to warn', () => {
  for (const name of readdirSync(src).filter((n) => n.endsWith('.tsx') && n !== 'Badge.tsx')) {
    const text = source(name)
    assert.doesNotMatch(text, /import \{[^}]*\bBadge\b[^}]*\} from '@kirocrew\/app-sdk\/ui'/, name)
    assert.doesNotMatch(text, /var\(--warn\)/, name)
  }
})
