// The Isolation panel's form: defaults, what it refuses, and the setting it
// writes with repository.configure.
import assert from 'node:assert/strict'
import test from 'node:test'
import { RUN_CHOICES, isolationForm, isolationInput, isolationProblem } from '../src/isolation-form.ts'

test('a repository with no setting reads as the sandbox with the network off', () => {
  const form = isolationForm(null)
  assert.deepEqual([form.run, form.network, form.image], ['sandbox', 'off', ''])
  assert.deepEqual(isolationInput(form), { run: 'sandbox', network: 'off' })
  assert.deepEqual(
    RUN_CHOICES.map((choice) => choice.value),
    ['sandbox', 'container', 'unconfined'],
  )
})

test('the form round-trips a container setting with paths and prepare', () => {
  const value = {
    run: 'container',
    image: 'node:22',
    network: 'on',
    readable: ['/opt/sdk'],
    writable: ['/tmp/cache', '/var/tmp/out'],
    prepare: ['npm', 'ci'],
  }
  assert.deepEqual(isolationInput(isolationForm(value)), value)
})

test('a container needs an image, and paths must be absolute', () => {
  assert.equal(isolationProblem({ ...isolationForm(null), run: 'container' }), 'Name the container image.')
  assert.equal(isolationProblem({ ...isolationForm(null), run: 'container', image: 'a b' }), 'The image is one name, such as node:22.')
  assert.match(isolationProblem({ ...isolationForm(null), readable: 'relative/dir' }) ?? '', /not an absolute path/)
  assert.equal(isolationProblem({ ...isolationForm(null), writable: '/abs\n\n/also' }), null)
  // The image is dropped when the run is not a container.
  assert.equal(isolationInput({ ...isolationForm(null), image: 'node:22' }).image, undefined)
})

test('the worker, runtime and stranger keys round-trip, and a box needs an image (vm-harness VM1, VM6.10)', () => {
  const value = {
    run: 'sandbox',
    worker: 'container',
    runtime: 'apple-container',
    image: 'node:22',
    network: 'off',
    strangers: 'host',
    strangerRoles: ['triage', 'checks'],
  }
  assert.deepEqual(isolationInput(isolationForm(value)), value)
  // The defaults write nothing new.
  assert.deepEqual(isolationInput(isolationForm({ run: 'sandbox', network: 'off' })), { run: 'sandbox', network: 'off' })
  assert.equal(isolationProblem({ ...isolationForm(null), worker: 'container' }), 'Name the container image.')
})
