// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { openSpecBuilder, SPEC_BUILDER_PAGE, SPEC_BUILDER_SPECS, specBuilderClient, specBuilderProblem } from '../src/spec-builder-api.ts'

test('create posts to Spec Builder and to nothing else', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push({ path, body }), { name: 'p', spec_dir: '/r/.kiro/specs/p' }) }
  const body = { name: 'p', working_dir: '/r', spec_type: 'feature', description: 'd' }
  assert.deepEqual(await specBuilderClient(api).create(body), { name: 'p', spec_dir: '/r/.kiro/specs/p' })
  assert.deepEqual(calls, [{ path: SPEC_BUILDER_SPECS, body }])
})

test('each refusal says what to do, and which ones offer the planner chat', () => {
  const off = specBuilderProblem({ status: 403, body: JSON.stringify({ code: 'app_disabled', error: 'spec-builder is disabled' }) })
  assert.match(off.message, /turned off.*Apps/)
  assert.equal(off.fallback, true)
  const grant = specBuilderProblem(new Error('[app-sdk] App "avoozl" not permitted to access /api/apps/spec-builder/specs.'))
  assert.match(grant.message, /Apps › Updates/)
  assert.equal(grant.fallback, true)
  assert.equal(specBuilderProblem({ status: 404, body: '' }).fallback, true)
  const taken = specBuilderProblem({ status: 409, body: JSON.stringify({ code: 'spec_exists', error: "a spec named 'p' already exists" }) })
  assert.match(taken.message, /Pick another name/)
  assert.equal(taken.fallback, false)
})

test('opening Spec Builder names the spec it should show', () => {
  const stored = new Map()
  globalThis.window = { localStorage: { setItem: (key, value) => stored.set(key, value) } }
  const went = []
  openSpecBuilder('p', (path) => went.push(path))
  assert.equal(stored.get('spec-builder:last-open'), 'p')
  assert.deepEqual(went, [SPEC_BUILDER_PAGE])
  delete globalThis.window
})

test('the drawer asks before it writes the steering file, and offers the planner chat when Spec Builder is out of reach', async () => {
  const { readFileSync } = await import('node:fs')
  const drawer = readFileSync(new URL('../src/NewPlanDrawer.tsx', import.meta.url), 'utf8')
  // Only a missing file, or one equal to an older Avoozl text, is asked
  // about; the question shows the file's text.
  assert.match(drawer, /if \(preview\.steering\.state === 'missing' \|\| preview\.steering\.state === 'older'\) setSteering\(preview\.steering\)\s*else await handOffNow\(false\)/)
  assert.match(drawer, /data-steering-text>\s*\{steering\.text\}/)
  // Only the Add button writes it.
  assert.equal(drawer.match(/handOff\(true\)/g).length, 1)
  assert.match(drawer, /onClick=\{\(\) => void handOff\(true\)\}>\s*Add the file and open Spec Builder/)
  assert.match(drawer, /setFallback\(problem\.fallback\)/)
  assert.match(drawer, /\{fallback && \([\s\S]*plannerChat\(\)[\s\S]*Use an Avoozl planner chat instead/)
  assert.match(drawer, /openSpecBuilder\(handoff\.name, navigate\)/)
})
