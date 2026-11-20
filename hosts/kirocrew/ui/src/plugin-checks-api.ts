// Checks from a plugin on the page (plugin-checks D10, PK7.2, PK8): the
// Settings › Plugins view of a checks part, a task's plugin check results
// and decide answers, and the phase and branch results. Read from stored
// records only. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface McpCall {
  tool: string
  args?: Record<string, unknown>
  id?: string
  everySeconds?: number
  until?: { path: string; in: unknown[] }
}
export interface PluginCheckStep {
  kind: 'run' | 'mcp'
  argv?: string[]
  env?: string[]
  network?: boolean
  server?: string
  start?: McpCall
  poll?: McpCall
  result?: { path: string; pass: unknown[]; text?: string }
  // Each {file:NAME} the step sends, with its full text.
  files?: Record<string, string | null>
}
export interface PluginCheckDef {
  name: string
  repos: string[]
  paths: string[] | null
  stage: 'task' | 'phase' | 'branch'
  timeout: number | null
  step: PluginCheckStep
  decide: { file: string; at: string[]; text: string | null } | null
  appliesTo: string[]
}
export interface PluginChecksPart {
  checks: PluginCheckDef[]
  shadowed: { repository: string; name: string }[]
  clashes: { repository: string; name: string; plugins: string[] }[]
  servers: { alias: string; about: string; mapping: { command: string[]; env: string[] } | null }[]
}

export type CheckResult = 'passed' | 'failed' | 'not run' | 'cached' | 'skipped' | 'deciding'
export interface TaskPluginCheck {
  name: string
  plugin?: string
  result: CheckResult
  // A cached result: whether it passed, and the commit it was first made at.
  passed?: boolean
  firstCommit?: string
  filter?: 'repos' | 'paths' | 'decide'
  reason?: string
  durationMs?: number
}
export interface DecideAnswer {
  check: string
  plugin: string
  at: 'approve' | 'diff' | 'flip'
  commit?: string
  state: 'queued' | 'done'
  needed?: boolean
  reason?: string
  cause?: string
  flippedBy?: string
}
export interface TaskPluginChecks {
  commit: string | null
  results: TaskPluginCheck[]
  decides: DecideAnswer[]
}
export interface StageRun {
  run: string
  kind: 'phase' | 'branch'
  title: string
  repository: string
  commit: string
  state: string
  checks: { name: string; plugin: string | null; result: string; cached?: string }[]
  skipped: { name: string; plugin: string; filter: string; reason?: string }[]
}

// One result in words: "passed", "cached (failed) from abc1234", "skipped by
// paths".
export function resultLine(check: TaskPluginCheck): string {
  if (check.result === 'cached') return `cached, ${check.passed ? 'passed' : 'failed'}${check.firstCommit ? ` at ${check.firstCommit.slice(0, 7)}` : ''}`
  if (check.result === 'skipped') return `skipped by ${check.filter ?? 'a filter'}`
  if (check.result === 'deciding') return 'deciding'
  return check.result
}

export const RESULT_VARIANT: Record<CheckResult, 'success' | 'danger' | 'warning' | 'info'> = {
  passed: 'success',
  failed: 'danger',
  'not run': 'warning',
  cached: 'info',
  skipped: 'info',
  deciding: 'warning',
}

// A step in one line: the script and its arguments, or the tools in order.
export function stepLine(step: PluginCheckStep): string {
  if (step.kind === 'run') return (step.argv ?? []).join(' ')
  return [step.start?.tool, step.poll?.tool].filter(Boolean).join(', then ') + ` on server ${step.server}`
}

// A decide answer in words, naming where it came from.
export function decideLine(answer: DecideAnswer): string {
  if (answer.at === 'flip') return `${answer.needed ? 'Run it' : 'Skip it'}, by ${answer.flippedBy ?? 'a person'}`
  if (answer.state !== 'done') return `asked at ${answer.at}, waiting for the answer`
  return `${answer.needed ? 'needed' : 'not needed'} at ${answer.at}${answer.reason ? `: ${answer.reason}` : ''}${answer.cause ? ` (${answer.cause})` : ''}`
}

// A mapping form's values: the command as a JSON list of arguments (so an
// argument may hold a space) and the variable names, comma separated.
export function parseMapping(command: string, env: string): { command: string[]; env: string[] } | { error: string } {
  let argv: unknown
  try {
    argv = JSON.parse(command)
  } catch {
    return { error: 'Write the command as a JSON list, such as ["/opt/acme/bin/review-mcp", "--stdio"].' }
  }
  if (!Array.isArray(argv) || !argv.length || argv.some((part) => typeof part !== 'string' || !part)) return { error: 'The command is a list of one or more arguments.' }
  return {
    command: argv as string[],
    env: env
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  }
}

export function pluginChecksClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    // A person's mapping of a server alias; the plugin needs approving again.
    map: (workspaceId: string, id: string, alias: string, command: string[], env: string[]) => run<unknown>('plugin.map', { id, alias, command, env }, workspaceId),
    // Run it (needed) or Skip it, for the task's current commit.
    flip: (workspaceId: string, taskId: string, check: string, plugin: string, needed: boolean, commit: string | null) =>
      run<unknown>('check.decide.flip', { taskId, check, plugin, needed, ...(commit ? { commit } : {}) }, workspaceId),
    startPhaseFix: (workspaceId: string, runId: string) => run<{ taskId: string }>('check.phase.fix', { run: runId }, workspaceId),
    stages: (workspaceId: string) => run<{ phases: Record<string, StageRun>; branches: Record<string, StageRun> }>('plugin.checks.stages', {}, workspaceId),
  }
}
