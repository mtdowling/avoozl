// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_NEW_PLAN, epicList, formProblems, isDirty, nameProblem, newPlanClient, suggestName } from '../src/new-plan-api.ts'
import { COMMAND_PATH } from '../src/workspace-api.ts'

test('a name must be a folder name, and not one a plan or folder already uses', () => {
  assert.equal(nameProblem('cache-invalidation', []), null)
  assert.match(nameProblem('', []), /Name the plan/)
  assert.match(nameProblem('Cache Invalidation', []), /like cache-invalidation/)
  assert.match(nameProblem('a/b', []), /like a-b/)
  assert.match(nameProblem('x'.repeat(81), []), /up to 80/)
  assert.match(nameProblem('taken', ['taken']), /already used/)
  assert.equal(suggestName('  Hello, World! '), 'hello-world')
})

test('Submit is blocked until name, a repository and the goal are given', () => {
  const ready = { ...EMPTY_NEW_PLAN, name: 'p', repositories: ['app'], goal: 'Do it.' }
  assert.deepEqual(formProblems(ready, [], 1), [])
  assert.deepEqual(formProblems({ ...ready, repositories: [] }, [], 1), ['Pick at least one repository.'])
  assert.match(formProblems({ ...ready, repositories: [] }, [], 0)[0], /Register a repository/)
  assert.deepEqual(formProblems({ ...ready, goal: ' ' }, [], 1), ['Say what you want.'])
})

test('Cancel asks only when something changed', () => {
  assert.equal(isDirty(EMPTY_NEW_PLAN), false)
  assert.equal(isDirty({ ...EMPTY_NEW_PLAN, goal: 'x' }), true)
})

test('the client sends plan.new with epics as a list', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push({ path, body }), { result: { name: 'p' } }) }
  await newPlanClient(api).request('ws', { ...EMPTY_NEW_PLAN, name: ' p ', epics: 'One\n\n Two ', repositories: ['app'], goal: 'g' })
  assert.equal(calls[0].path, COMMAND_PATH)
  assert.equal(calls[0].body.operation, 'plan.new')
  assert.equal(calls[0].body.workspaceId, 'ws')
  assert.deepEqual(calls[0].body.input.epics, ['One', 'Two'])
  assert.equal(calls[0].body.input.name, 'p')
  assert.deepEqual(epicList(''), [])
})
