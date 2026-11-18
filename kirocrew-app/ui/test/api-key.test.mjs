// The API key box in Settings > Workspaces (SW4.12): it asks the server for the
// key and for a new one, shows itself only on the standalone page, and puts the
// confirm before Regenerate.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apiKeyClient, KEY_HEADER, REGENERATE_CONFIRM } from '../src/api-key-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the client runs the two key operations and returns the key', async () => {
  const sent = []
  const api = { post: async (path, body) => (sent.push([path, body]), { result: { key: 'k'.repeat(43) } }) }
  const client = apiKeyClient(api)
  assert.equal((await client.view()).key.length, 43)
  assert.equal((await client.regenerate()).key.length, 43)
  assert.deepEqual(
    sent.map(([, body]) => body.operation),
    ['serve.key.view', 'serve.key.regenerate'],
  )
})

test('Regenerate asks first and says the old key stops at once', () => {
  assert.match(REGENERATE_CONFIRM.body, /old key stops working at once/)
  assert.equal(KEY_HEADER, 'X-Api-Key')
})

test('the box is on Settings > Workspaces, only for the standalone host, and never puts the key in an address', () => {
  const box = source('ApiKeySettings.tsx')
  assert.match(box, /host !== 'standalone'\) return null/)
  assert.match(box, /<DangerBtn confirm=\{REGENERATE_CONFIRM\}/)
  assert.doesNotMatch(box, /\?api|searchParams|location/)
  assert.match(source('SettingsView.tsx'), /<ApiKeySettings workspaceId=\{workspaceId\}/)
})
