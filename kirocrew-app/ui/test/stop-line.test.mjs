// Pull the Andon cord (R64, design §4.11): the dialog's checks, the banner's
// words for a pulled stop, and how the Dashboard wires the button.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MAX_REASON, PULL_SCOPES, bannerText, emptyPull, scopeText, toPull } from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a pull needs a one-line reason and a target for its scope', () => {
  assert.equal(toPull(emptyPull()).error, 'Reason is required.')
  assert.equal(toPull({ ...emptyPull(), reason: '  ' }).error, 'Reason is required.')
  assert.match(toPull({ ...emptyPull(), reason: 'a\nb' }).error, /one line/)
  assert.match(toPull({ ...emptyPull(), reason: 'x'.repeat(MAX_REASON + 1) }).error, /200/)
  assert.deepEqual(toPull({ ...emptyPull(), reason: ' bad base ' }).input, { scope: 'all', reason: 'bad base' })
  assert.equal(toPull({ ...emptyPull(), scope: 'repo', reason: 'x' }).error, 'Pick a repository.')
  assert.equal(toPull({ ...emptyPull(), scope: 'spec', reason: 'x' }).error, 'Pick a spec.')
  assert.equal(toPull({ ...emptyPull(), scope: 'task', reason: 'x' }).error, 'Pick a task.')
  assert.deepEqual(toPull({ ...emptyPull(), scope: 'task', taskId: 'a1', spec: 's1', reason: 'x' }).input, {
    scope: 'task',
    taskId: 'a1',
    reason: 'x',
  })
  assert.deepEqual(
    PULL_SCOPES.map((s) => s.value),
    ['all', 'repo', 'spec', 'task'],
  )
})

test('the banner names who pulled it, why, and what it covers', () => {
  const stop = {
    id: 's',
    manual: true,
    by: { kind: 'person', name: 'dashboard' },
    reason: 'bad base',
    scope: 'task',
    taskId: 'a1',
    paused: 2,
  }
  assert.equal(bannerText(stop), 'Line stopped by dashboard: bad base. Scope: task a1 and its dependents. 2 tasks paused.')
  assert.equal(scopeText({ scope: 'all' }), 'everything in this workspace')
  assert.equal(scopeText({ scope: 'repo', projectId: 'r1' }), 'repository r1')
  assert.equal(scopeText({ scope: 'spec', planId: 's1' }), 'spec s1')
})

test('the top row has the red button with a stopped state, and Resume asks first', () => {
  const app = source('App.tsx'),
    dialog = source('StopLine.tsx'),
    banner = source('FlowView.tsx')
  assert.match(app, /<StopLineButton workspaceId=\{active\} \/>/)
  // Stopped: its own words and look while a stop is open; a pull or resume
  // tells the page at once.
  assert.match(dialog, /\{stopped \? 'Line stopped' : 'Stop the line'\}/)
  assert.match(dialog, /style=\{stopped \? STOPPED : FILL\}/)
  assert.match(dialog, /filter\(\(stop\) => !stop\.closedAt\)/)
  assert.match(dialog, /lineChanged\(\)/)
  assert.match(banner, /onChanged\?\.\(\)\n\s*lineChanged\(\)/)
  assert.match(dialog, /<RadioFold/, 'scope is a radio fold-out group')
  assert.match(dialog, /background: 'var\(--danger\)'/)
  assert.match(dialog, /Reason <span className="text-xs text-muted">\(required\)<\/span>/)
  assert.match(dialog, /<Modal\b[\s\S]*?backLabel="Cancel"[\s\S]*?onDismiss=\{close\}/)
  // Resume runs only after the confirm says yes.
  const resume = banner.slice(banner.indexOf('const resume = async'), banner.indexOf('return (', banner.indexOf('const resume = async')))
  assert.ok(resume.indexOf('await confirm(') < resume.indexOf('client.resume('))
  assert.match(resume, /if \(!yes\) return/)
  assert.match(banner, /\{stop\.manual && \(\s*<IconLabel icon=\{Play\} tooltip=\"[^\"]*\" onClick=\{\(\) => void resume\(stop\)\}>\s*Resume/)
  assert.match(banner, /\{!stop\.manual && !stop\.runAnyway && \(/, 'no Run anyway on a pulled stop')
})
