// plugin-credentials pc-4.3 and the confirm of pc-2.1, from fixtures.
// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { highRisk, loginRows, permissionsLine, signInLine } from '../src/settings-api.ts'
import { PLUGIN_PARTS, pluginsClient, signInClaims, signInClashes } from '../src/plugins-api.ts'
import { viewsClient } from '../src/views-api.ts'

const NOW = Date.parse('2026-11-19T12:00:00Z')
const acme = {
  host: 'github.com',
  provider: 'acme-github',
  owners: ['acme', 'acme-labs'],
  state: 'approved',
  login: 'acme-bot[bot]',
  person: 'acme-dev',
  granted: 'per-job',
  broader: [],
  expiresAt: new Date(NOW + 41 * 60000).toISOString(),
}
const gh = { ...acme, provider: 'gh', owners: 'other', login: 'mtdowling', person: 'mtdowling', granted: 'all', expiresAt: null }

test('Settings › GitHub shows one sign-in line per provider in use', () => {
  assert.equal(signInLine(acme, NOW), 'github.com · acme, acme-labs: signed in through acme-github as acme-bot[bot] (per-job permissions) · token good for 41 min')
  assert.equal(signInLine(gh, NOW), 'github.com · everything else: signed in with gh as mtdowling (full access) · no expiry')
  assert.match(signInLine({ ...acme, broader: ['land'] }, NOW), /broader than asked: land$/)
  assert.match(signInLine({ ...gh, provider: 'env', owners: 'all' }, NOW), /every owner: signed in with env as mtdowling \(full access\)/)
})

test('the calls table has a row per token login', () => {
  assert.deepEqual(
    loginRows({
      resources: {},
      limitedUntil: null,
      limitedResource: null,
      calls: 0,
      notModified: 0,
      notModifiedShare: null,
      byLogin: { mtdowling: { calls: 3, notModified: 1, cached: 0 }, 'acme-bot[bot]': { calls: 9, notModified: 0, cached: 2 } },
    }).map((row) => [row.source, row.calls]),
    [
      ['acme-bot[bot]', 9],
      ['mtdowling', 3],
    ],
  )
})

test('Plugins, the approval view and Add plugin say who the plugin signs Avoozl in as', () => {
  assert.equal(PLUGIN_PARTS.credentials.title, 'GitHub sign-in')
  assert.deepEqual(signInClaims({ id: 'acme-github', credentials: { hosts: ['github.com'], owners: ['acme', 'acme-labs'] } }), [
    'acme-github will sign Avoozl in to github.com for acme, acme-labs. Every GitHub call Avoozl makes there for them will use its tokens.',
  ])
  const row = (id, owners) => ({ id, source: 'machine', state: 'approved', reason: null, health: null, approval: {}, credentials: { hosts: ['github.com'], owners } })
  assert.deepEqual(signInClashes([row('a', ['acme']), row('b', ['ACME']), row('c', ['octo'])]), [{ host: 'github.com', plugins: ['a', 'b'] }])
  assert.deepEqual(signInClashes([row('a', ['acme']), row('c', ['octo'])]), [])
})

test('Use this one picks through plugin.credentials.pick', async () => {
  const sent = []
  const api = { post: async (path, body) => (sent.push([path, body]), { result: { host: 'github.com', id: 'a' } }) }
  await pluginsClient(api).pick('w1', 'github.com', 'a')
  assert.deepEqual(sent, [[COMMAND_PATH, { operation: 'plugin.credentials.pick', input: { host: 'github.com', id: 'a' }, workspaceId: 'w1' }]])
})

// A fixture preview of a high-risk write: the confirm names the repository,
// the action and each permission, then allows it before the write.
const step = {
  job: 'landing-setup',
  target: 'acme/api',
  action: 'Add the avoozl-required-check ruleset',
  risk: 'high',
  permissionsText: 'administration: write, metadata: read, statuses: write, variables: write',
  permissionsHash: 'h'.repeat(64),
}

test('the confirm lists the repository, the action and the exact permissions, and Allow comes first', async () => {
  assert.equal(permissionsLine(step), 'landing-setup asks GitHub for administration: write, metadata: read, statuses: write, variables: write on acme/api')
  assert.deepEqual(highRisk([step, { ...step, risk: 'low' }]), [step])
  const sent = []
  const api = {
    post: async (_path, body) => {
      sent.push(body.operation)
      return { result: body.operation === 'github.job.confirm' ? { grants: ['g1'] } : {} }
    },
  }
  await viewsClient(api).needsYouAction('w1', { label: 'Delete branches', operation: 'spec.grants.branches.delete', input: { repository: 'acme/api' }, confirm: [step] })
  assert.deepEqual(sent, ['github.job.confirm', 'spec.grants.branches.delete'])
})
