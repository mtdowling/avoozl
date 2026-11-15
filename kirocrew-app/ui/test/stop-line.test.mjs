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

test('the left nav has the Stop the line icon with a stopped state, and Resume asks first', () => {
  const app = source('App.tsx'),
    dialog = source('StopLine.tsx'),
    banner = source('FlowView.tsx')
  // In the left nav's line section, an icon only: its words are the tooltip
  // and aria-label, never on screen. Not in the '...' menu.
  assert.match(app, /<StopLineButton nav workspaceId=\{active\} \/>/)
  assert.doesNotMatch(app, /StopLineItem|MoreMenu|PageRefreshItem/)
  assert.doesNotMatch(dialog, /StopLineItem/)
  assert.match(dialog, /const label = stopped \? 'Resume the line' : 'Stop the line'[\s\S]*?aria-label=\{label\}[\s\S]*?<Icon size=\{13\} aria-hidden="true" \/>/)
  // Stopped: its own words and look while a stop is open; a pull or resume
  // tells the page at once.
  assert.match(dialog, /\{stopped \? 'Line stopped' : 'Stop the line'\}/)
  assert.match(dialog, /style=\{\{ \.\.\.\(stopped \? STOPPED : FILL\), padding: '4px 6px' \}\}/)
  assert.match(dialog, /<span className="sr-only">\{stopped \? 'Line stopped' : 'Stop the line'\}<\/span>/)
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
