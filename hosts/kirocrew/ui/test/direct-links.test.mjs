// Direct links on the page (spec direct-links): a notice's decision link is
// read once and checked, each attempt opens its own chat or says why not,
// and only Kiro Crew's own routes or http(s) are ever an href.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { closedLine, parseDecisionLink, withoutDecisionLink } from '../src/decision-link.ts'
import { attemptAction } from '../src/task-api.ts'
import { linkHref } from '../src/views-api.ts'

test('a decision link is read only with checked parts', () => {
  assert.deepEqual(parseDecisionLink('?workspace=main&decision=AbCdEfGhIjKl'), { workspace: 'main', decision: 'AbCdEfGhIjKl' })
  assert.deepEqual(parseDecisionLink('?decision=AbCdEfGhIjKl'), { workspace: null, decision: 'AbCdEfGhIjKl' })
  for (const search of ['', '?decision=short', '?decision=<script>xx', '?decision=AbCdEfGhIjKl&workspace=Main']) assert.equal(parseDecisionLink(search), null, search)
  assert.equal(withoutDecisionLink('?workspace=main&decision=AbCdEfGhIjKl&plan=p'), '?plan=p')
  assert.equal(withoutDecisionLink('?decision=AbCdEfGhIjKl'), '')
})

test('a closed or unknown link says so, and never names another decision', () => {
  assert.match(closedLine({ state: 'closed', taskId: 'a', newer: true }), /on a is closed\. A newer one may be waiting/)
  assert.match(closedLine({ state: 'closed', taskId: null }), /closed or no longer needs you/)
  assert.match(closedLine({ state: 'unknown' }), /names no decision/)
})

test("each attempt's action opens that session, or says why not", () => {
  const session = { slot: 'avoozl_a1', role: 'worker', attempt: 1, title: null, status: 'working', statusAt: null, boundAt: null }
  assert.deepEqual(attemptAction({ ...session, open: { action: 'chat', label: 'Open worker chat', href: '/chat?crew=devbox&crewSid=avoozl_a1', machine: 'devbox' } }), {
    label: 'Open worker chat',
    href: '/chat?crew=devbox&crewSid=avoozl_a1',
    note: null,
    machine: 'devbox',
  })
  // A destination whose href is not a safe link is dropped, with its note kept.
  assert.equal(attemptAction({ ...session, open: { action: 'chat', label: 'x', href: 'javascript:alert(1)', machine: 'm' } }).href, null)
  // An older backend: the local chat route, as Session had.
  assert.equal(attemptAction(session).href, '/chat?sid=avoozl_a1')
  assert.equal(attemptAction({ ...session, crew: 'devbox' }).href, null)
})

test('only Kiro Crew routes, the desktop chat link and http(s) are hrefs', () => {
  for (const ok of ['/chat?sid=a', '/chat?crew=devbox&crewSid=a', '/apps/avoozl?decision=x', '/settings/instances', 'kirocrew://chat?sid=avoozl_a1', 'https://x.example/'])
    assert.equal(linkHref(ok), ok)
  for (const bad of ['javascript:alert(1)', '//evil.example', '/settings/instances/x', 'kirocrew://settings', '/chat?other=1']) assert.equal(linkHref(bad), undefined, bad)
})

test('In flight and the task drawer use the attempt action, and Needs you keeps a linked item in view', () => {
  const flight = readFileSync(new URL('../src/DashboardView.tsx', import.meta.url), 'utf8')
  assert.match(flight, /Waiting for worker chat/)
  assert.match(flight, /<AttemptLink session=\{row\.session\}/)
  assert.match(flight, /View worker log/)
  const drawer = readFileSync(new URL('../src/TaskDrawer.tsx', import.meta.url), 'utf8')
  assert.match(drawer, /<AttemptLink session=\{session\}/)
  const needs = readFileSync(new URL('../src/ConflictsView.tsx', import.meta.url), 'utf8')
  assert.match(needs, /Your filters hide this item\. It is shown because a link opened it\./)
})
