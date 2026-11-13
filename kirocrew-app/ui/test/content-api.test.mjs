// Settings > Content rules (design §4.9): each set's source and scope in
// plain words, and the Conflicts view's content items.
import assert from 'node:assert/strict'
import test from 'node:test'
import { scopeLabel, SET_FIELDS, sourceLabel } from '../src/content-api.ts'
import { itemKey, noActionReason, settleActionOf } from '../src/conflicts-api.ts'

test('a set says where its rules come from and what it covers, never a rule', () => {
  const set = { id: 'company', action: 'block', boundaries: null, repositories: null, plugin: null, source: 'file', available: true }
  assert.equal(sourceLabel({ ...set, termsFrom: 'workspace' }), 'Terms file in .avoozl/local/content-rules')
  assert.equal(sourceLabel({ ...set, termsFrom: 'machine' }), 'Terms file named in this machine’s settings')
  assert.equal(sourceLabel({ ...set, source: 'plugin', plugin: 'rules-x', version: '2' }), 'Rules plugin rules-x, version 2')
  assert.equal(scopeLabel(set), 'Every boundary but incoming items')
  assert.equal(scopeLabel({ ...set, boundaries: ['github', 'diff'], repositories: ['example/app'] }), 'GitHub text, Worker diffs in example/app')
  assert.deepEqual(SET_FIELDS.filter((f) => f.required).map((f) => f.key), ['id'])
})

test('content items have their own actions, not a settle', () => {
  const match = { kind: 'content-match', taskId: null, id: 'content:1', title: 't', detail: 'd' }
  assert.equal(settleActionOf(match), null)
  assert.equal(noActionReason(match), null)
  assert.match(noActionReason({ ...match, kind: 'content-unavailable' }), /terms file or plugin/)
  assert.equal(itemKey(match), 'content-match::::content:1')
})

import {
  allowCount,
  BUILTIN_INFO,
  builtinName,
  builtinUsed,
  contentClient,
  emptySetForm,
  entryOf,
  fileErrors,
  highlightPieces,
  kindOf,
  parseTermLines,
  rowError,
  ruleCount,
  ruleNames,
  serializeTerms,
  setEntry,
  tryMatches,
} from '../src/content-api.ts'

test('built-in sets have plain names; the plans repo set is not used outside plans-repo mode', () => {
  assert.deepEqual(
    ['builtin:planning-repository', 'builtin:reply-safety', 'builtin:published-secrets'].map(builtinName),
    ['Plans repo name', 'Safe replies', 'Secrets'],
  )
  assert.equal(builtinName('builtin:new'), 'builtin:new')
  assert.equal(builtinUsed('builtin:planning-repository', 'plans-repo'), true)
  assert.equal(builtinUsed('builtin:planning-repository', 'single-repo'), false)
  assert.equal(builtinUsed('builtin:planning-repository', null), false)
  assert.equal(builtinUsed('builtin:reply-safety', null), true)
  for (const info of Object.values(BUILTIN_INFO)) assert.ok(info.example && info.protects && info.where)
})

test('the set form saves only what differs from the defaults and catches mistakes', () => {
  const form = { ...emptySetForm(), id: 'company-terms' }
  assert.deepEqual(setEntry(form, []).entry, { id: 'company-terms' })
  assert.deepEqual(setEntry({ ...form, action: 'report', boundaries: ['diff', 'plan'], repositories: ['example/app'], plugin: 'rules-x' }, []).entry, {
    id: 'company-terms',
    action: 'report',
    boundaries: ['plan', 'diff'],
    repositories: ['example/app'],
    plugin: 'rules-x',
  })
  assert.match(setEntry({ ...form, id: '' }, []).error, /name/)
  assert.match(setEntry({ ...form, id: 'Bad Name' }, []).error, /lowercase/)
  assert.match(setEntry({ ...form, id: 'builtin:x' }, []).error, /reserved/)
  assert.match(setEntry(form, ['company-terms']).error, /already exists/)
  assert.match(setEntry({ ...form, boundaries: [] }, []).error, /at least one/)
  const set = { id: 'a', action: 'block', boundaries: null, repositories: null, plugin: null, source: 'file', available: true }
  assert.deepEqual(entryOf(set), { id: 'a' })
})

test('the rule builder and the file view read and write the same lines', () => {
  const text = '# made-up\nproject-name: zebra falcon\nhost: staging\\.example\\.test\nticket: \\bacme-\\d{4}\\b\n\nbroken line\n'
  const rows = parseTermLines(text)
  assert.deepEqual(rows.map((r) => r.kind), ['note', 'word', 'word', 'pattern', 'blank', 'raw'])
  assert.equal(rows[2].value, 'staging.example.test', 'an escaped word reads as the word')
  assert.equal(serializeTerms(rows), text)
  assert.deepEqual(kindOf('a.b'), { kind: 'pattern', value: 'a.b' })
  // A word is saved escaped, so its dot means a dot.
  assert.equal(serializeTerms([{ kind: 'word', name: 'v', value: 'v1.2 (beta)' }]), 'v: v1\\.2 \\(beta\\)\n')
  assert.deepEqual(fileErrors(text), [{ line: 6, message: 'Needs a name, a colon, then the word or pattern.' }])
  const bad = fileErrors('ok: fine\nx: quartz(\n: nameless\n')
  assert.deepEqual(bad.map((e) => e.line), [2, 3])
  for (const e of bad) assert.doesNotMatch(e.message, /quartz/)
  assert.match(rowError({ kind: 'word', name: 'a', value: ' ' }), /Give a word/)
  assert.match(rowError({ kind: 'word', name: 'a:b', value: 'x' }), /colon/)
  assert.equal(parseTermLines('').length, 0)
})

test('Try it marks each match, ignoring case, and skips broken rules', () => {
  const rows = [
    { kind: 'word', name: 'project', value: 'Zebra Falcon' },
    { kind: 'pattern', name: 'ticket', value: '\\bacme-\\d{4}\\b' },
    { kind: 'pattern', name: 'broken', value: '(' },
  ]
  const hits = tryMatches('notes on zebra falcon\nsee ACME-1234 and acme-99', rows)
  assert.deepEqual(hits, [
    { line: 0, start: 9, end: 21, rule: 'project' },
    { line: 1, start: 4, end: 13, rule: 'ticket' },
  ])
  assert.deepEqual(highlightPieces('see ACME-1234 now', [{ start: 4, end: 13, rule: 'ticket' }]), [
    { text: 'see ', rules: [] },
    { text: 'ACME-1234', rules: ['ticket'] },
    { text: ' now', rules: [] },
  ])
})

test('the terms and sets calls go to their own operations', async () => {
  const posts = []
  const client = contentClient({ post: async (path, body) => (posts.push([body.operation, body.input]), { result: {} }) })
  await client.terms('ws', 'a')
  await client.saveTerms('ws', 'a', 'x: y\n')
  await client.saveSets('ws', [{ id: 'a' }], 'h')
  assert.deepEqual(posts, [
    ['content.terms.get', { id: 'a' }],
    ['content.terms.update', { id: 'a', text: 'x: y\n' }],
    ['content.sets.update', { sets: [{ id: 'a' }], expectedHash: 'h' }],
  ])
})

test('Allow rows round trip between the builder and the file view', () => {
  const text = 'project: zebra falcon\nticket: \\bacme-\\d{4}\\b\nallow: zebra falcon app\nallow ticket: \\bacme-0000\\b\n'
  const rows = parseTermLines(text)
  assert.deepEqual(rows.slice(2), [
    { kind: 'allow', rule: '', match: 'word', value: 'zebra falcon app' },
    { kind: 'allow', rule: 'ticket', match: 'pattern', value: '\\bacme-0000\\b' },
  ])
  assert.equal(serializeTerms(rows), text)
  assert.deepEqual([ruleCount(rows), allowCount(rows)], [2, 2])
  assert.deepEqual(ruleNames(rows), ['project', 'ticket'])
  // A word to allow is saved escaped, like a rule's.
  assert.equal(serializeTerms([{ kind: 'allow', rule: 'project', match: 'word', value: 'a.b' }]), 'allow project: a\\.b\n')
  assert.deepEqual(fileErrors(text), [])
  const bad = fileErrors('project: zebra\nallow nosuch: quartz\nallow: quartz(\nallow:  \nallow-list: fine\nallow x: y\n')
  assert.deepEqual(bad.map((e) => e.line), [2, 3, 4, 6])
  for (const e of bad) assert.doesNotMatch(e.message, /quartz|nosuch/)
  assert.match(rowError({ kind: 'word', name: 'allow', value: 'x' }), /Allow row/)
})

test('Try it marks allowed matches apart from blocking ones', () => {
  const rows = parseTermLines('project: zebra falcon\nticket: \\bacme-\\d{4}\\b\nallow: zebra falcon app\nallow ticket: \\bacme-0000\\b\n')
  const hits = tryMatches('the zebra falcon app\nzebra falcon\nacme-0000 zebra falcon', rows)
  assert.deepEqual(hits, [
    { line: 0, start: 4, end: 16, rule: 'project', allowed: true },
    { line: 1, start: 0, end: 12, rule: 'project' },
    // allow ticket does not cancel project on the same line.
    { line: 2, start: 10, end: 22, rule: 'project' },
    { line: 2, start: 0, end: 9, rule: 'ticket', allowed: true },
  ])
  assert.deepEqual(highlightPieces('the zebra falcon app', hits.filter((h) => h.line === 0)), [
    { text: 'the ', rules: [] },
    { text: 'zebra falcon', rules: [], allowed: ['project'] },
    { text: ' app', rules: [] },
  ])
})
