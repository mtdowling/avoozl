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

test('the Dashboard has a one-line state header, then three paired rows in the owner order', () => {
  assert.deepEqual(rows(), [
    { row: 'flight', titles: ['In flight', 'Progress by epic'] },
    { row: 'blocked', titles: ['Needs you', 'Up next'] },
    { row: 'recent', titles: ['Recently completed', 'Recent activity'] },
  ])
  // The state buttons sit in the Dashboard heading row; countsStyles lays
  // them out by width. There is no separate Tasks by state title or card.
  const header = dashboard.match(/<div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-dashboard-header>([\s\S]*?)\n {6}<\/div>/)
  assert.ok(header, 'the heading row exists')
  assert.match(header[1], /<ViewHeading id="avoozl-dashboard-title" view="dashboard">/)
  assert.match(header[1], /<StateCounts counts=\{summary\.counts\}/)
  assert.ok(header[1].indexOf("<ViewHeading") < header[1].indexOf("<StateCounts"))
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
  assert.match(dashboard, /ROW_HEIGHT = \{ flight: '\d+rem', blocked: '\d+rem', recent: '\d+rem' \}/)
})

test('each card fills its row and scrolls inside itself', () => {
  assert.match(dashboard, /<Card className="flex h-full min-h-0 flex-col">/)
  assert.match(dashboard, /<div data-scroll className="min-h-0 flex-1 overflow-y-auto">/)
  // Every card on the Dashboard goes through Section, so every card scrolls.
  assert.equal(dashboard.match(/<Card\b/g).length, 1)
})

test('Up next and Recently completed are tables whose tasks open the drawer', () => {
  assert.equal(dashboard.match(/<table /g).length, 2)
  assert.match(dashboard, /<RecentActivity items=\{value\.activity\}/)
  assert.match(dashboard, /<TaskLink id=\{task\.id\}[^>]*onOpen=\{\(\) => drawer\.openTask\(task\.id\)\}/)
  assert.match(dashboard, /<TaskLink id=\{item\.id\}[^>]*onOpen=\{\(\) => drawer\.openTask\(item\.id\)\}/)
  assert.match(dashboard, /aria-label="Done" style=\{\{ color: 'var\(--ok\)' \}\}/)
  assert.match(dashboard, /relativeTime\(item\.at, now\)/)
  assert.match(dashboard, /PR\{pull\.number/)
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
