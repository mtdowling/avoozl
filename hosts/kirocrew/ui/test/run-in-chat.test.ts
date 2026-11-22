// Run in a chat (simplify sim-5.2, §D13): the seed names the skill that does
// the work and the item's IDs, for a spec, a task and a Needs you item. The
// page sends it to the host's chat launcher: a Kiro Crew chat inside Kiro
// Crew, the Start a session dialog (a process session) on the standalone page.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runLaunch, runSeed } from '../src/chat-api.ts'

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a spec is revised with avoozl-spec and reviewed with avoozl-spec-review, by name', () => {
  const revise = runSeed({ kind: 'spec', spec: 'search', review: false })
  assert.match(revise, /^Use the avoozl-spec skill to revise the spec `search`\./)
  assert.match(revise, /on a spec branch for me to approve/)
  const review = runSeed({ kind: 'spec', spec: 'search', review: true })
  assert.match(review, /^Use the avoozl-spec-review skill to review the spec `search`\./)
  const rework = runSeed({
    kind: 'spec',
    spec: 'search',
    review: false,
    instruction: 'Address comment c1 on design.md:12.',
  })
  assert.match(rework, /Address comment c1 on design\.md:12\./)
  assert.match(rework, /Change only the spec/)
  assert.match(review, /edit no file/)
})

test('a task is worked with avoozl-work, by its ID', () => {
  assert.equal(runSeed({ kind: 'task', taskId: 's-1' }), 'Use the avoozl-work skill to work the task `s-1`.')
})

test('a spec-writing chat can require the write-capable Kiro Crew agent', () => {
  const launch = runLaunch({ kind: 'spec', spec: 'search', review: false, agent: 'kirocrew' })
  assert.equal(launch.agent, 'kirocrew')
  assert.equal(launch.autoSend, true)
  assert.match(launch.message, /revise the spec `search`/)
  assert.deepEqual(runLaunch({ kind: 'task', taskId: 's-1' }), {
    message: 'Use the avoozl-work skill to work the task `s-1`.',
    autoSend: true,
  })
})

test('a Needs you item is explained with avoozl, by its kind, reason, task, id and session', () => {
  const seed = runSeed({ kind: 'item', item: { kind: 'needs-human', reason: 'stale-claim', taskId: 's-1', id: 'stale-claim:o/app:avoozl/search/s-1', slot: 'chat-2' } })
  assert.match(
    seed,
    /^Use the avoozl skill to look at the Needs you item with kind `needs-human`, reason `stale-claim`, task `s-1`, id `stale-claim:o\/app:avoozl\/search\/s-1`, session `chat-2`\./,
  )
  assert.match(seed, /Change nothing until I say\./)
  // An item with no task names only what it has.
  assert.match(runSeed({ kind: 'item', item: { kind: 'tick-failed', taskId: null } }), /with kind `tick-failed`\. /)
})

test('each place sends its seed through the chat launcher, sent at once', () => {
  assert.match(source('ui/controls.tsx'), /openChat\(runLaunch\(target\)\)/)
  assert.match(source('PlansView.tsx'), /runInChat\(\{ kind: 'spec', spec: specName\(next\), review: false, agent: 'kirocrew' \}\)/)
  assert.match(source('TaskDrawer.tsx'), /runInChat\(\{ kind: 'task', taskId: task\.id \}\)/)
  assert.match(source('ConflictsView.tsx'), /runInChat\(\{ kind: 'item', item: \{ \.\.\.itemRef\(current\), reason: current\.reason \} \}\)/)
  // On the standalone page the launch opens the Start a session dialog.
  assert.match(source('standalone/host.ts'), /path === '\/chat' \|\| path\.startsWith\('\/chat\?'\)/)
})
