// Source-level checks for Home's rows and the badge colors. Home's own CSS
// is HomeParts.tsx's HOME_CSS; these read the source the host renders.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const dashboard = source('DashboardView.tsx')
const parts = source('HomeParts.tsx')

// The section ids inside each <HomePair>, in order.
function pairs() {
  return [...dashboard.matchAll(/<HomePair id="([\w-]+)">([\s\S]*?)<\/HomePair>/g)].map((m) => ({
    pair: m[1],
    sections: [...m[2].matchAll(/<HomeSection\s+id="([\w-]+)"/g)].map((t) => t[1]),
  }))
}

test('Home: the tiles, Needs you full width, then Landing queue beside CI health and Recently landed beside Stuck or quiet', () => {
  assert.deepEqual(pairs(), [
    { pair: 'landing-ci', sections: ['landing-queue', 'ci-health'] },
    { pair: 'landed-stuck', sections: ['landed', 'stuck'] },
    { pair: 'flight-progress', sections: ['in-flight', 'progress-by-epic'] },
  ])
  // The nav says Home, so the heading is for screen readers only; Refresh
  // is in the nav.
  assert.match(dashboard, /<h2 id="avoozl-dashboard-title" className="sr-only">\s*Home\s*<\/h2>/)
  assert.match(dashboard, /usePublishRefresh\(useRefreshCountdown\(workspaceId, refreshHome, busy\)\)/)
  assert.doesNotMatch(dashboard, /<ViewHeading/)
  assert.doesNotMatch(dashboard, /StateCounts|UntriagedStat|Show them in Delivery|Up next/)
  const order = ['<LineBanner', '<Tiles', '<HomeSection\n        id="needs-you"', '<HomePair id="landing-ci"', '<HomePair id="landed-stuck"', '<HomePair id="flight-progress"', '<ReleaseQueue', '<IntegrationBranches']
  const at = order.map((text) => dashboard.indexOf(text))
  assert.ok(at.every((n) => n > 0), JSON.stringify(at))
  assert.deepEqual([...at].sort((a, b) => a - b), at, order.join(' < '))
  // No yellow before the kind labels: needs-you's warm color lives in the CSS.
  assert.doesNotMatch(dashboard.slice(0, dashboard.indexOf('const KIND_LABEL')), /warn|yellow|amber/i)
})

test('six tiles link to their views, and only Needs you turns warm, only when something waits', async () => {
  const { homeTiles } = await import('../src/home-api.ts')
  const counts = { ready: 3, running: 0, waiting: 2, 'needs-you': 0, done: 0, deferred: 0, draft: 0 }
  const summary = (attention) => ({ counts, attention, inFlight: [{}], radarFlight: [] })
  const tiles = homeTiles(summary([{}]), { queue: [{}], landed: [], landedThisWeek: 4 })
  assert.deepEqual(
    tiles.map((t) => [t.label, t.value, t.target]),
    [
      ['Ready', 3, 'graph'],
      ['Running', 1, 'lanes'],
      ['Needs you', 1, 'waiting'],
      ['Waiting', 2, 'graph'],
      ['Landing queue', 1, 'landing'],
      ['Landed this week', 4, 'flow'],
    ],
  )
  assert.deepEqual(tiles.filter((t) => t.warm).map((t) => t.key), ['needs-you'])
  assert.deepEqual(homeTiles(summary([]), null).filter((t) => t.warm), [])
  // Unread reads show a dash, not a zero.
  assert.ok(homeTiles(null, null).every((t) => t.value === null))
  assert.match(parts, /\[data-home-tile\]\[data-warm\] \[data-home-tile-value\]\{color:var\(--tile-orange,var\(--warning\)\)\}/)
})

test('phones stack every row to one column, and nothing moves under reduced motion', () => {
  assert.match(parts, /@media \(max-width:767px\)\{[^\n]*\[data-home-needs\],\[data-home-pair\]\{grid-template-columns:minmax\(0,1fr\)\}/)
  assert.match(parts, /\[data-home-needs\]\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
  assert.match(parts, /@media \(prefers-reduced-motion:reduce\)\{\[data-home-tile\]\{transition:none\}\}/)
  assert.match(parts, /\[data-home-head\] h3\{[^}]*text-transform:uppercase/)
})

test('every #N link opens GitHub in a new tab with noopener noreferrer', () => {
  for (const text of [dashboard, parts]) {
    for (const m of text.matchAll(/target="_blank"[^>]*/g)) assert.match(m[0], /rel="noopener noreferrer"/, m[0])
    assert.doesNotMatch(text, /rel="noreferrer"/)
  }
  assert.match(parts, /<a data-home-pr href=\{linkHref\(url\)\} target="_blank" rel="noopener noreferrer"/)
})

test('a section with no data yet says so in one line', () => {
  for (const line of ['Landing data is not available from this backend yet.', 'CI data is not available from this backend yet.', 'Nothing has landed yet.', 'Nothing waits to land.'])
    assert.ok(dashboard.includes(line), line)
})

test('an empty Home explains what to set up with a button, instead of hiding cards', () => {
  assert.match(dashboard, /<SetupCard/)
  assert.match(dashboard, /setupCards\(/)
  assert.doesNotMatch(dashboard, /DriverCell/)
  assert.doesNotMatch(dashboard, /No tasks yet/)
  assert.match(source('ReleaseQueue.tsx'), /data-release-empty/)
  assert.doesNotMatch(source('ReleaseQueue.tsx'), /Nothing to show for a workspace with no Issue Radar plan: no card/)
})

test('Needs you cards have one answer button and Ask, and epic rows open the plan graph drilled in', () => {
  assert.match(dashboard, /<SmallBtn primary onClick=\{onAnswer\}[^>]*>\s*\{answerLabel\(item\)\}/)
  assert.match(dashboard, /<IconBtn icon=\{MessageSquare\} label=\{`Ask in a chat about/)
  assert.match(dashboard, /attention\.slice\(0, NEEDS_SHOWN\)/)
  assert.match(dashboard, /props\.onDrill\?\.\(\{ kind: 'epic', id: entry\.epic, title \}\)/)
  assert.match(dashboard, /\{entry\.running > 0 && \(/)
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
