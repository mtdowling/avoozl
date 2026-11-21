// Epic context on the page (epic-context EC4.1, EC9): the machine block, each
// context plugin part with its asks and mappings, and the last sessions that
// got context. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface ContextTest {
  name: string
  passed: boolean
  why?: string
}

export interface ContextServer {
  alias: string
  about: string
  command: string[]
  env: string[]
  replaced: boolean
  mapped: boolean
}

// One plugin's context part, as plugins.list and context.get show it.
export interface ContextPart {
  repos: string[]
  skills: { name: string; description: string; hash: string }[]
  reads: { id: string; about: string; written: string; filled: string }[]
  ask: { name: string; question: string; answer: string | null }[]
  servers: ContextServer[]
  contentSets: string[]
  ignored: string | null
  state: string
  missing: { questions: string[]; aliases: string[] }
}

export interface ContextSession {
  at: string
  taskId: string
  resumed: boolean
  briefOnly: boolean
  given: boolean
  tests: ContextTest[]
  sources: string[]
  items: string
  left: { item: string; why: string }[]
}

export interface MachineContext {
  repos: string[]
  reads?: string[]
  mcp?: Record<string, { about: string; command: string[]; env?: string[] }>
  contentSets?: string[]
}

export interface ContextView {
  machine: MachineContext | null
  plugins: (ContextPart & { id: string; version: string })[]
  sessions: ContextSession[]
}

// The form's values for this machine's own context. A tool is one MCP
// server: its name, what it does, its command one argument per item, and
// the environment variable names it may read (never their values).
export interface ContextTool {
  alias: string
  about: string
  command: string[]
  env: string[]
}

export interface ContextDraft {
  repos: string[]
  reads: string[]
  tools: ContextTool[]
  contentSets: string[]
}

export const emptyTool = (): ContextTool => ({ alias: '', about: '', command: [''], env: [] })

export function draftOf(machine: MachineContext | null): ContextDraft {
  return {
    repos: [...(machine?.repos ?? [])],
    reads: [...(machine?.reads ?? [])],
    tools: Object.entries(machine?.mcp ?? {}).map(([alias, server]) => ({ alias, about: server.about, command: [...server.command], env: [...(server.env ?? [])] })),
    contentSets: [...(machine?.contentSets ?? [])],
  }
}

// What Save sends: empty lists left out, blank arguments dropped.
export function machineOf(draft: ContextDraft): MachineContext {
  const tools = draft.tools.map((tool) => ({ ...tool, alias: tool.alias.trim(), about: tool.about.trim(), command: tool.command.map((part) => part.trim()).filter(Boolean) }))
  return {
    repos: draft.repos,
    ...(draft.reads.length ? { reads: draft.reads } : {}),
    ...(tools.length
      ? {
          mcp: Object.fromEntries(
            tools.map(({ alias, ...server }) => [alias, { about: server.about, command: server.command, ...(server.env.length ? { env: server.env } : {}) }]),
          ),
        }
      : {}),
    ...(draft.contentSets.length ? { contentSets: draft.contentSets } : {}),
  }
}

// The rules the backend checks (context-shape.mjs), so a mistake shows next
// to its field before Save. The backend still checks every save.
const REPO = /^(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?:[A-Za-z0-9._-]{1,100}|\*)|[A-Za-z0-9][A-Za-z0-9._-]{0,63})$/
const ALIAS = /^[a-z][a-z0-9-]{0,39}$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/

export const repoProblem = (text: string) => (REPO.test(text) ? null : 'Write owner/name, or owner/* for all of one owner’s repos.')
export const envProblem = (text: string) => (ENV_NAME.test(text) ? null : 'A variable name is letters, digits and _, not starting with a digit.')

export function folderProblem(text: string): string | null {
  if (!text || text.length > 1000) return 'Give a folder path.'
  if (/[\u0000-\u001f]/.test(text)) return 'The path holds a control character.'
  if (!(text.startsWith('~/') || text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text))) return 'Start the path with / or ~/.'
  if (text.split(/[\\/]/).includes('..')) return 'The path may not hold "..".'
  return null
}

// Each field's first problem, keyed `repos`, `reads`, `contentSets` or
// `tool.N`. Empty when the draft can be saved.
export function draftProblems(draft: ContextDraft): Record<string, string> {
  const problems: Record<string, string> = {}
  if (!draft.repos.length) problems.repos = 'Add at least one repo.'
  else if (draft.repos.length > 50) problems.repos = 'Name up to 50 repos.'
  else {
    const bad = draft.repos.find((repo) => repoProblem(repo))
    if (bad) problems.repos = `${bad}: ${repoProblem(bad)}`
  }
  if (draft.reads.length > 20) problems.reads = 'Name up to 20 folders.'
  else {
    const bad = draft.reads.find((read) => folderProblem(read))
    if (bad !== undefined) problems.reads = `${bad}: ${folderProblem(bad)}`
  }
  if (draft.contentSets.length > 20) problems.contentSets = 'Pick up to 20 rule sets.'
  if (draft.tools.length > 10) problems['tool.0'] = 'Add up to 10 tools.'
  draft.tools.forEach((tool, at) => {
    const alias = tool.alias.trim()
    const command = tool.command.map((part) => part.trim()).filter(Boolean)
    const problem = !ALIAS.test(alias)
      ? 'Name it with lowercase letters, digits and dashes, starting with a letter.'
      : draft.tools.findIndex((other) => other.alias.trim() === alias) !== at
        ? `Another tool is already named ${alias}.`
        : !tool.about.trim() || tool.about.trim().length > 200
          ? 'Say what it does in 1 to 200 characters.'
          : !command.length
            ? 'Give the program to run.'
            : command.length > 50
              ? 'Give up to 50 arguments.'
              : (tool.env.map(envProblem).find(Boolean) ?? null)
    if (problem) problems[`tool.${at}`] ??= problem
  })
  return problems
}

// The field a backend refusal names ("epicContext.reads.0 ..."), so it
// shows next to that field; null when it names none.
export function fieldOfError(message: string, draft: ContextDraft): string | null {
  const match = /\bepicContext\.(repos|reads|contentSets|mcp)\b(?:\.([a-z][a-z0-9-]*))?(?: alias ([^ ]+))?/.exec(message)
  if (!match) return null
  if (match[1] !== 'mcp') return match[1]
  const alias = match[2] ?? match[3]
  const at = draft.tools.findIndex((tool) => tool.alias.trim() === alias)
  return `tool.${Math.max(at, 0)}`
}

export function contextClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    get: (workspaceId: string) => run<ContextView>('context.get', {}, workspaceId),
    setMachine: (workspaceId: string, epicContext: MachineContext | null) => run<unknown>('context.machine.set', { epicContext }, workspaceId),
    answer: (workspaceId: string, id: string, name: string, value: string) => run<unknown>('plugin.answer', { id, name, value }, workspaceId),
    // A server's mapping on this machine: the names it may read and, when
    // the plugin's own command is not the one to run, a replacement.
    map: (workspaceId: string, id: string, alias: string, env: string[], command: string[] | null) =>
      run<unknown>('plugin.map', { id, alias, env, ...(command ? { command } : {}) }, workspaceId),
  }
}

// The state a part is in, in words.
const STATE_WORDS: Record<string, string> = {
  approved: 'Gives context',
  'needs answers': 'Needs your answers',
  'needs mapping': 'Needs this machine to map each server',
  changed: 'Changed since you approved it; approve it again',
  unapproved: 'Not approved yet',
  ignored: 'Ignored',
  invalid: 'Not valid',
  disabled: 'Disabled',
  missing: 'Not found',
}
export const stateWords = (state: string) => STATE_WORDS[state] ?? state

// One test in a line: its name, whether it passed, and the reason it failed.
export const testLine = (test: ContextTest) => `${test.name} ${test.passed ? 'passed' : `failed: ${test.why ?? 'no reason given'}`}`

// A command mapping form's values: empty keeps the plugin's own command; a
// JSON list replaces it. The names are comma separated.
export function parseServerMapping(command: string, env: string): { command: string[] | null; env: string[] } | { error: string } {
  const names = env
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (!command.trim()) return { command: null, env: names }
  let argv: unknown
  try {
    argv = JSON.parse(command)
  } catch {
    return { error: 'Write the command as a JSON list, such as ["/opt/acme/bin/research-mcp", "--stdio"], or leave it empty to run the plugin’s own.' }
  }
  if (!Array.isArray(argv) || !argv.length || argv.some((part) => typeof part !== 'string' || !part)) return { error: 'The command is a list of one or more arguments.' }
  return { command: argv as string[], env: names }
}
