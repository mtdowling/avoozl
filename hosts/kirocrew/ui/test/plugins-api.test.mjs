// Runs under node's type stripping: `node --test hosts/kirocrew/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import {
  addInput,
  applyPreview,
  canApprove,
  emptyPluginForm,
  pluginsClient,
  previewInput,
  previewProblem,
  publicWarning,
  sharedBlocked,
  stateLabel,
  updateBadge,
  updateLine,
} from '../src/plugins-api.ts'

test('Add plugin builds one entry and catches what a person must fix', () => {
  const form = { ...emptyPluginForm(), id: 'example-tracker', path: '../tracker', config: '{"tokenEnv":"EXAMPLE_TOKEN"}' }
  assert.deepEqual(addInput(form).input, {
    scope: 'machine',
    confirmPublic: false,
    entry: { id: 'example-tracker', path: '../tracker', contract: 1, config: { tokenEnv: 'EXAMPLE_TOKEN' } },
  })
  assert.deepEqual(addInput({ ...form, where: 'package', package: '@example/t', config: '' }, true).input, {
    scope: 'machine',
    confirmPublic: true,
    entry: { id: 'example-tracker', package: '@example/t', contract: 1 },
  })
  assert.deepEqual(addInput({ ...form, where: 'git', git: 'https://git.example.com/p.git', ref: ' v1 ', subdir: 'plugin', config: '' }).input.entry, {
    id: 'example-tracker',
    git: 'https://git.example.com/p.git',
    ref: 'v1',
    subdir: 'plugin',
    contract: 1,
  })
  assert.deepEqual(addInput({ ...form, where: 'git', git: '../repo', ref: 'main', config: '' }).input.entry, {
    id: 'example-tracker',
    git: '../repo',
    ref: 'main',
    contract: 1,
  })
  assert.match(addInput({ ...form, where: 'git', git: '../repo' }).error, /tag, branch or commit/)
  assert.match(addInput({ ...form, where: 'git', git: '' }).error, /git URL/)
  assert.match(addInput({ ...form, id: 'Bad Id' }).error, /lowercase id/)
  assert.match(addInput({ ...form, id: 'github' }).error, /reserved/)
  assert.match(addInput({ ...form, path: ' ' }).error, /folder/)
  assert.match(addInput({ ...form, config: '[1]' }).error, /JSON object/)
})

test('each plugin state reads as a short label; approve needs a hash', () => {
  const row = { id: 'x', source: 'machine', state: 'approved', reason: null, health: null, hash: 'h' }
  assert.deepEqual(stateLabel(row), { label: 'Approved', attention: false })
  assert.deepEqual(stateLabel({ ...row, health: { state: 'unavailable', reason: 'crashed' } }), {
    label: 'Unavailable',
    attention: true,
  })
  assert.equal(stateLabel({ ...row, state: 'changed' }).label, 'Changed: approve again')
  assert.equal(canApprove({ ...row, state: 'unapproved' }), true)
  assert.equal(canApprove({ ...row, state: 'unapproved', hash: undefined }), false)
  assert.equal(canApprove(row), false)
})

test('the public-repository refusal is read as a warning, not an error', () => {
  const body = JSON.stringify({ error: "This repository is public. Its .avoozl.json would publish this plugin's id." })
  assert.match(publicWarning({ status: 409, body }), /is public/)
  assert.equal(publicWarning({ status: 400, body: JSON.stringify({ error: 'Other.' }) }), null)
})

test('approve sends the exact version and hash shown', async () => {
  const posts = []
  const client = pluginsClient({ post: async (path, body) => (posts.push([path, body]), { result: {} }) })
  await client.approve('ws', { id: 'x', version: '1.0.0', hash: 'abc' })
  assert.deepEqual(posts, [[COMMAND_PATH, { operation: 'plugin.approve', input: { id: 'x', version: '1.0.0', hash: 'abc' }, workspaceId: 'ws' }]])
})

test('a git plugin is approved at the commit shown, and Update re-resolves its ref', async () => {
  const posts = []
  const client = pluginsClient({ post: async (path, body) => (posts.push([path, body]), { result: {} }) })
  await client.approve('ws', { id: 'x', version: '1.0.0', hash: 'abc', commit: 'c'.repeat(40) })
  await client.update('ws', 'x')
  assert.deepEqual(
    posts.map(([, body]) => [body.operation, body.input]),
    [
      ['plugin.approve', { id: 'x', version: '1.0.0', hash: 'abc', commit: 'c'.repeat(40) }],
      ['plugin.update', { id: 'x' }],
    ],
  )
})

test('Add plugin keeps each source typed, prefills from the manifest, and checks what it found', () => {
  const form = { ...emptyPluginForm(), path: '/tmp/p', package: '@example/t', version: '2.0.0', git: '../repo', ref: ' v1 ' }
  // Switching sources keeps the other values.
  assert.deepEqual(previewInput(form), { path: '/tmp/p', scope: 'machine' })
  assert.deepEqual(previewInput({ ...form, where: 'package' }), { package: '@example/t', scope: 'machine' })
  assert.deepEqual(previewInput({ ...form, where: 'git', subdir: 'p' }), { git: '../repo', ref: 'v1', subdir: 'p', scope: 'machine' })
  const filled = applyPreview(form, { id: 'made-up', contract: 1, version: '1.0.0', supported: true })
  assert.deepEqual([filled.id, filled.contract], ['made-up', '1'])
  assert.equal(previewProblem(filled, { id: 'made-up', contract: 1, supported: true }, [1]), null)
  assert.match(previewProblem(filled, { contract: 9, supported: false }, [1]), /contract version 9.*loads 1/)
  assert.match(previewProblem({ ...filled, where: 'package' }, { version: '1.0.0', contract: 1, supported: true }, [1]), /version 1\.0\.0, not 2\.0\.0/)
  assert.match(previewProblem(filled, { error: 'No avoozl-plugin.json in that folder.' }, [1]), /No avoozl-plugin/)
  assert.match(previewProblem(filled, null, [1]), /not looked/)
  // Shared needs a folder written relative to the repository.
  assert.match(sharedBlocked(form), /relative/)
  assert.equal(sharedBlocked({ ...form, path: 'plugins/tracker' }), null)
  assert.equal(sharedBlocked({ ...form, where: 'git' }), null)
})

test('preview is its own read-only call', async () => {
  const posts = []
  const client = pluginsClient({ post: async (path, body) => (posts.push(body), { result: { id: 'x' } }) })
  await client.preview('ws', { path: '/p' })
  assert.deepEqual(posts, [{ operation: 'plugin.preview', input: { path: '/p' }, workspaceId: 'ws' }])
})

test('a bundle plugin lists its parts', async () => {
  const { partTitles } = await import('../src/plugins-api.ts')
  assert.deepEqual(partTitles({ provides: ['rules', 'credentials', 'context'] }), ['Content rules', 'GitHub sign-in', 'Epic context'])
  // A plugin from before `provides` has one part per kind.
  assert.deepEqual(partTitles({ kinds: ['rules'] }), ['Content rules'])
})

test('a card says a code plugin runs on node and lists each kind with its features', async () => {
  const { capabilityLine, runsAs } = await import('../src/plugins-api.ts')
  assert.equal(runsAs(['rules']), 'node')
  assert.equal(runsAs([]), 'nothing: settings only')
  assert.equal(runsAs(undefined), undefined)
  assert.equal(capabilityLine({ rules: [] }), 'rules')
  assert.equal(capabilityLine({ rules: ['x'], credentials: [] }), 'rules, x; credentials')
  assert.equal(capabilityLine({}), undefined)
})

test('an update check shows a badge only when something is newer, and a quiet line otherwise', () => {
  const at = '2026-11-20T12:00:00.000Z',
    now = Date.parse(at) + 3600_000
  assert.equal(updateBadge({ state: 'newer', kind: 'tag', current: 'v1.0.0', latest: 'v1.2.0', checkedAt: at }), 'Update available: v1.2.0 (was v1.0.0)')
  assert.equal(updateBadge({ state: 'newer', kind: 'commit', latest: 'abc1234def', checkedAt: at }), 'Update available: new commit abc1234')
  assert.equal(updateBadge({ state: 'current', checkedAt: at }), null)
  assert.equal(updateBadge({ state: 'failed', reason: 'git ls-remote failed', checkedAt: at }), null)
  assert.equal(updateBadge(null), null)
  assert.match(updateLine({ state: 'failed', reason: 'git ls-remote failed', checkedAt: at }, now), /^Couldn't check for updates .*git ls-remote failed$/)
  assert.match(updateLine({ state: 'newer', kind: 'commit', latest: 'abc', checkedAt: at }, now), /Nothing new runs until you approve/)
  assert.match(updateLine({ state: 'current', checkedAt: at }, now), /^Up to date/)
})

test('Check now and the switch send their operations', async () => {
  const posts = []
  const client = pluginsClient({ post: async (path, body) => (posts.push({ path, body }), { result: {} }) })
  await client.checkUpdates('w', 'fake-rules')
  await client.configureUpdates('w', false)
  assert.deepEqual(
    posts.map((p) => [p.body.operation, p.body.input]),
    [
      ['plugin.updates.check', { id: 'fake-rules' }],
      ['plugin.updates.configure', { enabled: false }],
    ],
  )
})
