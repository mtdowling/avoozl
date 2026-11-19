// The Public crews card (task 39.3, R85.8): the badge and line for each
// sign-off state, the call it sends, and where Intake draws it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { publicCrewsClient, signoffBadge, signoffLine } from '../src/untriaged-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const row = (extra = {}) => ({
  repository: 'acme/web',
  visibility: 'public',
  home: null,
  agent: 'avoozl-crew',
  signedOff: null,
  lapsed: false,
  banner: null,
  items: [],
  ready: false,
  ...extra,
})

test('each sign-off state has its own badge and line', () => {
  assert.deepEqual(signoffBadge(row()), { text: 'Not signed off', variant: 'warning' })
  assert.match(signoffLine(row()), /sends no issue/)
  const signed = row({ signedOff: { by: 'mira', at: '2026-11-17T10:04:00.000Z' } })
  assert.deepEqual(signoffBadge(signed), { text: 'Signed off', variant: 'success' })
  assert.equal(signoffLine(signed), 'Signed off by mira on 2026-11-17 10:04 UTC. Changing any item below lapses it.')
  assert.deepEqual(signoffBadge(row({ lapsed: true })), { text: 'Lapsed', variant: 'danger' })
  assert.match(signoffLine(row({ lapsed: true })), /lapsed/)
})

test('sign off and withdraw send publiccrews.signoff', async () => {
  const sent = []
  const api = { post: async (_path, body) => (sent.push(body), { result: {} }) }
  const client = publicCrewsClient(api)
  await client.signOff('w', 'acme/web', '/crew', 'avoozl-crew')
  await client.withdraw('w', 'acme/web')
  assert.deepEqual(sent, [
    { operation: 'publiccrews.signoff', input: { repository: 'acme/web', complete: true, home: '/crew', agent: 'avoozl-crew' }, workspaceId: 'w' },
    { operation: 'publiccrews.signoff', input: { repository: 'acme/web', complete: false }, workspaceId: 'w' },
  ])
})

test('Intake draws the card, and the card says what a crew home does not hide', () => {
  assert.match(source('UntriagedView.tsx'), /<PublicCrews rows=\{list\.publicCrews\}/)
  const card = source('PublicCrews.tsx')
  assert.match(card, /removes injected context only/)
  assert.match(card, /disabled=\{busy \|\| Boolean\(row\.banner\)\}/)
})
