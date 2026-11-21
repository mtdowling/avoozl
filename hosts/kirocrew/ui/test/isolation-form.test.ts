// The Isolation panel's form: defaults, what it refuses, and the setting it
// writes with repository.configure.
import assert from 'node:assert/strict'
import test from 'node:test'
import { RUN_CHOICES, isolationForm, isolationInput, isolationProblem, type Isolation } from '../src/isolation-form.ts'

test('a repository with no setting reads as the sandbox with the network off', () => {
  const form = isolationForm(null)
  assert.deepEqual([form.run, form.network], ['sandbox', 'off'])
  assert.deepEqual(isolationInput(form), { run: 'sandbox', network: 'off' })
  assert.deepEqual(
    RUN_CHOICES.map((choice) => choice.value),
    ['sandbox', 'unconfined'],
  )
})

test('the form round-trips a setting with paths and prepare', () => {
  const value: Isolation = {
    run: 'sandbox',
    network: 'on',
    readable: ['/opt/sdk'],
    writable: ['/tmp/cache', '/var/tmp/out'],
    prepare: ['npm', 'ci'],
  }
  assert.deepEqual(isolationInput(isolationForm(value)), value)
})

test('paths must be absolute', () => {
  assert.match(isolationProblem({ ...isolationForm(null), readable: 'relative/dir' }) ?? '', /not an absolute path/)
  assert.equal(isolationProblem({ ...isolationForm(null), writable: '/abs\n\n/also' }), null)
})
