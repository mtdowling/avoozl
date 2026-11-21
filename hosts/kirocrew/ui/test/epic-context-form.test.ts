// Settings › Epic context's form for this machine's own context: the pure
// draft helpers under node, then the page in Chrome (?page=app&epiccontext=1):
// the empty state, a mistake shown next to its field, a backend refusal shown
// next to its field, and a save sent through context.machine.set. The Chrome
// tests are skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'
import { draftOf, draftProblems, emptyTool, fieldOfError, machineOf } from '../src/context-api.ts'

const block = {
  repos: ['acme/*'],
  reads: ['~/notes/acme-widgets'],
  mcp: { research: { about: 'Answers', command: ['research-mcp', '--stdio'], env: ['RESEARCH_TOKEN'] } },
  contentSets: ['acme-terms'],
}

test('a block round-trips through the draft, and empty lists are left out', () => {
  assert.deepEqual(machineOf(draftOf(block)), block)
  assert.deepEqual(machineOf({ ...draftOf(null), repos: ['acme/widgets'] }), { repos: ['acme/widgets'] })
  const draft = draftOf(block)
  draft.tools[0].command = ['research-mcp', ' ', '--stdio']
  draft.tools[0].env = []
  assert.deepEqual(machineOf(draft).mcp, { research: { about: 'Answers', command: ['research-mcp', '--stdio'] } })
})

test('each mistake is named on its own field', () => {
  assert.deepEqual(draftProblems(draftOf(block)), {})
  const draft = { ...draftOf(null), reads: ['notes'], tools: [emptyTool(), { ...emptyTool(), alias: 'docs', about: 'Docs', command: ['docs-mcp'], env: ['1BAD'] }] }
  const problems = draftProblems(draft)
  assert.deepEqual(Object.keys(problems).sort(), ['reads', 'repos', 'tool.0', 'tool.1'])
  assert.match(problems.repos, /at least one repo/)
  assert.match(problems.reads, /notes: Start the path with \/ or ~\//)
  assert.match(problems['tool.0'], /lowercase letters/)
  assert.match(problems['tool.1'], /variable name/)
  const twice = { ...draftOf(block), tools: [...draftOf(block).tools, ...draftOf(block).tools] }
  assert.match(draftProblems(twice)['tool.1'], /already named research/)
})

test('a backend refusal maps to the field it names', () => {
  const draft = draftOf(block)
  assert.equal(fieldOfError('epicContext.reads.0 ~/x is not a folder on this machine.', draft), 'reads')
  assert.equal(fieldOfError('epicContext.repos must list 1 to 50 repositories', draft), 'repos')
  assert.equal(fieldOfError('epicContext.mcp.research.command holds what looks like a credential.', draft), 'tool.0')
  assert.equal(fieldOfError('epicContext.mcp alias Bad is not a name.', draft), 'tool.0')
  assert.equal(fieldOfError('Only a person changes this machine’s epic context.', draft), null)
})

const state = harnessPage('epic context form')
const { skip } = state

const wait = (ms: number) => state.page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const has = (selector: string) => state.page.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const text = (selector: string) => state.page.evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`)
const click = (selector: string) => state.page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (b) b.click(); return Boolean(b) })()`)
const type = async (selector: string, value: string) => {
  await state.page.evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
  )
  await wait(50)
}
const writes = () => state.page.evaluate('window.__contextWrites')

async function openContext(extra = {}) {
  await state.page.open(state.harness.url({ page: 'app', roles: 'single', ghfull: '1', epiccontext: '1', ...extra }), { width: 1280, height: 900 })
  await state.page.until(`Boolean(document.querySelector('[data-left-nav]'))`)
  await wait(200)
  await state.page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`,
  )
  await wait(200)
  await state.page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-item]')].filter((x) => x.textContent.trim() === 'Epic context').at(-1); b.click(); return true })()`,
  )
  await state.page.until(`Boolean(document.querySelector('[data-context-machine]'))`)
  await wait(200)
}

test('with no context set, the card says so and Add context opens the form', { skip }, async () => {
  await openContext({ epicmachine: 'none' })
  assert.match(await text('[data-context-empty]'), /None set\. Workers get only the task and the repo\./)
  assert.doesNotMatch(await text('[data-context-machine]'), /epicContext|config\.json/, 'no config key names')
  assert.equal(await has('textarea'), false, 'no raw JSON editor')
  assert.ok(await click('[data-context-add]'))
  await wait(100)
  assert.equal(await has('[data-context-empty]'), false)
  assert.ok(await has('[data-chip-input="ctx-repos"]'))
})

test('Save checks the form first and shows each mistake next to its field', { skip }, async () => {
  await openContext({ epicmachine: 'none' })
  await click('[data-context-add]')
  await wait(100)
  await type('[data-chip-input="ctx-repos"]', 'not a repo')
  await click('[data-chip-add="ctx-repos"]')
  await wait(50)
  assert.match(await text('[data-field-row="ctx-repos"]'), /Write owner\/name/)
  await click('[data-context-add-tool]')
  await wait(50)
  await click('[data-save-footer] [data-save]')
  await wait(100)
  assert.match(await text('[data-field-error="repos"]'), /at least one repo/)
  assert.match(await text('[data-field-error="tool.0"]'), /lowercase letters/)
  assert.deepEqual(await writes(), [], 'nothing is sent')
})

test('a folder the backend cannot find is shown under Folders, and a good form saves', { skip }, async () => {
  await openContext({ epicmachine: 'none' })
  await click('[data-context-add]')
  await wait(100)
  await type('[data-chip-input="ctx-repos"]', 'acme/widgets')
  await click('[data-chip-add="ctx-repos"]')
  await type('#ctx-folder', '~/missing-notes')
  await click('[data-context-add-folder]')
  await wait(50)
  await click('[data-save-footer] [data-save]')
  await wait(200)
  assert.match(await text('[data-field-error="reads"]'), /is not a folder on this machine/)
  await click('[data-context-chips="reads"] button')
  await type('#ctx-folder', '~/notes/acme-widgets')
  await click('[data-context-add-folder]')
  await click('[data-context-add-tool]')
  await wait(50)
  await type('#ctx-tool-0-alias', 'research')
  await type('#ctx-tool-0-about', 'Answers questions')
  await type('#ctx-tool-0-arg-0', 'research-mcp')
  await click('[data-tool-add-arg]')
  await wait(50)
  await type('#ctx-tool-0-arg-1', '--stdio')
  await type('[data-chip-input="ctx-tool-0-env"]', 'RESEARCH_TOKEN')
  await click('[data-chip-add="ctx-tool-0-env"]')
  await state.page.evaluate(`document.querySelector('[data-context-set="team-words"]').click()`)
  await wait(50)
  await click('[data-save-footer] [data-save]')
  await wait(300)
  assert.deepEqual(await writes(), [
    {
      repos: ['acme/widgets'],
      reads: ['~/notes/acme-widgets'],
      mcp: { research: { about: 'Answers questions', command: ['research-mcp', '--stdio'], env: ['RESEARCH_TOKEN'] } },
      contentSets: ['team-words'],
    },
  ])
  assert.equal(await has('[data-context-empty]'), false, 'the saved context shows')
  assert.match(await text('[data-context-chips="repos"]'), /acme\/widgets/)
})
