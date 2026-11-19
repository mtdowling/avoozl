import assert from 'node:assert/strict'
import test from 'node:test'
import { approveWhy, specPullClient } from '../src/spec-pr-api.ts'
import { COMMAND_PATH } from '../src/workspace-api.ts'

const pull = (extra = {}) => ({ draft: false, approved: false, merging: false, ...extra })

test('Approve is held back for a draft, an approved revision and a merging one', () => {
  assert.equal(approveWhy(pull()), null)
  assert.match(approveWhy(pull({ draft: true })), /draft/)
  assert.match(approveWhy(pull({ approved: true })), /approved/)
  assert.match(approveWhy(pull({ merging: true })), /merges it/)
})

test('the client calls the three spec pull request operations', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push({ path, body }), { result: { items: [] } }) }
  const client = specPullClient(api)
  await client.view('w')
  await client.reject('w', 'id', 'why')
  await client.requestChanges('w', 'id')
  assert.deepEqual(
    calls.map((call) => [call.path, call.body.operation]),
    [
      [COMMAND_PATH, 'specpr.view'],
      [COMMAND_PATH, 'specpr.reject'],
      [COMMAND_PATH, 'specpr.requestChanges'],
    ],
  )
})
