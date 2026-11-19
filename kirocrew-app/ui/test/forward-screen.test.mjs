// The Forward screen: the client asks for
// the review and pushes only the hash it was shown. Client and static checks.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { forwardClient, forwardOutcome } from '../src/forward-api.ts'
import { noActionReason } from '../src/conflicts-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the client reads the review, then pushes with the hash it saw', async () => {
  const calls = []
  const client = forwardClient({ post: async (_path, body) => (calls.push([body.operation, body.input]), { result: { ok: true } }) })
  await client.review('w', 'abc')
  await client.push('w', 'abc', 'h1')
  assert.deepEqual(calls, [
    ['mirror.forward.review', { id: 'abc' }],
    ['mirror.forward', { id: 'abc', seenHash: 'h1' }],
  ])
})

test('the words after a push say what happened', () => {
  assert.match(forwardOutcome({ ok: false, changed: true }), /differs from what you reviewed/)
  assert.equal(forwardOutcome({ ok: false, blocked: true, reason: 'The path policy blocked this forward.' }), 'The path policy blocked this forward.')
  assert.equal(forwardOutcome({ ok: true, record: { state: 'public_open', publicPr: 41 } }), 'Forwarded. Public pull request #41 is open.')
})

test('a forward row has its own button and no settle text', () => {
  assert.equal(noActionReason({ kind: 'needs-human', reason: 'forward', forwardId: 'x', authority: 'github' }), null)
  assert.match(source('ConflictsView.tsx'), /item\.reason === 'forward' && item\.forwardId/)
})

test('the screen shows diff, title and body and sends the shown hash', () => {
  const screen = source('ForwardScreen.tsx')
  for (const mark of ['data-forward-diff', 'data-forward-title', 'data-forward-body']) assert.ok(screen.includes(mark), mark)
  assert.match(screen, /client\.push\(workspaceId, forwardId, review!\.hash\)/)
  assert.match(screen, /disabled=\{busy \|\| blocked \|\| !review \|\| stopped !== null\}/)
})

test('the forward audit row says how to resume', () => {
  assert.match(noActionReason({ kind: 'needs-human', reason: 'forward-audit', authority: 'github' }), /resume the stop/)
})

test('the public branch row says a person merges it', () => {
  assert.match(noActionReason({ kind: 'needs-human', reason: 'public-branch', authority: 'github' }), /Avoozl never merges it/)
})
