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

test('Home has the heading, the driver card, then Needs you beside In flight, the Release queue and epic progress', () => {
  assert.deepEqual(rows(), [{ row: 'flight', titles: ['Needs you', 'In flight'] }])
  const header = dashboard.match(/<ViewHeading\s+id="avoozl-dashboard-title"\s+view="dashboard"([\s\S]*?)>\s*Home\s*<\/ViewHeading>/)
  assert.ok(header, 'the heading row exists')
  // The state buttons and the Untriaged count went with Delivery and Intake.
  assert.doesNotMatch(dashboard, /StateCounts|UntriagedStat|Show them in Delivery|Up next/)
  const order = ['<DriverSessionBox', '<Pair', '<ReleaseQueue', 'data-progress-by-epic', '<IntegrationBranches']
  const at = order.map((text) => dashboard.indexOf(text))
  assert.deepEqual([...at].sort((a, b) => a - b), at, order.join(' < '))
  assert.ok(at.every((n) => n > 0))
  // No yellow: needs-you is the only state that asks for the owner.
  assert.doesNotMatch(dashboard.slice(0, dashboard.indexOf('const KIND_LABEL')), /warn|yellow|amber/i)
})

test('an empty Home explains what to set up with a button, instead of hiding cards', () => {
  assert.match(dashboard, /<SetupCard/)
  assert.match(dashboard, /setupCards\(/)
  assert.match(dashboard, /<DriverSessionBox workspaceId=\{workspaceId\} \/>/)
  assert.doesNotMatch(dashboard, /No tasks yet/)
  assert.match(source('ReleaseQueue.tsx'), /data-release-empty/)
  assert.doesNotMatch(source('ReleaseQueue.tsx'), /Nothing to show for a workspace with no Issue Radar plan: no card/)
})

test('Needs you rows act with icon buttons, and epic rows open the plan graph drilled in', () => {
  assert.match(dashboard, /<IconBtn icon=\{DetailsIcon\}/)
  assert.match(dashboard, /<IconBtn icon=\{MessageSquare\} label=\{`Ask in a chat about/)
  assert.match(dashboard, /icon=\{item\.tab === 'waiting' \? Check : ExternalLink\}/)
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
  assert.match(dashboard, /ROW_HEIGHT = \{ flight: '\d+rem' }/)
})

test('each card fills its row and scrolls inside itself', () => {
  assert.match(dashboard, /<Card className="flex h-full min-h-0 flex-col">/)
  assert.match(dashboard, /<div data-scroll className="min-h-0 flex-1 overflow-y-auto">/)
  // Every card on the Dashboard goes through Section, so every card scrolls.
  assert.equal(dashboard.match(/<Card\b/g).length, 1)
})

// The owner removed these cards twice; this fails if either comes back.
test('the home page has no Recently completed or Recent activity card, and reads neither', () => {
  for (const text of [/Recently completed/, /Recent activity/, /RecentActivity/, /ROW_HEIGHT\.recent/, /activity\.recent|chats\.activity|ACTIVITY_LIMIT/, /\.recent\b/])
    assert.doesNotMatch(dashboard, text, String(text))
  assert.doesNotMatch(source('dashboard-api.ts'), /\brecent\b/)
})

test('wave badges use the wave variant, which maps to Kiro purple, not yellow', () => {
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
