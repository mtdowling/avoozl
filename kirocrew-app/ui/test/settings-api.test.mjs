// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { emptyRepository, emptyRule, matchChips, matchClient, settingsClient, setupForm, setupInput, splitList, toForm, toPolicy } from '../src/settings-api.ts'
import { normalizeGitHubPolicy, policySection } from '../../../src/app/github-policy.mjs'

const POLICY = {
  mode: 'plans-repo',
  planningRepository: 'example/plans',
  defaultAuthority: 'github',
  epicIssueType: 'Epic',
  project: {
    owner: 'example',
    number: 7,
    fields: { status: 'Status', release: 'Release', wave: 'Wave' },
    statusValues: { todo: 'Todo', inProgress: 'In progress', done: 'Done', deferred: 'Deferred' },
  },
  repositories: {
    'example/app': {
      checkout: '../app',
      folder: 'Avoozl/app',
      dependencyText: true,
      baseBranch: 'main',
      coder: 'worker',
      allowedActors: ['maintainer', 'second'],
      minimumPermission: 'maintain',
      requiredChecks: ['build'],
      concurrency: 2,
      priority: ['critical'],
      pullRequestReviews: { approvals: 2 },
      managedLabels: { managed: 'agent:managed', ready: 'agent:ready' },
      rules: [
        { id: 'build', action: 'deliver', match: 'label:agent:build -label:agent:paused assignee:maintainer', autoPublishChildren: true },
        { id: 'pause', action: 'pause', match: 'label:agent:paused' },
      ],
    },
  },
}

test('a policy round-trips through the form unchanged', () => {
  assert.deepEqual(toPolicy(toForm(POLICY)), POLICY)
})

test('the form keeps settings it does not show', () => {
  const form = toForm(POLICY)
  assert.deepEqual(form.repositories[0].rest, { checkout: '../app', folder: 'Avoozl/app', dependencyText: true })
  assert.equal(form.repositories[0].allowedActors, 'maintainer, second')
})

test('cleared fields become null at the top and vanish below it', () => {
  const form = toForm(POLICY)
  form.mode = ''
  form.planningRepository = '  '
  form.epicIssueType = ''
  form.fields = { status: 'Status', release: '' }
  form.repositories[0].minimumPermission = ''
  form.repositories[0].rules[0].author = ''
  const policy = toPolicy(form)
  assert.equal(policy.mode, null)
  assert.equal(policy.planningRepository, null)
  assert.equal(policy.epicIssueType, null)
  assert.deepEqual(policy.project.fields, { status: 'Status' })
  const repository = policy.repositories['example/app']
  assert.equal('minimumPermission' in repository, false)
  assert.equal('author' in repository.rules[0], false)
})

test('a legacy rule loads as one match line and saves as match', () => {
  const legacy = structuredClone(POLICY)
  legacy.repositories['example/app'].rules = [
    { id: 'build', action: 'deliver', labelsAll: ['agent:build', 'needs triage'], labelsAny: ['a,b', 'c'], labelsNone: ['agent:paused'], assignee: 'maintainer', autoPublishChildren: true },
    { id: 'pause', action: 'pause', labelsAny: ['agent:paused'] },
  ]
  const form = toForm(legacy)
  assert.deepEqual(
    form.repositories[0].rules.map((rule) => rule.match),
    ['label:agent:build label:"needs triage" label:"a,b",c -label:agent:paused assignee:maintainer', 'label:agent:paused'],
  )
  const saved = toPolicy(form)
  const rules = saved.repositories['example/app'].rules
  assert.equal(rules.some((rule) => 'labelsAll' in rule || 'labelsAny' in rule || 'labelsNone' in rule || 'assignee' in rule), false)
  // The saved match rules mean what the legacy rules meant.
  const fields = (policy) =>
    normalizeGitHubPolicy(policy).repositories['example/app'].rules.map(({ labelsAll, labelsAny, labelsNone, assignee }) => ({
      // One label in "any" is the same as one in "all".
      labelsAll: labelsAll.concat(labelsAny.length === 1 ? labelsAny : []),
      labelsAny: labelsAny.length === 1 ? [] : labelsAny,
      labelsNone,
      assignee,
    }))
  assert.deepEqual(fields(saved), fields(legacy))
})

test('matchChips groups the parsed line; matchClient asks the preview op', async () => {
  assert.deepEqual(
    matchChips({ labelsAll: ['go'], labelsAny: [], labelsNone: ['hold'], assignee: null, unassigned: true }),
    [
      { kind: 'all', values: ['go'] },
      { kind: 'none', values: ['hold'] },
      { kind: 'assignee', values: ['nobody'] },
    ],
  )
  assert.deepEqual(matchChips(null), [])
  const calls = []
  const ask = matchClient({ post: async (path, body) => (calls.push({ path, body }), { result: { ok: 1 } }) })
  assert.deepEqual(await ask('ws', ' o/r ', 'label:go'), { ok: 1 })
  await ask('ws', '', 'label:go')
  assert.deepEqual(
    calls.map((call) => [call.path, call.body]),
    [
      [COMMAND_PATH, { operation: 'github.trigger.preview', input: { match: 'label:go', repository: 'o/r' }, workspaceId: 'ws' }],
      [COMMAND_PATH, { operation: 'github.trigger.preview', input: { match: 'label:go' }, workspaceId: 'ws' }],
    ],
  )
})

test('pull-request reviews: on with a count, on with the default, or off', () => {
  const form = toForm(POLICY)
  const repository = form.repositories[0]
  assert.deepEqual([repository.pullRequestReviews, repository.reviewApprovals], [true, '2'])
  assert.equal('pullRequestReviews' in repository.rest, false)
  const reviews = () => toPolicy(form).repositories['example/app'].pullRequestReviews
  repository.reviewApprovals = ''
  assert.deepEqual(reviews(), {})
  repository.reviewApprovals = '11'
  assert.deepEqual(reviews(), { approvals: 11 })
  repository.pullRequestReviews = false
  assert.equal(reviews(), undefined)
  assert.equal(toForm({ repositories: { 'a/b': {} } }).repositories[0].pullRequestReviews, false)
})

// The form's output goes through the backend's own validator, the one
// github.settings.validate and github.settings.update run.
test('the backend accepts the reviews setting and refuses a bad one', () => {
  const form = toForm(POLICY)
  const check = () => normalizeGitHubPolicy(policySection(toPolicy(form)))
  assert.deepEqual(check().repositories['example/app'].pullRequestReviews, { approvals: 2 })
  form.repositories[0].reviewApprovals = ''
  assert.deepEqual(check().repositories['example/app'].pullRequestReviews, { approvals: 1 })
  form.repositories[0].reviewApprovals = '11'
  assert.throws(check, /approvals must be a whole number from 1 to 10/)
  form.repositories[0].reviewApprovals = '2'
  form.repositories[0].allowedActors = ''
  form.repositories[0].minimumPermission = ''
  form.repositories[0].rules = []
  // Naming nobody means people with write access count (owner decision 2026-11-12).
  assert.equal(check().repositories['example/app'].minimumPermission, 'write')
  form.repositories[0].pullRequestReviews = false
  assert.equal(check().repositories['example/app'].pullRequestReviews, null)
})

test('an empty form clears every policy key', () => {
  assert.deepEqual(toPolicy(toForm({})), {
    mode: null,
    planningRepository: null,
    defaultAuthority: null,
    epicIssueType: null,
    project: null,
    repositories: null,
  })
})

test('lists split on commas and lines; numbers stay as typed when not whole', () => {
  assert.deepEqual(splitList(' a, b\nc ,, '), ['a', 'b', 'c'])
  assert.equal(splitList(' , '), undefined)
  const form = toForm({})
  form.projectOwner = 'example'
  form.projectNumber = 'seven'
  const repository = emptyRepository('example/new')
  repository.concurrency = '3'
  repository.rules = [{ ...emptyRule(), id: 'go', match: ' label:x ' }]
  form.repositories = [repository]
  const policy = toPolicy(form)
  assert.deepEqual(policy.project, { owner: 'example', number: 'seven' })
  assert.deepEqual(policy.repositories['example/new'], {
    baseBranch: 'main',
    concurrency: 3,
    rules: [{ id: 'go', action: 'deliver', match: 'label:x' }],
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
  const form = setupForm(POLICY)
  assert.equal(form.mode, 'plans-repo')
  assert.equal(form.repositories, 'example/app')
  assert.deepEqual(setupInput(form), {
    mode: 'plans-repo',
    planningRepository: 'example/plans',
    repositories: ['example/app'],
    project: { owner: 'example', number: 7 },
    iteration: false,
    tableByWave: false,
    epic: true,
  })
  const fresh = setupForm({})
  fresh.mode = 'single-repo'
  fresh.planningRepository = 'example/ignored'
  fresh.repositories = 'a/b'
  fresh.projectOwner = 'a'
  fresh.projectTitle = 'Board'
  fresh.releases = 'one, two'
  assert.deepEqual(setupInput(fresh), {
    mode: 'single-repo',
    repositories: ['a/b'],
    project: { owner: 'a', title: 'Board' },
    releases: ['one', 'two'],
    iteration: false,
    tableByWave: false,
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
