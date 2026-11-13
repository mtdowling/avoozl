// Ideas on the page (R63): the New idea checks, Make it a spec's fields, the
// calls, and where the buttons sit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EMPTY_IDEA, ideaProblems, ideasClient, ideasOf, specSeed } from '../src/ideas-api.ts'
import { EMPTY_NEW_PLAN, newPlanClient } from '../src/new-plan-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

const idea = (extra = {}) => ({
  source: 'local',
  id: 'idea-1',
  kind: 'idea',
  title: 'Graph Minimap: for big specs!',
  state: 'open',
  author: 'person',
  createdAt: '2026-11-13T10:00:00Z',
  updatedAt: '2026-11-13T10:00:00Z',
  notes: [
    { text: 'Only past 200 nodes.', author: 'person', at: '2026-11-13T10:00:00Z' },
    { text: 'Maybe a toggle.', author: 'session:s', at: '2026-11-13T10:01:00Z' },
  ],
  links: [{ url: 'https://example.com/a', label: 'Prior art' }, { url: 'https://example.com/b' }],
  graduated: null,
  ...extra,
})

test('New idea needs a title and http links, like the backend', () => {
  assert.deepEqual(ideaProblems(EMPTY_IDEA), ['Name the idea.'])
  assert.deepEqual(ideaProblems({ ...EMPTY_IDEA, title: 'x' }), [])
  assert.match(ideaProblems({ ...EMPTY_IDEA, title: 'x', links: 'https://a.test\njavascript:x' })[0], /not an http or https link/)
  assert.match(ideaProblems({ ...EMPTY_IDEA, title: 'x'.repeat(241) })[0], /240/)
})

test('Make it a spec fills New spec from the idea and passes its id', async () => {
  const seed = specSeed(idea())
  assert.equal(seed.name, 'graph-minimap-for-big-specs')
  assert.equal(seed.goal, 'Graph Minimap: for big specs!\n\nOnly past 200 nodes.\n\nMaybe a toggle.')
  assert.equal(seed.context, 'Prior art: https://example.com/a\nhttps://example.com/b')
  assert.equal(seed.idea, 'idea-1')
  const sent = []
  const api = { post: async (_path, body) => (sent.push(body), { result: {} }) }
  await newPlanClient(api).specBuilder('ws', { ...EMPTY_NEW_PLAN, ...seed, repositories: ['app'] }, false)
  assert.equal(sent[0].input.idea, 'idea-1')
  // No idea, no key.
  await newPlanClient(api).request('ws', { ...EMPTY_NEW_PLAN, name: 'p', repositories: ['app'], goal: 'g' })
  assert.equal('idea' in sent[1].input, false)
})

test('the idea calls name their operations', async () => {
  const sent = []
  const api = { post: async (_path, body) => (sent.push(body), { result: {} }) }
  const client = ideasClient(api)
  await client.capture('ws', { title: ' T ', notes: '', links: 'https://a.test\n\n' })
  await client.append('ws', 'idea-1', { note: 'n' })
  await client.archive('ws', 'idea-1')
  await client.restore('ws', 'idea-1')
  assert.deepEqual(
    sent.map((body) => body.operation),
    ['idea.capture', 'idea.append', 'idea.archive', 'idea.restore'],
  )
  assert.deepEqual(sent[0].input, { title: 'T', links: ['https://a.test'] })
  assert.deepEqual(
    ideasOf([idea(), idea({ id: 'b', state: 'archived' })], 'archived').map((entry) => entry.id),
    ['b'],
  )
})

test('New idea sits on Specs and Intake; Riff and Make it a spec on each open idea', () => {
  assert.match(source('PlansView.tsx'), /<NewIdeaButton onClick=\{props\.onNewIdea\} \/>/)
  assert.match(source('UntriagedView.tsx'), /<NewIdeaButton onClick=\{\(\) => setNewIdea\(true\)\}/)
  const ideas = source('Ideas.tsx')
  assert.match(ideas, /chat\.ask\(\{ purpose: 'riff-idea', idea: idea\.id \}\)/)
  assert.match(ideas, /Make it a spec/)
  assert.match(ideas, /Riff on this/)
  assert.match(source('App.tsx'), /seed: specSeed\(idea\)/)
  assert.match(source('NewPlanDrawer.tsx'), /\{ \.\.\.EMPTY_NEW_PLAN, \.\.\.props\.seed \}/)
})
