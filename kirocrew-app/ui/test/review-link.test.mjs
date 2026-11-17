// A pasted Review view link (R104.9) opens the Specs page, which opens the
// view. The page has no DOM renderer in its tests, so this checks the wiring
// in App.tsx's source, next to the Trace and Graph links it sits beside.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('a ?view=review link opens the Specs page when the page opens', () => {
  assert.match(app, /import \{ parseReviewLink \} from '\.\/review-view\.ts'/)
  assert.match(app, /parseReviewLink\(window\.location\.search\)\) go\(\{ tab: 'plans'/)
})
