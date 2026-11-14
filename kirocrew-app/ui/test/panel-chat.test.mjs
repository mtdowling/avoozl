// rc-8.3: the side panel reads its chat from the page URL and picks what to
// show. The URL shapes are the host's, not a documented contract, so these
// tests fail when the shape Avoozl relies on changes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { classifyChat, currentChat, opensItself } from '../src/panel-chat.ts'

const at = (pathname, search = '') => ({ pathname, search })

test('the chat comes from ?sid= or /embed/chat/<slot>', () => {
  assert.equal(currentChat(at('/chat', '?sid=spec-builder-demo')), 'spec-builder-demo')
  assert.equal(currentChat(at('/embed/chat/crew-abc')), 'crew-abc')
  assert.equal(currentChat(at('/embed/chat/a%20b')), 'a b')
  assert.equal(currentChat(at('/apps/avoozl')), '')
})

test('a Spec Builder chat matches by name, with or without the creation suffix', () => {
  const names = ['demo', 'demo-two']
  assert.deepEqual(classifyChat('spec-builder-demo', { specs: names }), { kind: 'spec-builder', spec: 'demo' })
  assert.deepEqual(classifyChat('spec-builder-demo-0a1b2c3d', { specs: names }), { kind: 'spec-builder', spec: 'demo' })
  // The longest name wins: this is demo-two's, not demo's.
  assert.deepEqual(classifyChat('spec-builder-demo-two-0a1b2c3d', { specs: names }), { kind: 'spec-builder', spec: 'demo-two' })
  assert.deepEqual(classifyChat('spec-builder-other', { specs: names }), { kind: 'other' })
})

test('a crew chat is crew-<id>; an Avoozl chat starts with avoozl_', () => {
  assert.deepEqual(classifyChat('crew-abc', { specs: [] }), { kind: 'crew', crew: 'abc' })
  assert.deepEqual(classifyChat('avoozl_planner_1', { specs: [] }), { kind: 'avoozl' })
  assert.deepEqual(classifyChat('', { specs: [] }), { kind: 'other' })
  assert.deepEqual(classifyChat('chat-1', { specs: [] }), { kind: 'other' })
})

test('the panel opens by itself only for an unapproved tasks.md in a Spec Builder chat', () => {
  const chat = { kind: 'spec-builder', spec: 'demo' }
  assert.equal(opensItself(chat, { files: ['tasks.md'], approved: false }), true)
  assert.equal(opensItself(chat, { files: ['tasks.md'], approved: true }), false)
  assert.equal(opensItself(chat, { files: ['design.md'], approved: false }), false)
  assert.equal(opensItself({ kind: 'crew', crew: 'x' }, { files: ['tasks.md'], approved: false }), false)
  assert.equal(opensItself({ kind: 'other' }, { files: ['tasks.md'], approved: false }), false)
})

test('the manifest declares one Avoozl panel tab on a bundle the build writes', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const manifest = JSON.parse(fs.readFileSync(`${root}/app.json`, 'utf8'))
  const tabs = manifest.contributes?.panelTabs
  assert.equal(tabs?.length, 1)
  assert.equal(tabs[0].title, 'Avoozl')
  assert.equal(tabs[0].entry, 'dist/panel.mjs')
  const config = fs.readFileSync(`${root}/ui/vite.config.ts`, 'utf8')
  assert.match(config, /panel\.mjs/)
})
