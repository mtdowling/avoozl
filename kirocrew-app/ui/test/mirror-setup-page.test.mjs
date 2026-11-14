// The Mirror section of Settings (RC27, rc-26.4): the page holds no logic.
// It sends the dry run, then only the ticked lines with the dry run's hash.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { canTick, mirrorSetupClient, tickedIds } from '../src/mirror-setup-api.ts'

const lines = [
  { id: 'mirror', state: 'found', status: 'ok', detail: 'exists', ticked: false },
  { id: 'labels', state: 'missing', status: 'change', detail: 'Create labels', ticked: true },
  { id: 'branch-rule', state: 'differs', status: 'change', detail: 'another tool', ticked: false },
  { id: 'auto-merge', state: 'missing', status: 'blocked', detail: 'off', ticked: false, permission: 'Administration' },
  { id: 'setting', state: 'missing', status: 'change', detail: 'Save', ticked: true },
]
const fakeApi = () => {
  const calls = []
  return { calls, post: async (path, body) => (calls.push([path, body]), { result: { previewHash: 'h1', lines } }) }
}

test('the dry run sends the names and no confirm', async () => {
  const api = fakeApi()
  const result = await mirrorSetupClient(api).preview('w1', 'create', { repository: 'a/b-private', source: 'a/b' })
  assert.deepEqual(api.calls[0][1], { operation: 'mirror.create', input: { repository: 'a/b-private', source: 'a/b' }, workspaceId: 'w1' })
  assert.equal(result.lines.length, 5)
})

test('only ticked lines apply, with the dry run hash', async () => {
  assert.deepEqual(tickedIds(lines, new Set()), ['labels', 'setting'])
  // The person unticks one: it is not sent. A rule kept by another tool starts unticked.
  assert.deepEqual(tickedIds(lines, new Set(['setting'])), ['labels'])
  assert.equal(canTick(lines[3]), false)
  const api = fakeApi()
  await mirrorSetupClient(api).apply('w1', 'adopt', { repository: 'a/b-private', source: 'a/b' }, 'h1', tickedIds(lines, new Set(['setting'])))
  assert.deepEqual(api.calls[0][1].input, { repository: 'a/b-private', source: 'a/b', confirm: true, previewHash: 'h1', ticked: ['labels'] })
  assert.equal(api.calls[0][1].operation, 'mirror.adopt')
})

test('the section has both buttons and calls only the client', () => {
  const page = readFileSync(new URL('../src/MirrorSetup.tsx', import.meta.url), 'utf8')
  for (const text of ['data-mirror-setup', 'MIRROR_BUTTONS', 'mirrorSetupClient', 'tickedIds']) assert.ok(page.includes(text), text)
  assert.doesNotMatch(page, /operation:/)
})
