// Manual tasks and task links on the page: the
// field checks match the backend, a blocked save names its decisions, the
// calls name their operations, a manual task is tagged Manual in Needs you
// and on its Delivery card, and the drawers hold the new parts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { authorLabel, blockedDecisions, linkProblem, notesClient } from '../src/notes-api.ts'
import { summarize } from '../src/dashboard-api.ts'
import { deliveryLanes } from '../src/delivery-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a link is checked as the backend checks it', () => {
  assert.equal(linkProblem('https://docs.example.test/a', 'Doc'), null)
  assert.equal(linkProblem('javascript:x', 'x'), 'Use an http or https link.')
  assert.equal(linkProblem('https://me@docs.example.test/', 'x'), 'Leave the user name and password out of the link.')
  assert.equal(linkProblem('https://docs.example.test/', ''), 'Give the link a label.')
  assert.match(linkProblem('https://docs.example.test/' + 'a'.repeat(2000), 'x'), /2000/)
  assert.equal(authorLabel({ author: 'person', login: 'alice' }), 'alice (person)')
  assert.equal(authorLabel({ author: 'session:chat-1' }), 'Session chat-1')
})

test('a blocked save names the decisions Allow once takes', () => {
  assert.deepEqual(blockedDecisions({ body: JSON.stringify({ error: 'Content rules refused this', decisions: ['content:abc'] }) }), ['content:abc'])
  assert.deepEqual(blockedDecisions({ body: JSON.stringify({ error: 'Other' }) }), [])
  assert.deepEqual(blockedDecisions(new Error('plain')), [])
})

test('each call names its operation', async () => {
  const sent = []
  const api = { post: async (_path, body) => (sent.push(body), { result: { entries: [], templates: [] } }) }
  const client = notesClient(api)
  const entry = { id: 'note-1', kind: 'link' }
  await client.list('w', 't')
  await client.addLink('w', 't', ' https://a.test ', ' A ')
  await client.edit('w', 't', entry, { url: 'https://b.test', label: 'B' })
  await client.remove('w', 't', 'note-1')
  await client.allowOnce('w', 'content:abc', 'why')
  await client.markDone('w', 't', { choice: 'skipped' })
  await client.reopen('w', 't')
  assert.deepEqual(
    sent.map((body) => body.operation),
    ['task.notes.list', 'task.notes.add', 'task.notes.edit', 'task.notes.remove', 'content.allow', 'task.manual.complete', 'task.manual.reopen'],
  )
  assert.deepEqual(sent[1].input, { taskId: 't', kind: 'link', url: 'https://a.test', label: 'A' })
  assert.deepEqual(sent[5].input, { taskId: 't', choice: 'skipped' })
  assert.equal('addNote' in client, false)
})

const graphTask = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  epic: null,
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: 'code',
  status: 'planned',
  complete: false,
  ready: false,
  decision: null,
  issue: null,
  ...extra,
})

test('a manual task waiting for a person is tagged Manual in Needs you and on its card', () => {
  const graph = {
    revision: 1,
    epics: [],
    statuses: [],
    repositories: [],
    total: 2,
    edges: [],
    tasks: [
      graphTask('review', { manual: true, state: 'needs-you', needsYou: { reason: 'Waiting for a person: Review with team', manual: true } }),
      graphTask('cutover', { state: 'waiting' }),
    ],
  }
  const summary = summarize({ graph, delivery: [], conflicts: [], plans: null })
  const manual = summary.attention.find((item) => item.kind === 'manual')
  assert.deepEqual(manual && { taskId: manual.taskId, detail: manual.detail }, { taskId: 'review', detail: 'Waiting for a person: Review with team' })
  const lanes = deliveryLanes(graph, [])
  assert.deepEqual(
    lanes['needs-you'].map((card) => [card.id, card.manual]),
    [['review', true]],
  )
  assert.equal(lanes.waiting.find((card) => card.id === 'cutover').manual, false)
  assert.match(source('DashboardView.tsx'), /manual: 'Manual'/)
})

test('the drawer has Links and Mark done, and no notes; New spec has Blank or From a goal', () => {
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /<SectionBox id="task-links" title="Links">/)
  assert.doesNotMatch(drawer, /Links and notes|id="notes"/)
  assert.match(drawer, /task\.manual && \(\s*<ManualTask/)
  const notes = source('TaskNotes.tsx')
  for (const words of ['Add link', 'Show on the issue', 'Allow once', 'Mark done', "title: 'Done'", "title: 'Skipped'", 'Reopen']) assert.ok(notes.includes(words), words)
  // Tasks keep no notes: no note field, in the drawer or in Mark done.
  for (const gone of ['Add note', 'Outcome note', 'textarea', "kind === 'note'"]) assert.ok(!notes.includes(gone), gone)
  assert.doesNotMatch(notes, /<Markdown/)
  assert.match(notes, /<Modal/)
  assert.match(notes, /<RadioFold/)
  const plan = source('NewPlanDrawer.tsx')
  assert.match(plan, /title: 'Blank'/)
  assert.match(plan, /title: 'From a goal'/)
  assert.doesNotMatch(plan, /From template/)
  assert.match(plan, /<RadioFold/)
})
