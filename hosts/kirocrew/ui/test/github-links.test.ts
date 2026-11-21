// GitHub web links built from validated parts (github-links.ts).
import assert from 'node:assert/strict'
import test from 'node:test'
import { githubItemOf, githubUrl, githubUserUrl, knownRepository } from '../src/github-links.ts'

test('each kind of link is built from a validated owner/name', () => {
  assert.equal(githubUrl('o/app'), 'https://github.com/o/app')
  assert.equal(githubUrl('o/app', { kind: 'pull', number: 12 }), 'https://github.com/o/app/pull/12')
  assert.equal(githubUrl('o/app', { kind: 'issue', number: 3 }), 'https://github.com/o/app/issues/3')
  assert.equal(githubUrl('o/app', { kind: 'checks', number: 12 }), 'https://github.com/o/app/pull/12/checks')
  assert.equal(githubUrl('o/app', { kind: 'commit', sha: '0123abc' }), 'https://github.com/o/app/commit/0123abc')
  assert.equal(githubUrl('o/app', { kind: 'branch', ref: 'avoozl/spec/a1' }), 'https://github.com/o/app/tree/avoozl/spec/a1')
})

test('a value that fails validation builds no link', () => {
  for (const repository of [null, '', 'o', 'o/app/x', '../app', 'o/..', 'o/a pp', 'javascript:alert(1)']) assert.equal(githubUrl(repository), null, String(repository))
  assert.equal(githubUrl('o/app', { kind: 'pull', number: 0 }), null)
  assert.equal(githubUrl('o/app', { kind: 'pull', number: 1.5 }), null)
  assert.equal(githubUrl('o/app', { kind: 'commit', sha: 'abc' }), null)
  assert.equal(githubUrl('o/app', { kind: 'commit', sha: 'XYZ1234' }), null)
  for (const ref of ['a..b', '/main', 'main/', 'a//b', 'x.lock', '-x', 'a b', '?q']) assert.equal(githubUrl('o/app', { kind: 'branch', ref }), null, ref)
})

test('a login links to its profile only when GitHub could hold it', () => {
  assert.equal(githubUserUrl('octo-cat'), 'https://github.com/octo-cat')
  for (const login of [null, '', '-octo', 'a/b', 'session:x', 'x'.repeat(40)]) assert.equal(githubUserUrl(login), null, String(login))
})

test('a stored link is read back only for a known repository and built again', () => {
  assert.deepEqual(githubItemOf('https://github.com/O/App/pull/4', ['o/app']), { repository: 'o/app', kind: 'pull', number: 4 })
  assert.deepEqual(githubItemOf('https://github.com/o/app/issues/9/', ['o/app']), { repository: 'o/app', kind: 'issue', number: 9 })
  assert.equal(githubItemOf('https://github.com/evil/app/pull/4', ['o/app']), null)
  assert.equal(githubItemOf('https://github.com.evil/o/app/pull/4', ['o/app']), null)
  assert.equal(githubItemOf('https://github.com/o/app/pull/4?x=1', ['o/app']), null)
  assert.equal(githubItemOf(null, ['o/app']), null)
  assert.equal(knownRepository('O/APP', ['o/app']), 'o/app')
  assert.equal(knownRepository('o/other', ['o/app']), null)
})
