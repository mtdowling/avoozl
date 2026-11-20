// The page has no stylesheet of its own: a class works only when the Kiro
// Crew host's CSS already defines it. The Plans view once laid out its list
// and detail with `md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`, which the host
// does not define, so the detail stacked under a long list, out of sight,
// and a click on a plan looked like it did nothing.
//
// The host's stylesheet is the one named in kirocrew-css.json: a release, its
// published package and the SHA-256 of the built file (see kirocrew-css.mjs).
// The check always runs; it is never skipped.
//
// host-classes-known.json lists the classes the stylesheet lacks today, with
// their files. The list only shrinks: a new missing class fails, and so does a
// listed class that is no longer missing. A class that only src/ui/ uses is
// defined there as a rule of its part, not listed here.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { missingClasses } from './class-tokens.mjs'
import { checkDigest, kirocrewStylesheet } from './kirocrew-css.mjs'

const src = new URL('../src/', import.meta.url)
const files = readdirSync(src, { recursive: true }).filter((name) => name.endsWith('.tsx'))
const source = (name) => readFileSync(new URL(name, src), 'utf8')

test('every class the page uses is defined by the host CSS', async () => {
  const css = await kirocrewStylesheet()
  const sources = Object.fromEntries(files.map((name) => [name.split(path.sep).join('/'), source(name)]))
  const known = Object.entries(JSON.parse(readFileSync(new URL('./host-classes-known.json', import.meta.url), 'utf8')))
    .map(([token, names]) => `${token}: ${names.join(', ')}`)
    .sort()
  assert.deepEqual(missingClasses(css, sources), known)
})

test('a class the stylesheet lacks is named with the files that use it', () => {
  const css = '.flex{display:flex}.md\\:flex{display:flex}'
  const found = missingClasses(css, {
    'A.tsx': '<div className="flex nope" />',
    'ui/B.tsx': '<div className={`md:flex nope ${x}`} />',
  })
  assert.deepEqual(found, ['nope: A.tsx, ui/B.tsx'])
})

test('a stylesheet with another digest is refused', () => {
  assert.throws(() => checkDigest(Buffer.from('.flex{}')), /refused/)
})

test('Plans lays out with inline styles, not an arbitrary grid class', () => {
  const plans = source('PlansView.tsx')
  assert.doesNotMatch(plans, /grid-cols-\[/)
})
