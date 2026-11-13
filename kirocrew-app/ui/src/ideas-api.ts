// Ideas (design §8.8, R63): rough notes that never run work and can become
// a spec. The backend (src/app/ideas.mjs) checks and stores them; this
// module holds the calls and the pure helpers. Kept free of JSX so node can
// test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { suggestName, type NewPlanForm } from './new-plan-api.ts'

export type IdeaState = 'open' | 'archived' | 'graduated'

export interface IdeaEntry {
  text: string
  author: string
  at: string
}

export interface IdeaLink {
  url: string
  label?: string
  author?: string
  at?: string
}

export interface Idea {
  source: 'local'
  id: string
  kind: 'idea'
  title: string
  state: IdeaState
  author: string
  createdAt: string
  updatedAt: string
  notes: IdeaEntry[]
  links: IdeaLink[]
  graduated: { spec: string; at: string } | null
}

export interface NewIdeaForm {
  title: string
  notes: string
  // One per line.
  links: string
}

export const EMPTY_IDEA: NewIdeaForm = { title: '', notes: '', links: '' }

export const IDEA_STATES: { key: IdeaState; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'graduated', label: 'Became a spec' },
  { key: 'archived', label: 'Archived' },
]

export const linkLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

// What blocks Save in the New idea form, matching the backend's checks.
export function ideaProblems(form: NewIdeaForm): string[] {
  const problems: string[] = []
  const title = form.title.trim()
  if (!title) problems.push('Name the idea.')
  else if (title.length > 240) problems.push('Keep the title to 240 characters.')
  if (form.notes.trim().length > 4000) problems.push('Keep the first note to 4,000 characters.')
  const links = linkLines(form.links)
  if (links.length > 50) problems.push('An idea holds at most 50 links.')
  for (const line of links)
    if (!/^https?:\/\/\S+$/i.test(line)) {
      problems.push(`${line.slice(0, 60)} is not an http or https link.`)
      break
    }
  return problems
}

export const ideasOf = (ideas: Idea[], state: IdeaState) => ideas.filter((idea) => idea.state === state)

// Make it a spec: the New spec drawer's fields from the idea (R63.9).
export function specSeed(idea: Idea): Partial<NewPlanForm> {
  const notes = idea.notes.map((entry) => entry.text).join('\n\n')
  return {
    name: suggestName(idea.title),
    goal: notes ? `${idea.title}\n\n${notes}` : idea.title,
    context: idea.links.map((link) => (link.label ? `${link.label}: ${link.url}` : link.url)).join('\n'),
    idea: idea.id,
  }
}

export function ideasClient(api: AppApi) {
  const call = async <T>(workspaceId: string, operation: string, input: Record<string, unknown>) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    capture: (workspaceId: string, form: NewIdeaForm) =>
      call<Idea>(workspaceId, 'idea.capture', {
        title: form.title.trim(),
        ...(form.notes.trim() ? { notes: form.notes } : {}),
        links: linkLines(form.links),
      }),
    append: (workspaceId: string, id: string, entry: { note?: string; link?: string }) => call<Idea>(workspaceId, 'idea.append', { id, ...entry }),
    archive: (workspaceId: string, id: string) => call<Idea>(workspaceId, 'idea.archive', { id }),
    restore: (workspaceId: string, id: string) => call<Idea>(workspaceId, 'idea.restore', { id }),
  }
}
