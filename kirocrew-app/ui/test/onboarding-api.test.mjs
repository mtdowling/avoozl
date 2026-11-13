// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
// The Onboard flow (Onboard.tsx, onboarding-api.ts): which steps a folder
// walks, what each mode needs, the writes Set up makes and which ask first,
// and the flow's invariant: nothing is written before Set up, and nothing
// approves, starts an agent or pushes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ONBOARD_READS,
  ONBOARD_WRITES,
  issueSummary,
  modeProblem,
  onboardClient,
  onboardForm,
  onboardSteps,
  registerInput,
  scanFindings,
  setupRequest,
  setupWrites,
} from '../src/onboarding-api.ts'

const folder = (patch = {}) => ({
  root: '/work/app',
  baseBranch: 'main',
  currentBranch: 'main',
  remote: 'origin',
  github: 'acme/app',
  id: 'app',
  settingsFile: false,
  specs: [],
  registered: null,
  visibility: 'private',
  githubError: null,
  ...patch,
})
const settings = (github = {}) => ({ filename: '.avoozl.json', exists: true, hash: 'h1', github, effective: null, error: null, crews: [], choices: {} })
const preview = (writes = [], changed = true) => ({
  writes,
  previewHash: 'p'.repeat(16),
  nothingToChange: writes.length === 0,
  applied: false,
  steps: [],
  checklist: [],
  settings: { github: { mode: 'single-repo' }, expectedHash: 'h1', changed, diff: '' },
})
const write = (name) => ({ step: 'labels', action: 'create', object: 'label', owner: 'acme/app', name, visibility: null, detail: '' })

test('the steps follow the mode and the repository', () => {
  const local = onboardForm(folder({ github: null, remote: null }), settings())
  assert.equal(local.mode, 'local')
  assert.deepEqual(onboardSteps(local, folder({ github: null })), ['folder', 'mode', 'setup', 'import', 'finish'])
  const single = { ...onboardForm(folder(), settings()), mode: 'single-repo' }
  assert.deepEqual(onboardSteps(single, folder()), ['folder', 'mode', 'check', 'setup', 'import', 'issues', 'finish'])
  assert.deepEqual(onboardSteps(single, folder({ visibility: 'public' })), ['folder', 'mode', 'check', 'setup', 'import', 'scan', 'issues', 'finish'])
  // A public code repository in plans-repo mode: its issues live elsewhere.
  const code = { ...single, mode: 'plans-repo', isPlanning: false, planningRepository: 'acme/plans' }
  assert.ok(!onboardSteps(code, folder({ visibility: 'public' })).includes('scan'))
  // The saved mode is picked first.
  assert.equal(onboardForm(folder(), settings({ mode: 'plans-repo', planningRepository: 'acme/app' })).isPlanning, true)
})

test('each mode says what it still needs: no remote, a non-GitHub remote, a public planning repository', () => {
  const form = onboardForm(folder(), settings())
  assert.equal(modeProblem(form, folder()), null)
  assert.match(modeProblem({ ...form, mode: 'single-repo' }, folder({ github: null, remote: null })), /no GitHub remote/)
  assert.match(modeProblem({ ...form, mode: 'single-repo' }, folder({ github: null })), /origin is not a GitHub remote/)
  assert.equal(modeProblem({ ...form, mode: 'local' }, folder({ github: null, remote: null })), null)
  assert.match(modeProblem({ ...form, mode: 'plans-repo', isPlanning: true }, folder({ visibility: 'public' })), /must be private/)
  assert.match(modeProblem({ ...form, mode: 'plans-repo', isPlanning: false, planningRepository: 'plans' }, folder()), /owner\/name/)
  assert.match(modeProblem({ ...form, id: 'Bad ID' }, folder()), /short ID/)
})

test('Set up lists its writes in order; each GitHub write asks first, and done ones are skipped', () => {
  const form = { ...onboardForm(folder(), settings()), mode: 'single-repo' }
  const steps = setupWrites(form, folder(), settings(), preview([write('avoozl:ready'), write('avoozl:managed')]))
  assert.deepEqual(
    steps.map((s) => [s.key, s.done, Boolean(s.confirm)]),
    [
      ['github', false, true],
      ['settings', false, false],
      ['register', false, true],
    ],
  )
  assert.match(steps[0].confirm.title, /Make 2 changes on GitHub/)
  // A finished GitHub setup and a repository already added.
  const again = setupWrites(form, folder({ registered: { id: 'app', localCheckout: '/work/app', github: 'acme/app', baseBranch: 'main', planning: false } }), settings(), preview([], false))
  assert.ok(again.every((s) => s.done), JSON.stringify(again))
  // Local only: no GitHub write, so nothing asks.
  const local = setupWrites({ ...form, mode: 'local' }, folder(), settings({ mode: 'single-repo' }), null)
  assert.deepEqual(local.map((s) => s.key), ['settings', 'register'])
  assert.ok(local.every((s) => !s.confirm))
})

test('the requests name the right repositories and checkout', () => {
  const form = { ...onboardForm(folder(), settings()), mode: 'single-repo' }
  assert.deepEqual(setupRequest(form, folder(), settings({ repositories: { 'acme/lib': {} } })), { mode: 'single-repo', repositories: ['acme/lib', 'acme/app'] })
  assert.deepEqual(setupRequest({ ...form, mode: 'plans-repo', isPlanning: true }, folder(), settings()), { mode: 'plans-repo', planningRepository: 'acme/app', repositories: [] })
  assert.deepEqual(registerInput(form, folder(), false), { id: 'app', localCheckout: '/work/app', baseBranch: 'main', github: 'acme/app', issueAuthorization: true, planning: false })
  assert.deepEqual(registerInput({ ...form, mode: 'local' }, folder({ specs: ['a'] }), false), { id: 'app', localCheckout: '/work/app', baseBranch: 'main', planning: true })
  assert.equal(registerInput({ ...form, mode: 'local' }, folder({ specs: ['a'] }), true).planning, false)
})

test('scan findings and issue counts read plainly', () => {
  assert.deepEqual(scanFindings({ items: [{ name: 's', missing: false, findings: [{ file: 'design.md', line: 3, set: 'builtin:publish', rule: 'macos-home', message: 'm' }] }] }), [
    { spec: 's', file: 'design.md', line: 3, set: 'builtin:publish', rule: 'macos-home', message: 'm' },
  ])
  const sum = issueSummary({ planId: 'p', simulated: true, writes: [{ kind: 'issue.create' }, { kind: 'issue.create' }, { kind: 'label.add' }] })
  assert.equal(sum.create.length, 2)
  assert.equal(sum.other, 1)
})

test('the client calls only the flow operations, and none approves, starts or pushes', async () => {
  const seen = []
  const client = onboardClient({ post: async (_path, body) => (seen.push(body), { result: {} }) })
  for (const call of Object.values(client)) await call('ws', 'x', {}, 'y')
  const names = new Set(seen.map((body) => body.operation))
  for (const name of names) assert.ok([...ONBOARD_READS, ...ONBOARD_WRITES].includes(name), name)
  for (const name of names) assert.doesNotMatch(name, /approve|run\.|jobs\.|batch\.|task\.start|push|publish|dispatch/)
  // github.setup only writes with confirm, and only from applyGitHub.
  const confirmed = seen.filter((body) => body.input.confirm === true)
  assert.equal(confirmed.length, 1)
  assert.equal(confirmed[0].operation, 'github.setup')
})

test('the dialog calls no write before Set up, and every GitHub write goes through a confirm', () => {
  const source = readFileSync(new URL('../src/Onboard.tsx', import.meta.url), 'utf8')
  const dialog = source.slice(source.indexOf('function OnboardDialog'))
  const beforeSetUp = dialog.slice(0, dialog.indexOf('const setUp ='))
  for (const writeCall of ['applyGitHub', 'saveSettings', 'register(', 'importSpec']) assert.ok(!beforeSetUp.includes(writeCall), `${writeCall} is called before Set up`)
  const setUp = dialog.slice(dialog.indexOf('const setUp ='), dialog.indexOf('const shown ='))
  assert.match(setUp, /if \(write\.confirm && !\(await ask\(write\.confirm\)\)\)/)
  assert.ok(setUp.indexOf('ask(write.confirm)') < setUp.indexOf('client.applyGitHub'))
  assert.match(dialog, /Cancelled\. Nothing was written\./)
  assert.doesNotMatch(source, /'plan\.approve'|approvePlan|'run\.start'|'jobs\.dispatch'/)
})
