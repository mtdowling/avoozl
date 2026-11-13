// Calls and pure helpers for Settings > Content rules (design §4.9,
// Requirement 40). The backend reads `.avoozl.json`, terms files and rules
// plugins. The list shows each set's source and availability, never a rule;
// only the terms editor, for a person, reads one set's terms file. Keep it
// free of JSX and runtime imports so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface ContentRuleSet {
  id: string
  action: 'block' | 'report'
  boundaries: string[] | null
  repositories: string[] | null
  plugin: string | null
  source: 'file' | 'plugin' | 'policy'
  termsFrom?: 'machine' | 'workspace'
  available: boolean
  reason?: string
  ruleCount?: number
  version?: string
}

export interface ContentRules {
  error: string | null
  sets: ContentRuleSet[]
  builtins: { id: string; appliesAt: string }[]
  // What a set may name: registered repositories and declared plugins.
  choices?: { repositories: string[]; plugins: string[] }
  // The .avoozl.json hash a save must match, and the workspace's mode.
  configHash?: string | null
  mode?: string | null
}

export interface TermsFile {
  id: string
  file: string
  from: 'machine' | 'workspace'
  editable: boolean
  exists: boolean
  text: string | null
  reason?: string
}

// What each boundary covers, in the words Settings shows.
export const BOUNDARY_LABELS: Record<string, string> = {
  plan: 'Plan files',
  github: 'GitHub text',
  brief: 'Session briefs',
  diff: 'Worker diffs',
  intake: 'Incoming items',
}

// One line on what each boundary checks, from content-rules.mjs and its callers.
export const BOUNDARY_HINTS: Record<string, string> = {
  plan: 'Spec files when a plan is saved or approved.',
  github: 'Issue, comment and pull request text Avoozl writes.',
  brief: 'The brief a worker session starts with.',
  diff: 'Lines a worker adds, checked before a push.',
  intake: 'Items that come in from a plugin source or MCP. Only checked when you tick it.',
}

export const BOUNDARIES = Object.keys(BOUNDARY_LABELS)
// What a set with no `boundaries` list checks: all but intake.
export const DEFAULT_BOUNDARIES = BOUNDARIES.filter((b) => b !== 'intake')

// The `contentRules.sets` keys, each with whether it must be set.
export const SET_FIELDS: { key: string; required: boolean; text: string }[] = [
  { key: 'id', required: true, text: 'Names the set and its terms file, .avoozl/local/content-rules/<id>.txt.' },
  { key: 'action', required: false, text: 'block (the default) stops the write; report lets it through and records the match.' },
  { key: 'boundaries', required: false, text: 'Some of plan, github, brief, diff, intake. Blank means all but intake.' },
  { key: 'repositories', required: false, text: 'Registered repositories it applies to. Blank means all.' },
  { key: 'plugin', required: false, text: 'A plugins entry of kind rules that supplies this set instead of a terms file.' },
]

export function sourceLabel(set: ContentRuleSet): string {
  if (set.source === 'plugin') return `Rules plugin ${set.plugin}${set.version ? `, version ${set.version}` : ''}`
  if (set.source === 'policy') return '.avoozl.json'
  return set.termsFrom === 'machine' ? 'Terms file named in this machine’s settings' : 'Terms file in .avoozl/local/content-rules'
}

export function scopeLabel(set: ContentRuleSet): string {
  const where = set.boundaries ? set.boundaries.map((b) => BOUNDARY_LABELS[b] ?? b).join(', ') : 'Every boundary but incoming items'
  return set.repositories ? `${where} in ${set.repositories.join(', ')}` : where
}

// ---------------------------------------------------------------------------
// Built-in sets, in plain words. Checked against content-rules.mjs
// (BUILTIN_SETS, findPlanningLeak, screenReply, secretReason) and its
// callers. Every example is made up.

export interface BuiltinInfo {
  name: string
  protects: string
  where: string
  example: string
  // The modes it runs in; null means every mode.
  modes: string[] | null
}

export const BUILTIN_INFO: Record<string, BuiltinInfo> = {
  'builtin:planning-repository': {
    name: 'Plans repo name',
    protects:
      'The private planning repository’s name, as owner/name, a GitHub URL or owner/name#12. It is found even when split by spaces or a line break, or hidden by percent or HTML escapes.',
    where: 'Linked branches, steering, session briefs and pull requests in the code repositories.',
    example: 'Follow-up from example-org/secret-plans#12',
    modes: ['plans-repo'],
  },
  'builtin:reply-safety': {
    name: 'Safe replies',
    protects:
      'Secrets and machine paths in a responder’s reply: GitHub, AWS, Slack, Google and API keys, private keys, web tokens, bearer tokens, URLs with a password, password= lines, and paths like /Users/…, C:\\…, ~/… or this machine’s own folders. Code blocks are checked too.',
    where: 'Replies a responder session posts on a GitHub issue.',
    example: 'The log is at ~/work/run.log',
    modes: null,
  },
  'builtin:published-secrets': {
    name: 'Secrets',
    protects:
      'Private keys, provider and GitHub tokens, password or API key values, Authorization headers, URLs with a password, user home paths, and long random-looking values.',
    where: 'Issue markers, workspace publications and broad-issue previews.',
    example: 'Authorization: Bearer made-up-token-123',
    modes: null,
  },
}

// A built-in's plain name, or its raw id when Avoozl adds one this page
// doesn't know yet.
export const builtinName = (id: string) => BUILTIN_INFO[id]?.name ?? id

// Whether a built-in set runs in this mode. The plans repo set has nothing
// to protect without a planning repository.
export const builtinUsed = (id: string, mode: string | null | undefined) => {
  const modes = BUILTIN_INFO[id]?.modes
  return !modes || modes.includes(mode ?? '')
}

// ---------------------------------------------------------------------------
// The set form: one `contentRules.sets` entry.

export interface SetForm {
  id: string
  action: 'block' | 'report'
  // The default boundaries (all but intake) save no list; none is refused.
  // No repository checked means every repository.
  boundaries: string[]
  repositories: string[]
  plugin: string
}

export const emptySetForm = (): SetForm => ({ id: '', action: 'block', boundaries: [...DEFAULT_BOUNDARIES], repositories: [], plugin: '' })

export const setFormOf = (set: ContentRuleSet): SetForm => ({
  id: set.id,
  action: set.action,
  boundaries: set.boundaries ?? [...DEFAULT_BOUNDARIES],
  repositories: set.repositories ?? [],
  plugin: set.plugin ?? '',
})

const SET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

// The entry a form saves, or the first thing to fix. The backend checks again.
export function setEntry(form: SetForm, others: string[]): { entry?: Record<string, unknown>; error?: string } {
  const id = form.id.trim()
  if (!id) return { error: 'Give the set a name.' }
  if (id.toLowerCase().startsWith('builtin:')) return { error: 'Names starting builtin: are reserved.' }
  if (!SET_ID.test(id)) return { error: 'Use lowercase letters, digits, dots, dashes or underscores.' }
  if (others.includes(id)) return { error: `A set named ${id} already exists.` }
  if (!form.boundaries.length) return { error: 'Pick at least one place to check.' }
  return {
    entry: {
      id,
      ...(form.action === 'report' ? { action: 'report' } : {}),
      ...(form.boundaries.length &&
      !(form.boundaries.length === DEFAULT_BOUNDARIES.length && DEFAULT_BOUNDARIES.every((b) => form.boundaries.includes(b)))
        ? { boundaries: BOUNDARIES.filter((b) => form.boundaries.includes(b)) }
        : {}),
      ...(form.repositories.length ? { repositories: [...form.repositories] } : {}),
      ...(form.plugin ? { plugin: form.plugin } : {}),
    },
  }
}

// The stored entry of a set as listed, for a save that keeps the others.
export const entryOf = (set: ContentRuleSet): Record<string, unknown> => setEntry(setFormOf(set), []).entry ?? { id: set.id }

// ---------------------------------------------------------------------------
// Terms: `name: pattern` per line, `#` notes, matched per line ignoring case
// (content-rules.mjs parseTerms). `allow: pattern` cancels any rule's match
// on the same line, `allow <name>: pattern` only that rule's. The Rule
// builder shows one row per line; a word or phrase is stored escaped, so it
// matches only itself.

export type TermKind = 'word' | 'pattern'

export type TermRow =
  | { kind: TermKind; name: string; value: string }
  // `rule` '' allows a match of every rule in the file.
  | { kind: 'allow'; rule: string; match: TermKind; value: string }
  | { kind: 'note'; text: string }
  | { kind: 'blank' }
  // A line the builder can't read (no name or colon); shown so it isn't lost.
  | { kind: 'raw'; text: string }

const SPECIAL = /[.*+?^${}()|[\]\\]/g
export const escapeTerm = (text: string) => text.replace(SPECIAL, '\\$&')
const unescapeTerm = (source: string) => source.replace(/\\([.*+?^${}()|[\]\\])/g, '$1')

// A pattern that only escapes special characters is a word or phrase.
export function kindOf(source: string): { kind: TermKind; value: string } {
  const plain = unescapeTerm(source)
  return escapeTerm(plain) === source ? { kind: 'word', value: plain } : { kind: 'pattern', value: source }
}

export function parseTermLines(text: string): TermRow[] {
  const lines = text.replace(/\n$/, '').split('\n')
  if (lines.length === 1 && lines[0] === '') return []
  return lines.map((raw): TermRow => {
    const line = raw.trim()
    if (!line) return { kind: 'blank' }
    if (line.startsWith('#')) return { kind: 'note', text: line.replace(/^#\s?/, '') }
    const at = line.indexOf(':')
    if (at < 1) return { kind: 'raw', text: raw }
    const name = line.slice(0, at).trim()
    const read = kindOf(line.slice(at + 1).trim())
    const allow = ALLOW_NAME.exec(name)
    if (allow) return { kind: 'allow', rule: allow[1]?.trim() ?? '', match: read.kind, value: read.value }
    return { name, ...read }
  })
}

// A line whose name is `allow` or `allow <rule>` (content-rules.mjs ALLOW_NAME).
const ALLOW_NAME = /^allow(?:\s+(.*))?$/i

const sourceOf = (match: TermKind, value: string) => (match === 'word' ? escapeTerm(value.trim()) : value.trim())

export function rowLine(row: TermRow): string {
  if (row.kind === 'blank') return ''
  if (row.kind === 'note') return `# ${row.text}`
  if (row.kind === 'raw') return row.text
  if (row.kind === 'allow') return `allow${row.rule.trim() ? ` ${row.rule.trim()}` : ''}: ${sourceOf(row.match, row.value)}`
  return `${row.name.trim()}: ${sourceOf(row.kind, row.value)}`
}

export const serializeTerms = (rows: TermRow[]) => (rows.length ? rows.map(rowLine).join('\n') + '\n' : '')

// The rule names in a file, for the Allow row's rule picker.
export const ruleNames = (rows: TermRow[]) => [...new Set(rows.flatMap((r) => (r.kind === 'word' || r.kind === 'pattern' ? [r.name.trim()] : [])))].filter(Boolean)

// What is wrong with one rule row, or null. Never repeats the term. `rows`
// is the whole file, so an Allow row can check the rule it names.
export function rowError(row: TermRow, rows: TermRow[] = []): string | null {
  if (row.kind === 'raw') return 'Needs a name, a colon, then the word or pattern.'
  if (row.kind === 'allow') {
    if (row.rule.trim() && !ruleNames(rows).includes(row.rule.trim())) return 'Allows a rule this file does not have.'
    if (!row.value.trim()) return 'Give a word, phrase or pattern to allow.'
    return row.match === 'pattern' ? patternError(row.value) : null
  }
  if (row.kind !== 'word' && row.kind !== 'pattern') return null
  const name = row.name.trim()
  if (!name) return 'Give the rule a name.'
  if (name.includes(':')) return 'A name cannot hold a colon.'
  if (/^#/.test(name)) return 'A name cannot start with #.'
  if (ALLOW_NAME.test(name)) return 'A name cannot start with allow; use an Allow row.'
  if (!row.value.trim()) return 'Give a word, phrase or pattern.'
  return row.kind === 'pattern' ? patternError(row.value) : null
}

function patternError(value: string): string | null {
  try {
    new RegExp(value.trim(), 'i')
  } catch (error) {
    return `The pattern does not compile (${String((error as Error).message).split(': ').pop()}).`
  }
  return null
}

// Every problem in the file view, by line number (1-based).
export function fileErrors(text: string): { line: number; message: string }[] {
  const rows = parseTermLines(text)
  return rows.flatMap((row, i) => {
    const message = rowError(row, rows)
    return message ? [{ line: i + 1, message }] : []
  })
}

export const ruleCount = (rows: TermRow[]) => rows.filter((r) => r.kind === 'word' || r.kind === 'pattern').length
export const allowCount = (rows: TermRow[]) => rows.filter((r) => r.kind === 'allow').length

// The next free default rule name.
export function nextRuleName(rows: TermRow[]): string {
  const names = new Set(rows.flatMap((r) => (r.kind === 'word' || r.kind === 'pattern' ? [r.name] : [])))
  let n = rows.length + 1
  while (names.has(`rule-${n}`)) n += 1
  return `rule-${n}`
}

export interface TryHit {
  line: number
  start: number
  end: number
  rule: string
  // An Allow row matches the same line, so Avoozl would let this through.
  allowed?: true
}

// Try it: the parts of `sample` each valid rule matches, per line, ignoring
// case, as [start, end, rule name], marked `allowed` when an Allow row for
// that rule (or every rule) matches the same line. Avoozl also undoes
// percent and HTML escapes before matching; this preview does not.
export function tryMatches(sample: string, rows: TermRow[]): TryHit[] {
  const allows = rows.flatMap((row) =>
    row.kind === 'allow' && !rowError(row, rows) ? [{ rule: row.rule.trim(), re: new RegExp(sourceOf(row.match, row.value), 'i') }] : [],
  )
  const rules = rows.flatMap((row) => {
    if ((row.kind !== 'word' && row.kind !== 'pattern') || rowError(row, rows)) return []
    const name = row.name.trim()
    return [{ name, re: new RegExp(sourceOf(row.kind, row.value), 'gi'), allow: allows.filter((a) => !a.rule || a.rule === name).map((a) => a.re) }]
  })
  const hits: TryHit[] = []
  sample.split('\n').forEach((text, line) => {
    for (const { name, re, allow } of rules) {
      const allowed = allow.some((a) => a.test(text))
      re.lastIndex = 0
      let found: RegExpExecArray | null
      let guard = 0
      while ((found = re.exec(text)) && guard++ < 200) {
        if (found[0].length === 0) {
          re.lastIndex += 1
          continue
        }
        hits.push({ line, start: found.index, end: found.index + found[0].length, rule: name, ...(allowed ? { allowed: true as const } : {}) })
      }
    }
  })
  return hits
}

// One line of sample text split into plain and matched pieces, overlaps
// merged. `rules` still block there; `allowed`, when present, matched but an
// Allow row lets them through.
export function highlightPieces(text: string, hits: { start: number; end: number; rule: string; allowed?: boolean }[]): { text: string; rules: string[]; allowed?: string[] }[] {
  const marks = new Array<{ rules: string[]; allowed: string[] } | null>(text.length).fill(null)
  for (const hit of hits)
    for (let i = hit.start; i < hit.end; i++) {
      const mark = (marks[i] ??= { rules: [], allowed: [] })
      const list = hit.allowed ? mark.allowed : mark.rules
      if (!list.includes(hit.rule)) list.push(hit.rule)
    }
  const pieces: { text: string; rules: string[]; allowed?: string[] }[] = []
  const keyOf = (m: { rules: string[]; allowed: string[] } | null) => (m ? `${m.rules.join()}|${m.allowed.join()}` : '|')
  let lastKey = ''
  for (let i = 0; i < text.length; i++) {
    const mark = marks[i]
    const key = keyOf(mark)
    const last = pieces[pieces.length - 1]
    if (last && key === lastKey) last.text += text[i]
    else pieces.push({ text: text[i], rules: [...(mark?.rules ?? [])], ...(mark?.allowed.length ? { allowed: [...mark.allowed] } : {}) })
    lastKey = key
  }
  return pieces
}

export function contentClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    list: (workspaceId: string) => run<ContentRules>('content.rules', {}, workspaceId),
    saveSets: (workspaceId: string, sets: Record<string, unknown>[], expectedHash: string | null | undefined) =>
      run<ContentRules>('content.sets.update', { sets, expectedHash: expectedHash ?? null }, workspaceId),
    terms: (workspaceId: string, id: string) => run<TermsFile>('content.terms.get', { id }, workspaceId),
    saveTerms: (workspaceId: string, id: string, text: string) =>
      run<{ id: string; rules: number; saved: boolean }>('content.terms.update', { id, text }, workspaceId),
  }
}
