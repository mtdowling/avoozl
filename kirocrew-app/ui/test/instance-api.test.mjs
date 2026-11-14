// The instance name on the page: the header always shows it, every other
// surface only once a second instance exists, and the handoff line reads the
// way the owner wrote it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { handoffLine, instanceClient, nameFor, validName } from '../src/instance-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const one = { id: 'inst-0123456789ab', name: 'Mira', others: [], shared: false }
const two = { ...one, others: ['inst-aaaaaaaaaaaa'], shared: true }

test('one instance is quiet: header only; two show the name elsewhere', () => {
  assert.equal(nameFor(one, 'header'), 'Mira')
  assert.equal(nameFor(one, 'other'), null)
  assert.equal(nameFor(two, 'other'), 'Mira')
  assert.equal(nameFor(null, 'header'), null)
})

test('the handoff line names the instance, and only when it is not quiet', () => {
  assert.equal(handoffLine(two, 'Juno'), 'Mira hands the driver role to Juno.')
  assert.equal(handoffLine(two), 'Mira hands the driver role over.')
  assert.equal(handoffLine(one, 'Juno'), null)
})

test('a name is short, plain, and never an ID', () => {
  assert.ok(validName('Harbor Light'))
  for (const bad of ['', ' ', 'x'.repeat(25), 'a<b', 'inst-0123456789ab']) assert.equal(validName(bad), false, bad)
})

test('the client reads and renames through the command route', async () => {
  const calls = []
  const client = instanceClient({ post: async (path, body) => (calls.push(body.operation), { result: one }) })
  await client.view('w')
  await client.rename('w', 'Juno')
  assert.deepEqual(calls, ['instance.view', 'instance.rename'])
})

test('the header, Settings, Home and the side panel use the shared helper', () => {
  assert.match(source('App.tsx'), /<InstanceBadge workspaceId=\{active\} \/>/)
  assert.match(source('SettingsView.tsx'), /<InstanceRename workspaceId=\{workspaceId\} \/>/)
  assert.match(source('DashboardView.tsx'), /nameFor\(instance, 'other'\)/)
  assert.match(source('Panel.tsx'), /nameFor\(instance, 'other'\)/)
  assert.match(source('Driver.tsx'), /handoffLine\(/)
})
