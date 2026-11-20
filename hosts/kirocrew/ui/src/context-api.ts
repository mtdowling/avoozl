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
