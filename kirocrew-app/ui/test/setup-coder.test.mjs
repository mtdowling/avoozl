// Set up GitHub shows only when its read-only preview finds a change, and
// its dialog groups writes; Who codes offers what each mode allows.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CODER_CARDS, coderSource, defaultCoder, groupWrites, setupState, writeBadge } from '../src/settings-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const result = (writes, extra = {}) => ({ writes, steps: [], checklist: [], previewHash: 'a'.repeat(64), nothingToChange: !writes.length, applied: false, settings: { changed: false, github: {}, expectedHash: null, diff: '', error: null }, ...extra })
const write = (step, action) => ({ step, action, object: 'label', owner: 'o', name: 'n', visibility: null, detail: '' })

test('the button shows only when the preview finds a change', () => {
  const at = '2026-11-12T00:00:00Z'
  assert.equal(setupState(null, null, at).kind, 'checking')
  assert.deepEqual(setupState(result([]), null, at), { kind: 'set-up', at })
  assert.deepEqual(setupState(result([write('labels', 'create-label')]), null, at), { kind: 'changes', count: 1, at })
  const noScope = result([], { steps: [{ id: 'project', title: 'Project', status: 'failed', reason: 'missing project scope', fix: 'gh auth refresh -s project', notes: [] }] })
  assert.deepEqual(setupState(noScope, null, at), { kind: 'error', reason: 'Project: missing project scope', fix: 'gh auth refresh -s project' })
  assert.equal(setupState(null, 'gh not found', at).kind, 'error')
})

test('writes are grouped with create, change or keep badges', () => {
  const groups = groupWrites([write('labels', 'create-label'), write('fields', 'add-options'), write('issues', 'enable-issues')])
  assert.deepEqual(groups.map((g) => g.title), ['Repository', 'Fields and views', 'Labels'])
  assert.equal(writeBadge({ action: 'create-label' }), 'create')
  assert.equal(writeBadge({ action: 'enable-issues' }), 'create')
  assert.equal(writeBadge({ action: 'add-options' }), 'change')
})

test('Cancel writes nothing before apply and stops mid-apply', () => {
  const wizard = source('SetupWizard.tsx')
  // Before apply, Cancel only closes; the one write call is behind Apply.
  assert.equal((wizard.match(/confirm: true/g) ?? []).length, 1)
  assert.match(wizard, /if \(applying\.current\) \{\s*void client\.cancelSetup/)
  assert.match(wizard, /'Cancelled\. Nothing was written\.'/)
  assert.match(wizard, /<(Modal|Shelf)\b[^\n]*backLabel="Cancel"[^\n]*onDismiss=\{cancel\}/)
  assert.match(wizard, /onClick=\{cancel\}/)
  assert.match(wizard, /Apply \{count\} change/)
})

test('Who codes offers Radar crew and Remote coder; the worker is retired but still named', () => {
  assert.equal(defaultCoder('single-repo'), 'issue-radar')
  assert.equal(defaultCoder('plans-repo'), 'worker')
  assert.equal(defaultCoder(''), 'worker')
  assert.deepEqual(CODER_CARDS.map((c) => [c.coder, c.title]), [
    ['issue-radar', 'Radar crew'],
    ['remote', 'Remote coder'],
  ])
  const only = (coder) => [...CODER_CARDS.find((c) => c.coder === coder).modes]
  assert.deepEqual(only('remote'), ['plans-repo', 'single-repo'])
  assert.equal(coderSource('single-repo', ''), 'Not set on this repository. Using the default for Single repository (Radar crew).')
  assert.equal(coderSource('plans-repo', ''), 'Not set on this repository. Using the default for Plans repository (Avoozl worker, retired).')
  assert.equal(coderSource('plans-repo', 'remote'), 'Set on this repository: Remote coder.')
  assert.doesNotMatch(coderSource('single-repo', ''), /same as above/i)
  const picker = source('CoderPicker.tsx')
  assert.match(picker, /<Walkthrough/)
  assert.match(picker, /coderSource\(props\.mode, props\.value\)/)
  assert.match(source('Walkthrough.tsx'), /prefers-reduced-motion: reduce/)
})

test('the worker is no card, and a repository still on it is named retired', () => {
  assert.equal(CODER_CARDS.some((c) => c.coder === 'worker'), false)
  assert.match(coderSource('plans-repo', 'worker'), /retired/)
})
