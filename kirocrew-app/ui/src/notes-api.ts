// Links and notes on a task, Mark done for a manual task, and workflow
// templates for New spec (design §4.16, Requirement 61). Kept free of JSX
// so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface NoteEntry {
  id: string
  taskId: string
  kind: 'link' | 'note'
  url?: string
  label?: string
  text?: string
  outcome: boolean
  // 'person' or 'session:<id>'.
  author: string
  login?: string
  at: string
  editedAt?: string | null
  onIssue: boolean
}

export interface ManualDone {
  choice: 'done' | 'skipped'
  by: string
  login?: string
  at: string
  via: 'avoozl' | 'github'
}

export interface TemplateInput {
  id: string
  label: string
  type: 'text' | 'choice' | 'file' | 'repositories' | 'epic'
  required: boolean
  options?: string[]
}

export interface TemplateSummary {
  plugin: string
  version: string
  id: string
  title: string
  description: string
  inputs: TemplateInput[]
  phases: { id: string; title: string }[]
  proofKinds: string[]
  // It has a pack or flow defaults to offer.
  settings: boolean
}

// The limits the backend applies (task-notes.mjs NOTE_LIMITS).
export const NOTE_LIMITS = { url: 2000, label: 200, text: 10_000 }
// A file input is read here, at most this much text (templates.mjs).
export const FILE_INPUT_BYTES = 200 * 1024

// Who wrote an entry, in words.
export function authorLabel(entry: Pick<NoteEntry, 'author' | 'login'>): string {
  if (entry.author === 'person') return entry.login ? `${entry.login} (person)` : 'A person'
  return entry.author.startsWith('session:') ? `Session ${entry.author.slice('session:'.length)}` : entry.author
}

// What is wrong with a link the person typed, or null. Mirrors the backend.
export function linkProblem(url: string, label: string): string | null {
  const value = url.trim()
  if (!value) return 'Give a link.'
  if (value.length > NOTE_LIMITS.url) return `The link is longer than ${NOTE_LIMITS.url} characters.`
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return 'That is not a link.'
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Use an http or https link.'
  if (parsed.username || parsed.password) return 'Leave the user name and password out of the link.'
  const name = label.trim()
  if (!name) return 'Give the link a label.'
  if (name.length > NOTE_LIMITS.label) return `The label is longer than ${NOTE_LIMITS.label} characters.`
  return null
}

export function noteProblem(text: string): string | null {
  const value = text.trim()
  if (!value) return 'Write the note.'
  if (value.length > NOTE_LIMITS.text) return `The note is longer than ${NOTE_LIMITS.text} characters.`
  return null
}

// A content rule refused a person's save: the decisions Allow once takes,
// read from the error the backend sent (app-backend.mjs). Empty otherwise.
export function blockedDecisions(error: unknown): string[] {
  if (!error || typeof error !== 'object' || !('body' in error)) return []
  try {
    const parsed = JSON.parse(String((error as { body: unknown }).body)) as {
      decisions?: unknown
    }
    return Array.isArray(parsed.decisions) ? parsed.decisions.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

// The fields a template asks for that are missing, by label.
export function missingInputs(template: TemplateSummary, values: Record<string, string | string[]>): string[] {
  return template.inputs
    .filter((input) => input.required)
    .filter((input) => {
      const value = values[input.id]
      return Array.isArray(value) ? !value.length : !String(value ?? '').trim()
    })
    .map((input) => input.label)
}

// A file read in the page: its text, refused above the limit.
export async function readInputFile(file: { size: number; text: () => Promise<string> }): Promise<string> {
  if (file.size > FILE_INPUT_BYTES) throw new Error('That file is larger than 200 KB. Pick a smaller one.')
  return file.text()
}

export function notesClient(api: AppApi) {
  const run = async <T>(operation: string, workspaceId: string, input: Record<string, unknown>) =>
    (
      await api.post<{ result: T }>(COMMAND_PATH, {
        operation,
        workspaceId,
        input,
      })
    ).result
  return {
    list: (workspaceId: string, taskId: string) => run<{ taskId: string; entries: NoteEntry[] }>('task.notes.list', workspaceId, { taskId }),
    addLink: (workspaceId: string, taskId: string, url: string, label: string) =>
      run<NoteEntry>('task.notes.add', workspaceId, {
        taskId,
        kind: 'link',
        url: url.trim(),
        label: label.trim(),
      }),
    addNote: (workspaceId: string, taskId: string, text: string) =>
      run<NoteEntry>('task.notes.add', workspaceId, {
        taskId,
        kind: 'note',
        text,
      }),
    edit: (workspaceId: string, taskId: string, entry: NoteEntry, change: { url?: string; label?: string; text?: string }) =>
      run<NoteEntry>('task.notes.edit', workspaceId, {
        taskId,
        id: entry.id,
        ...change,
      }),
    remove: (workspaceId: string, taskId: string, id: string) => run<NoteEntry>('task.notes.remove', workspaceId, { taskId, id }),
    show: (workspaceId: string, taskId: string, id: string, onIssue: boolean) => run<NoteEntry>('task.notes.show', workspaceId, { taskId, id, onIssue }),
    allowOnce: (workspaceId: string, id: string, reason: string) => run<unknown>('content.allow', workspaceId, { id, reason }),
    markDone: (
      workspaceId: string,
      taskId: string,
      input: {
        choice: 'done' | 'skipped'
        note?: string
        links?: { url: string; label: string }[]
      },
    ) => run<{ taskId: string; manualDone: ManualDone }>('task.manual.complete', workspaceId, { taskId, ...input }),
    reopen: (workspaceId: string, taskId: string) => run<unknown>('task.manual.reopen', workspaceId, { taskId }),
    templates: (workspaceId: string) => run<{ templates: TemplateSummary[] }>('template.list', workspaceId, {}),
  }
}
