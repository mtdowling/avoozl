// Manual tasks, Links and notes, and From template on the page (R61): the
// field checks match the backend, a blocked save names its decisions, the
// calls name their operations, a manual task is tagged Manual in Needs you
// and on its Delivery card, and the drawers hold the new parts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { authorLabel, blockedDecisions, linkProblem, missingInputs, noteProblem, notesClient, readInputFile } from '../src/notes-api.ts'
import { summarize } from '../src/dashboard-api.ts'
import { deliveryLanes } from '../src/delivery-api.ts'
import { EMPTY_NEW_PLAN, newPlanClient, templateProblems } from '../src/new-plan-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a link and a note are checked as the backend checks them', () => {
  assert.equal(linkProblem('https://docs.example.test/a', 'Doc'), null)
  assert.equal(linkProblem('javascript:x', 'x'), 'Use an http or https link.')
  assert.equal(linkProblem('https://me@docs.example.test/', 'x'), 'Leave the user name and password out of the link.')
  assert.equal(linkProblem('https://docs.example.test/', ''), 'Give the link a label.')
  assert.match(linkProblem('https://docs.example.test/' + 'a'.repeat(2000), 'x'), /2000/)
  assert.equal(noteProblem('  '), 'Write the note.')
  assert.match(noteProblem('n'.repeat(10_001)), /10000/)
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
  const entry = { id: 'note-1', kind: 'note' }
  await client.list('w', 't')
  await client.addLink('w', 't', ' https://a.test ', ' A ')
  await client.addNote('w', 't', 'n')
  await client.edit('w', 't', entry, { text: 'm' })
  await client.remove('w', 't', 'note-1')
  await client.show('w', 't', 'note-1', true)
  await client.allowOnce('w', 'content:abc', 'why')
  await client.markDone('w', 't', { choice: 'skipped', note: 'n' })
  await client.reopen('w', 't')
  await client.templates('w')
  assert.deepEqual(
    sent.map((body) => body.operation),
    [
      'task.notes.list',
      'task.notes.add',
      'task.notes.add',
      'task.notes.edit',
      'task.notes.remove',
      'task.notes.show',
      'content.allow',
      'task.manual.complete',
      'task.manual.reopen',
      'template.list',
    ],
  )
  assert.deepEqual(sent[1].input, { taskId: 't', kind: 'link', url: 'https://a.test', label: 'A' })
  assert.deepEqual(sent[7].input, { taskId: 't', choice: 'skipped', note: 'n' })
})

const TEMPLATE = {
  plugin: 'sdk-templates',
  version: '1.0.0',
  id: 'sdk-rewrite',
  title: 'SDK rewrite',
  description: 'Rewrite one SDK.',
  inputs: [
    { id: 'sdk', label: 'Which SDK', type: 'text', required: true },
    { id: 'repository', label: 'Target repository', type: 'repositories', required: true },
    { id: 'gaps', label: 'Gap list', type: 'file', required: false },
  ],
  phases: [],
  proofKinds: [],
  settings: true,
}

test('From template needs its required inputs, not What you want, and sends the template', async () => {
  assert.deepEqual(missingInputs(TEMPLATE, {}), ['Which SDK', 'Target repository'])
  assert.deepEqual(missingInputs(TEMPLATE, { sdk: 'widgets', repository: ['sdk'] }), [])
  assert.deepEqual(templateProblems({ ...EMPTY_NEW_PLAN, name: 'widgets-rewrite' }, [], []), [])
  assert.deepEqual(templateProblems({ ...EMPTY_NEW_PLAN, name: '' }, [], ['Which SDK']), ['Name the spec.', 'Fill in Which SDK.'])
  const sent = []
  const api = { post: async (_path, body) => (sent.push(body), { result: {} }) }
  await newPlanClient(api).fromTemplate(
    'w',
    { ...EMPTY_NEW_PLAN, name: 'widgets-rewrite', epic: 'sdk-target' },
    { plugin: 'sdk-templates', id: 'sdk-rewrite', version: '1.0.0' },
    { sdk: 'widgets', repository: ['sdk'] },
  )
  assert.equal(sent[0].operation, 'plan.new')
  assert.deepEqual(sent[0].input.template, { plugin: 'sdk-templates', id: 'sdk-rewrite', version: '1.0.0' })
  assert.deepEqual(sent[0].input.inputs, { sdk: 'widgets', repository: ['sdk'] })
  assert.equal(sent[0].input.epic, 'sdk-target')
  assert.equal('handoff' in sent[0].input, false, 'a template seeds the planner chat')
})

test('a file input is read in the page, at most 200 KB', async () => {
  assert.equal(await readInputFile({ size: 10, text: async () => '- gap' }), '- gap')
  await assert.rejects(readInputFile({ size: 200 * 1024 + 1, text: async () => '' }), /larger than 200 KB/)
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

test('the drawer has Links and notes and Mark done; New spec has Blank or From template', () => {
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /<Fold id="notes" group="task-drawer" title="Links and notes">/)
  assert.match(drawer, /task\.manual && \(\s*<ManualTask/)
  const notes = source('TaskNotes.tsx')
  for (const words of ['Add link', 'Add note', 'Show on the issue', 'Allow once', 'Mark done', 'Outcome note', "title: 'Done'", "title: 'Skipped'", 'Reopen'])
    assert.ok(notes.includes(words), words)
  // Notes are untrusted text: shown as typed, never as Markdown.
  assert.doesNotMatch(notes, /<Markdown/)
  assert.match(notes, /<Modal/)
  assert.match(notes, /<RadioFold/)
  const plan = source('NewPlanDrawer.tsx')
  assert.match(plan, /title: 'Blank'/)
  assert.match(plan, /title: 'From template'/)
  assert.match(plan, /<RadioFold/)
  const start = source('TemplateStart.tsx')
  assert.match(start, /Import these settings/)
  assert.match(start, /useState\(false\)|importSettings/)
  assert.match(start, /type="file"/)
})
