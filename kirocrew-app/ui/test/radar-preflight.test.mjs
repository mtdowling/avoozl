// rc-2.6: the projection modal shows each preflight item and keeps Create and
// release off while one fails. Create issues (held) is not gated.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { preflightFailures } from '../src/projection-api.ts'

const item = (id, status) => ({ id, label: id, status, detail: '' })

test('only failing items count, and an unverified one does not', () => {
  assert.deepEqual(preflightFailures(null), [])
  assert.deepEqual(preflightFailures({ writes: [] }), [])
  const preview = { preflight: { ok: false, items: [item('spec', 'ok'), item('crew-scope', 'unverified'), item('merge-path', 'fail')] } }
  assert.deepEqual(preflightFailures(preview).map((entry) => entry.id), ['merge-path'])
})

test('the modal lists the items and gates only Create and release', () => {
  const modal = readFileSync(new URL('../src/ProjectionModal.tsx', import.meta.url), 'utf8')
  assert.match(modal, /data-preflight-item=\{item\.status\}/)
  assert.match(modal, /setConfirm\('release'\)\}\s+disabled=\{[^}]*failing\.length > 0\}/)
  assert.doesNotMatch(modal, /setConfirm\('held'\)\}[^>]*failing/)
})
