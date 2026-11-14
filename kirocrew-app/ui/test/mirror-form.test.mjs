// The "Private mirror" form (RC24.1) writes the same record as the raw file.
import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyRepository, toForm, toPolicy } from '../src/settings-api.ts'

const github = (mirror) => ({
  mode: 'single-repo',
  repositories: { 'acme/app-private': { baseBranch: 'main', ...(mirror ? { mirror } : {}) } },
})
const mirrorOf = (policy) => policy.repositories['acme/app-private'].mirror

test('a repository without a mirror writes none', () => {
  const form = toForm(github())
  assert.equal(form.repositories[0].mirror.source, '')
  assert.equal(mirrorOf(toPolicy(form)), undefined)
  assert.equal(toPolicy({ ...form, repositories: [emptyRepository('o/x')] }).repositories['o/x'].mirror, undefined)
})

test('the form reads and writes every mirror field', () => {
  const mirror = {
    source: 'acme/app',
    mirror: 'acme/app-private',
    forwardTo: 'fork:dev/app',
    forward: 'auto',
    branchPrefix: 'crew/',
    squash: false,
    trustedPersons: ['ana', 'bo'],
    plansBranch: 'private-plans',
  }
  const form = toForm(github(mirror))
  assert.deepEqual(form.repositories[0].mirror, {
    source: 'acme/app',
    mirror: 'acme/app-private',
    forwardTo: 'fork:dev/app',
    forward: 'auto',
    branchPrefix: 'crew/',
    squash: false,
    trustedPersons: 'ana, bo',
    plansBranch: 'private-plans',
  })
  assert.deepEqual(mirrorOf(toPolicy(form)), mirror)
})

test('defaults stay blank in the file, so an untouched file stays untouched', () => {
  const form = toForm(github({ source: 'acme/app', mirror: 'acme/app-private' }))
  assert.equal(form.repositories[0].mirror.squash, true)
  assert.deepEqual(mirrorOf(toPolicy(form)), { source: 'acme/app', mirror: 'acme/app-private' })
})

test('an edit in the form changes the one record', () => {
  const form = toForm(github({ source: 'acme/app', mirror: 'acme/app-private' }))
  form.repositories[0].mirror.forward = 'off'
  assert.deepEqual(mirrorOf(toPolicy(form)), { source: 'acme/app', mirror: 'acme/app-private', forward: 'off' })
})
