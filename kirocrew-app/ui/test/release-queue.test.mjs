// rc-4.4: the release mode setting round-trips, the queue helpers group what
// the backend sends, and the page wires the Step click to the person-only
// operation. Inputs checked: a repository with and without a release block,
// scopes passed through unchanged, N blank and N=0, each mode, a repository
// with no Step to offer, and a plan whose phases are all released.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { emptyRepository, toForm, toPolicy } from '../src/settings-api.ts'
import { MODE_TEXT, RELEASE_MODES, branchLine, capacityText, heldReasons, nextSteps, releaseClient } from '../src/release-api.ts'
import { normalizeGitHubPolicy } from '../../../src/app/github-policy.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const github = (release) => ({
  mode: 'single-repo',
  repositories: { 'example/app': { baseBranch: 'main', coder: 'issue-radar', ...(release ? { release } : {}) } },
})

test('release mode and capacity round-trip, and scopes pass through', () => {
  const release = { mode: 'step', capacity: 3, scopes: [{ label: 'docs-ready', capacity: 1 }] }
  const form = toForm(github(release))
  assert.equal(form.repositories[0].releaseMode, 'step')
  assert.equal(form.repositories[0].releaseCapacity, '3')
  assert.deepEqual(toPolicy(form).repositories['example/app'].release, release)
  form.repositories[0].releaseMode = 'hold'
  form.repositories[0].releaseCapacity = '0'
  assert.deepEqual(toPolicy(form).repositories['example/app'].release, { ...release, mode: 'hold', capacity: 0 })
  // The backend accepts what the page writes.
  normalizeGitHubPolicy(toPolicy(form))
})

test('a repository with no release block writes none, and a blank one clears it', () => {
  const form = toForm(github(null))
  assert.equal('release' in toPolicy(form).repositories['example/app'], false)
  assert.equal('release' in toPolicy({ ...form, repositories: [{ ...emptyRepository('example/new') }] }).repositories['example/new'], false)
  const set = toForm(github({ mode: 'hold' }))
  set.repositories[0].releaseMode = ''
  assert.equal('release' in toPolicy(set).repositories['example/app'], false)
})

test('the three modes are the page and the backend list', () => {
  assert.deepEqual([...RELEASE_MODES], ['automatic', 'step', 'hold'])
  for (const mode of RELEASE_MODES) normalizeGitHubPolicy(github({ mode }))
  assert.throws(() => normalizeGitHubPolicy(github({ mode: 'later' })), /release\.mode/)
  assert.deepEqual(Object.keys(MODE_TEXT), [...RELEASE_MODES])
})

const repo = (extra = {}) => ({
  repository: 'example/app',
  ready: 'ready',
  mode: 'step',
  capacity: 2,
  scopes: [],
  rows: [
    { taskId: 't1', state: 'held', reason: 'Step: waiting for a click to release phase P1.' },
    { taskId: 't2', state: 'held', reason: 'Step: waiting for a click to release phase P1.' },
    { taskId: 't3', state: 'held', reason: 'Waiting on t1.' },
    { taskId: 't4', state: 'released', reason: 'Ready label is on.' },
  ],
  steps: [
    { planId: 'a', phase: 'p1', title: 'P1', released: false },
    { planId: 'a', phase: 'p2', title: 'P2', released: false },
    { planId: 'b', phase: '', title: 'No phase', released: false },
    { planId: 'c', phase: 'p1', title: 'P1', released: true },
  ],
  ...extra,
})

test('the queue offers one click per plan and says each held reason once', () => {
  assert.deepEqual(nextSteps(repo()).map((s) => [s.planId, s.phase]), [['a', 'p1'], ['b', '']])
  assert.deepEqual(nextSteps(repo({ steps: [{ planId: 'c', phase: 'p1', title: 'P1', released: true }] })), [])
  assert.deepEqual(heldReasons(repo()), [
    { reason: 'Step: waiting for a click to release phase P1.', count: 2 },
    { reason: 'Waiting on t1.', count: 1 },
  ])
  assert.equal(capacityText(2), '2 at a time')
  assert.equal(capacityText(0), 'nothing released')
  assert.equal(capacityText(Infinity), 'no limit')
})

test('the client reads the queue and clicks Step through the command path', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push([path, body]), { result: { ok: true } }) }
  const client = releaseClient(api)
  await client.queue('w')
  await client.step('w', 'plan-a')
  assert.deepEqual(calls.map(([path, body]) => [path, body.operation, body.input]), [
    [COMMAND_PATH, 'radar.releasequeue', {}],
    [COMMAND_PATH, 'radar.releasestep', { planId: 'plan-a' }],
  ])
})

test('the Dashboard shows the queue, Settings shows the mode only for Issue Radar, Step has one button per plan', () => {
  assert.match(source('DashboardView.tsx'), /<ReleaseQueue workspaceId=\{workspaceId\} onOpenSettings=/)
  const settings = source('SettingsView.tsx')
  assert.match(settings, /\(repository\.coder \|\| defaultCoder\(props\.mode\)\) === 'issue-radar' && \(/)
  assert.match(settings, /<ReleaseModePicker/)
  const queue = source('ReleaseQueue.tsx')
  assert.match(queue, /data-release-step/)
  assert.match(queue, /repository\.mode === 'step' \? nextSteps\(repository\) : \[\]/)
  assert.match(queue, /onClick=\{\(\) => onStep\(step\.planId\)\}/)
  // Rows wrap: columns on a wide page, stacked on a narrow one.
  assert.match(queue, /flexDirection: 'row'[^}]*flexWrap: 'wrap'/)
})

test('the Dashboard lists armed pull requests under a stop, with a Disarm that calls the person-only operation', async () => {
  const calls = []
  const client = releaseClient({ post: async (path, body) => (calls.push([body.operation, body.input]), { result: { pullRequests: [] } }) })
  await client.armed('w')
  await client.disarm('w', 'example/app', 7)
  assert.deepEqual(calls, [['radar.armed', {}], ['radar.disarm', { repository: 'example/app', pullRequest: 7 }]])
  assert.match(source('DashboardView.tsx'), /<ArmedPulls workspaceId=\{workspaceId\} stopped=/)
  const armed = source('ArmedPulls.tsx')
  assert.match(armed, /if \(!props\.stopped \|\| !props\.workspaceId \|\| !pulls\.length\) return null/)
  assert.match(armed, /Disarm/)
})

test('integration branches: one line per branch, a read client, and a person-only Land on the Needs you row', async () => {
  const calls = []
  const client = releaseClient({ post: async (path, body) => (calls.push([body.operation, body.input]), { result: { branches: [] } }) })
  await client.branches('w')
  await client.land('w', 'example/app', 'rewrite/x', 'a'.repeat(40))
  assert.deepEqual(calls, [['integration.view', {}], ['integration.land', { repository: 'example/app', branch: 'rewrite/x', head: 'a'.repeat(40) }]])
  const row = { branch: 'rewrite/x', base: 'main', behind: 2, checks: 'green', tasksMerged: 3, tasksTotal: 5, accepted: true }
  assert.equal(branchLine(row), '3 of 5 tasks merged · 2 behind main · head checks green · accepted')
  assert.equal(branchLine({ ...row, behind: 0, checks: null, accepted: false }), '3 of 5 tasks merged · level with main · head not read yet')
  assert.match(source('DashboardView.tsx'), /<IntegrationBranches workspaceId=\{workspaceId\} \/>/)
  assert.match(source('ConflictsView.tsx'), /item\.kind === 'branch-landing' && item\.repository/)
  assert.match(source('ConflictsView.tsx'), /action: 'Approve landing'/)
})
