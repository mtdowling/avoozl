// Review drafts on the page (radar-coder RC20.6, task rc-20.4): the list with
// its filters and the GitHub search, and the Needs you rows. Static and client
// checks; nothing reaches GitHub.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DRAFT_STATE_TEXT, releaseClient } from '../src/release-api.ts'
import { noActionReason, whyLine } from '../src/conflicts-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the client reads review.drafts and sends only the filters that are set', async () => {
  const calls = []
  const client = releaseClient({ post: async (path, body) => (calls.push([body.operation, body.input]), { result: { items: [], searches: [] } }) })
  await client.drafts('w')
  await client.drafts('w', { repository: 'example/app', state: '' })
  assert.deepEqual(calls, [
    ['review.drafts', {}],
    ['review.drafts', { repository: 'example/app' }],
  ])
})

test('the Dashboard shows the list with a repository and a state filter, and the search with Copy', () => {
  assert.match(source('DashboardView.tsx'), /<ReviewDrafts workspaceId=\{workspaceId\} \/>/)
  const view = source('ReviewDrafts.tsx')
  assert.match(view, /<SectionHeading title="Review drafts"/)
  assert.match(view, /id="review-drafts-repository" label="Repository"/)
  assert.match(view, /id="review-drafts-state" label="State"/)
  assert.match(view, /data-draft-search/)
  assert.match(view, /navigator\.clipboard\.writeText\(query\)/)
  assert.match(view, /\{search\.query\}/)
  assert.match(view, /if \(!items\.length\) return null/)
  for (const state of ['queued', 'chat', 'waiting', 'stale', 'submitted', 'discarded', 'replaced', 'ended', 'refused', 'closed'])
    assert.ok(DRAFT_STATE_TEXT[state], state)
})

test('a review draft row says its own detail and points at the pull request', () => {
  const row = { kind: 'needs-human', reason: 'review-draft', taskId: null, authority: 'github', detail: 'Drafted for alice.', pullRequest: 5 }
  assert.equal(whyLine(row), 'Drafted for alice.')
  assert.match(noActionReason(row), /on GitHub/)
  assert.match(source('ConflictsView.tsx'), /item\.reason === 'review-draft' \? `Open pull request/)
})
