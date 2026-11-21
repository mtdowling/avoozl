// Settings › Models picks a harness per role (R98.3) in the one roles table
// (R98.6): the worker has harness, agent and model, and a save sends `roles`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'
import { pick } from './browser/picker-steps.ts'

const state = harnessPage('Settings › Models')
const { skip } = state

for (const width of [390, 1280]) {
  test(`each role picks a harness and the worker's row saves at ${width}px`, { skip }, async () => {
    await state.page.open(state.harness.url({ page: 'models' }), { width, height: 900 })
    await state.page.until(`Boolean(document.querySelector('#avoozl-harness-worker'))`)
    for (const role of ['worker', 'checkDecide']) {
      assert.equal(await state.page.evaluate(`Boolean(document.querySelector('#avoozl-harness-${role}'))`), true, role)
      assert.equal(await state.page.evaluate(`Boolean(document.querySelector('#avoozl-model-${role}'))`), true, role)
      assert.equal(await state.page.evaluate(`Boolean(document.querySelector('#avoozl-agent-${role}'))`), role === 'worker', role)
    }
    assert.equal(await state.page.evaluate(`document.querySelector('#avoozl-agent-worker').placeholder`), 'kirocrew-worker')
    await state.page.evaluate(
      `(() => { const el = document.querySelector('#avoozl-agent-worker'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'alt-worker'); el.dispatchEvent(new Event('input', { bubbles: true })) })()`,
    )
    await state.page.evaluate(`document.querySelector('#avoozl-model-worker').focus()`)
    await state.page.until(`document.querySelector('#avoozl-model-worker').getAttribute('aria-expanded') === 'true'`)
    await state.page.evaluate(pick('avoozl-model-worker', 'fake-reviewer'))
    assert.equal(await state.page.evaluate(`document.querySelector('#avoozl-harness-worker').value`), 'auto (repository default)')
    await state.page.evaluate(`document.querySelector('#avoozl-harness-worker').focus()`)
    await state.page.until(`document.querySelector('#avoozl-harness-worker').getAttribute('aria-expanded') === 'true'`)
    assert.deepEqual(await state.page.evaluate(`[...document.querySelectorAll('#avoozl-harness-worker-list [role="option"]')].map((o) => o.textContent.trim())`), [
      'auto (repository default)',
      'Kiro Crew chat',
      'claude-code',
      'codex (not approved)',
    ])
    await state.page.evaluate(pick('avoozl-harness-worker', 'claude-code'))
    // The reviewer follows its harness.
    await state.page.evaluate(`document.querySelector('#avoozl-harness-reviewer').focus()`)
    await state.page.until(`document.querySelector('#avoozl-harness-reviewer').getAttribute('aria-expanded') === 'true'`)
    await state.page.evaluate(pick('avoozl-harness-reviewer', 'claude-code'))
    await state.page.until(`document.querySelector('[data-save-footer] [data-save]')?.disabled === false`)
    await state.page.evaluate(`document.querySelector('[data-save-footer] [data-save]').click()`)
    await state.page.until(`document.querySelector('[data-models-settings]').textContent.includes('Saved to .avoozl.json.')`)
    const calls = await state.page.evaluate<unknown[]>(`window.__harness.calls.filter((call) => call.operation === 'models.settings.update').map((call) => call.input)`)
    assert.deepEqual(calls.at(-1), {
      roles: {
        checkDecide: { model: 'fake-writer' },
        worker: { agent: 'alt-worker', model: 'fake-reviewer', harness: 'claude-code' },
        reviewer: { harness: 'claude-code' },
      },
      expectedHash: 'models-before',
    })
    assert.equal(await state.page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}
