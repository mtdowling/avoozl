// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { addInput, applyPreview, canApprove, emptyPluginForm, pluginsClient, previewInput, previewProblem, publicWarning, sharedBlocked, stateLabel } from '../src/plugins-api.ts'

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
  assert.deepEqual(
    addInput({ ...form, where: 'git', git: 'https://git.example.com/p.git', ref: ' v1 ', subdir: 'plugin', config: '' })
      .input.entry,
    { id: 'example-tracker', git: 'https://git.example.com/p.git', ref: 'v1', subdir: 'plugin', contract: 1 },
  )
  assert.deepEqual(addInput({ ...form, where: 'git', git: '../repo', ref: 'main', config: '' }).input.entry, {
    id: 'example-tracker',
    git: '../repo',
    ref: 'main',
    contract: 1,
  })
  assert.match(addInput({ ...form, where: 'git', git: '../repo' }).error, /tag, branch or commit/)
  assert.match(addInput({ ...form, where: 'git', git: '' }).error, /git URL/)
  assert.match(addInput({ ...form, id: 'Bad Id' }).error, /lowercase id/)
  assert.match(addInput({ ...form, id: 'github' }).error, /built-in/)
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
  const body = JSON.stringify({ error: 'This repository is public. Its .avoozl.json would publish this plugin\'s id.' })
  assert.match(publicWarning({ status: 409, body }), /is public/)
  assert.equal(publicWarning({ status: 400, body: JSON.stringify({ error: 'Other.' }) }), null)
})

test('approve sends the exact version and hash shown', async () => {
  const posts = []
  const client = pluginsClient({ post: async (path, body) => (posts.push([path, body]), { result: {} }) })
  await client.approve('ws', { id: 'x', version: '1.0.0', hash: 'abc' })
  assert.deepEqual(posts, [
    [COMMAND_PATH, { operation: 'plugin.approve', input: { id: 'x', version: '1.0.0', hash: 'abc' }, workspaceId: 'ws' }],
  ])
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

test('a bundle plugin lists its parts, and Import waits for approval and acceptance', async () => {
  const { importBlocked, importInput, packCounts, partTitles, shortValue } = await import('../src/plugins-api.ts')
  assert.deepEqual(partTitles({ provides: ['pack', 'rules', 'tracker', 'intake'] }), ['Settings pack', 'Content rules', 'Tracker', 'Intake source'])
  // A plugin from before `provides` has one part per kind.
  assert.deepEqual(partTitles({ kinds: ['route'] }), ['Delivery route'])
  const preview = {
    id: 'sdk-team',
    version: '1.1.0',
    description: null,
    repositories: ['o/sdk'],
    changes: [
      { setting: 'github.repositories.o/sdk.rules', action: 'keep', from: [], to: [] },
      { setting: 'github.repositories.o/sdk.minimumPermission', action: 'change', from: 'write', to: 'triage', warning: 'Lowers who counts' },
      { setting: 'github.project.fields.status', action: 'skip', reason: 'No GitHub Project is set.' },
    ],
    warnings: ['Lowers who counts on o/sdk: write access becomes triage access.'],
    previewHash: 'h',
    imported: null,
  }
  assert.deepEqual(packCounts(preview.changes), { create: 0, change: 1, keep: 1, skip: 1 })
  const row = { id: 'sdk-team', version: '1.1.0', source: 'repository', state: 'changed', reason: null, health: null }
  assert.match(importBlocked(row, preview, true, false), /Approve version 1.1.0 first/)
  const approved = { ...row, state: 'approved' }
  assert.match(importBlocked(approved, preview, false, false), /Accept the who-counts change/)
  assert.equal(importBlocked(approved, preview, true, false), null)
  assert.match(importBlocked({ ...approved, source: 'machine' }, preview, true, false), /Confirm/)
  assert.match(importBlocked(approved, { ...preview, warnings: [], changes: [preview.changes[0]] }, false, false), /Nothing to import/)
  assert.deepEqual(importInput(preview, true, false), { id: 'sdk-team', repositories: ['o/sdk'], previewHash: 'h', acceptLowered: true, confirmPublic: false })
  assert.equal(shortValue('x'.repeat(100)).length, 80)
})
