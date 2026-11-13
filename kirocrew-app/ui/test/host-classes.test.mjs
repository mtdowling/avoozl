// The page has no stylesheet of its own: a class works only when the Kiro
// Crew host's CSS already defines it. The Plans view once laid out its list
// and detail with `md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`, which the host
// does not define, so the detail stacked under a long list, out of sight,
// and a click on a plan looked like it did nothing.
//
// Point KIROCREW_HOST_CSS at the host's built assets directory (or one CSS
// file) to check every class the page uses. Without it the class check is
// skipped; the layout rule below always runs.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const src = new URL('../src/', import.meta.url)
const files = readdirSync(src).filter((name) => name.endsWith('.tsx'))
const source = (name) => readFileSync(new URL(name, src), 'utf8')

// Static class tokens from className="..." and className={`...`}, without
// the ${...} parts.
function classTokens(text) {
  const tokens = new Set()
  for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const value = (match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, ' ')
    for (const token of value.split(/\s+/)) if (token) tokens.add(token)
  }
  return tokens
}

const escape = (token) => token.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)

test('every class the page uses is defined by the host CSS', (t) => {
  const given = process.env.KIROCREW_HOST_CSS
  if (!given) return t.skip('set KIROCREW_HOST_CSS to the host CSS directory or file')
  const css = statSync(given).isDirectory()
    ? readdirSync(given)
        .filter((name) => name.endsWith('.css'))
        .map((name) => readFileSync(path.join(given, name), 'utf8'))
        .join('\n')
    : readFileSync(given, 'utf8')
  const missing = []
  for (const name of files)
    for (const token of classTokens(source(name)))
      if (!css.includes(`.${escape(token)}`)) missing.push(`${name}: ${token}`)
  assert.deepEqual(missing, [])
})

test('Plans lays out with inline styles, not an arbitrary grid class', () => {
  const plans = source('PlansView.tsx')
  assert.doesNotMatch(plans, /grid-cols-\[/)
})
