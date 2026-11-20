// plugin-checks pk-3.1: the words a task's plugin checks, a check's step
// and a decide answer show, and the mapping form's parse, from fixture
// records.
import assert from 'node:assert/strict'
import test from 'node:test'
import { decideLine, parseMapping, resultLine, stepLine } from '../src/plugin-checks-api.ts'

test('each result says what happened, with the cached mark and the skip filter', () => {
  assert.equal(resultLine({ name: 'parity', result: 'passed' }), 'passed')
  assert.equal(resultLine({ name: 'parity', result: 'cached', passed: false, firstCommit: 'abcdef1234' }), 'cached, failed at abcdef1')
  assert.equal(resultLine({ name: 'parity', result: 'skipped', filter: 'decide' }), 'skipped by decide')
  assert.equal(resultLine({ name: 'parity', result: 'deciding' }), 'deciding')
  assert.equal(resultLine({ name: 'parity', result: 'not run' }), 'not run')
})

test('a step names its script or its tools in order', () => {
  assert.equal(stepLine({ kind: 'run', argv: ['bin/parity.mjs', '{commit}'] }), 'bin/parity.mjs {commit}')
  assert.equal(stepLine({ kind: 'mcp', server: 'review', start: { tool: 'create_review' }, poll: { tool: 'get_review' } }), 'create_review, then get_review on server review')
})

test('a decide answer names its point and reason, and a flip its person', () => {
  assert.equal(decideLine({ check: 'p', plugin: 'a', at: 'diff', state: 'done', needed: false, reason: 'Docs only.' }), 'not needed at diff: Docs only.')
  assert.equal(decideLine({ check: 'p', plugin: 'a', at: 'approve', state: 'done', needed: true, reason: 'x', cause: 'bad output' }), 'needed at approve: x (bad output)')
  assert.equal(decideLine({ check: 'p', plugin: 'a', at: 'flip', state: 'done', needed: true, flippedBy: 'owner' }), 'Run it, by owner')
  assert.equal(decideLine({ check: 'p', plugin: 'a', at: 'diff', state: 'queued' }), 'asked at diff, waiting for the answer')
})

test('a mapping is a JSON argument list and comma separated names', () => {
  assert.deepEqual(parseMapping('["/opt/review-mcp", "--stdio"]', 'REVIEW_TOKEN, OTHER'), { command: ['/opt/review-mcp', '--stdio'], env: ['REVIEW_TOKEN', 'OTHER'] })
  assert.match(parseMapping('/opt/review-mcp --stdio', '').error, /JSON list/)
  assert.match(parseMapping('[]', '').error, /one or more/)
})
