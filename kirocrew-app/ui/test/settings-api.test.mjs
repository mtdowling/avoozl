// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { emptyRepository, settingsClient, setupForm, setupInput, splitList, toForm, toPolicy } from '../src/settings-api.ts'
import { normalizeGitHubPolicy, policySection } from '../../../src/app/github-policy.mjs'

const POLICY = {
  cacheSeconds: 45,
  writesPerMinute: 50,
  writesPerHour: 300,
  epicIssueType: 'Epic',
  repositories: {
    'example/app': {
      checkout: '../app',
      folder: 'Avoozl/app',
      baseBranch: 'main',
      allowedActors: ['maintainer', 'second'],
      minimumPermission: 'maintain',
      requiredChecks: ['build'],
      priorityLabels: ['critical'],
      role: 'both',
    },
  },
}

test('a policy round-trips through the form unchanged', () => {
  assert.deepEqual(toPolicy(toForm(POLICY)), POLICY)
})

test('the form keeps settings it does not show', () => {
  const form = toForm(POLICY)
  assert.deepEqual(form.repositories[0].rest, { checkout: '../app', folder: 'Avoozl/app' })
  assert.equal(form.repositories[0].allowedActors, 'maintainer, second')
})

test('cleared fields become null at the top and vanish below it', () => {
  const form = toForm(POLICY)
  form.epicIssueType = ''
  form.repositories[0].minimumPermission = ''
  const policy = toPolicy(form)
  assert.equal('mode' in policy, false)
  assert.equal('planningRepository' in policy, false)
  assert.equal(policy.epicIssueType, null)
  const repository = policy.repositories['example/app']
  assert.equal('minimumPermission' in repository, false)
})

// The form's output goes through the backend's own validator, the one
// github.settings.validate and github.settings.update run. GitHub's own
// branch review rule replaced the older pullRequestReviews key.
test('the backend accepts the form and refuses the older reviews setting', () => {
  const form = toForm(POLICY)
  const check = () => normalizeGitHubPolicy(policySection(toPolicy(form)))
  assert.equal('pullRequestReviews' in form.repositories[0], false)
  form.repositories[0].allowedActors = ''
  form.repositories[0].minimumPermission = ''
  // Naming nobody means people with write access count (owner decision 2026-11-12).
  assert.equal(check().repositories['example/app'].minimumPermission, 'write')
  form.repositories[0].rest.pullRequestReviews = { approvals: 2 }
  assert.throws(check, /Unknown setting .*pullRequestReviews/)
})

test('an empty form clears every policy key', () => {
  assert.deepEqual(toPolicy(toForm({})), {
    epicIssueType: null,
    cacheSeconds: null,
    writesPerMinute: null,
    writesPerHour: null,
    repositories: null,
  })
})

test('lists split on commas and lines; numbers stay as typed when not whole', () => {
  assert.deepEqual(splitList(' a, b\nc ,, '), ['a', 'b', 'c'])
  assert.equal(splitList(' , '), undefined)
  const form = toForm({})
  const repository = emptyRepository('example/new')
  repository.maxAttempts = '3'
  repository.priority = ' p0,\np1 '
  form.repositories = [repository]
  const policy = toPolicy(form)
  assert.deepEqual(policy.repositories['example/new'], {
    baseBranch: 'main',
    priorityLabels: ['p0', 'p1'],
    conflicts: { maxAttempts: 3 },
  })
})

test('the client calls the three settings operations for the workspace', async () => {
  const calls = []
  const client = settingsClient({
    post: async (path, body) => {
      calls.push({ path, body })
      return { result: { ok: true } }
    },
  })
  await client.get('w1')
  await client.validate('w1', { mode: null })
  await client.save('w1', { mode: null }, 'hash-1')
  assert.deepEqual(
    calls.map(({ path, body }) => [path, body.operation, body.workspaceId]),
    [
      [COMMAND_PATH, 'github.settings.get', 'w1'],
      [COMMAND_PATH, 'github.settings.validate', 'w1'],
      [COMMAND_PATH, 'github.settings.update', 'w1'],
    ],
  )
  assert.deepEqual(calls[2].body.input, { github: { mode: null }, expectedHash: 'hash-1' })
})

test('the setup form starts from saved settings and builds the wizard input', () => {
  // The setup wizard reads the mode the roles make, as the backend derives it.
  const form = setupForm({ ...POLICY, mode: 'plans-repo', planningRepository: 'example/plans' })
  assert.equal(form.mode, 'plans-repo')
  assert.equal(form.repositories, 'example/app')
  assert.deepEqual(setupInput(form), {
    mode: 'plans-repo',
    planningRepository: 'example/plans',
    repositories: ['example/app'],
    epic: true,
  })
  const fresh = setupForm({})
  fresh.mode = 'single-repo'
  fresh.planningRepository = 'example/ignored'
  fresh.repositories = 'a/b'
  assert.deepEqual(setupInput(fresh), {
    mode: 'single-repo',
    repositories: ['a/b'],
    epic: true,
  })
})

test('the setup client previews, then confirms with the preview hash', async () => {
  const calls = []
  const client = settingsClient({
    post: async (path, body) => {
      calls.push(body)
      return { result: { previewHash: 'p1' } }
    },
  })
  await client.setup('w1', { mode: 'plans-repo' })
  await client.setup('w1', { mode: 'plans-repo', confirm: true, previewHash: 'p1' })
  assert.deepEqual(
    calls.map((body) => [body.operation, body.input.confirm ?? false, body.input.previewHash ?? null]),
    [
      ['github.setup', false, null],
      ['github.setup', true, 'p1'],
    ],
  )
})

test('the cache seconds round-trip for the workspace only', () => {
  const github = { cacheSeconds: 45, repositories: { 'o/r': { baseBranch: 'main' } } }
  const form = toForm(github)
  assert.equal(form.cacheSeconds, '45')
  assert.equal('cacheSeconds' in form.repositories[0], false)
  const policy = toPolicy(form)
  assert.equal(policy.cacheSeconds, 45)
  assert.equal('cacheSeconds' in policy.repositories['o/r'], false)
  assert.equal(toPolicy({ ...form, cacheSeconds: '' }).cacheSeconds, null)
})
