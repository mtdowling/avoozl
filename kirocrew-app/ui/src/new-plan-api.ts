// New plan: the drawer's fields, their checks, and the plan.new call.
// Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

// The spec folder name rule the backend applies (spec-plans.mjs NAME).
export const SPEC_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/

export interface NewPlanForm {
  name: string
  category: string
  // One epic or phase per line.
  epics: string
  repositories: string[]
  goal: string
  context: string
}

export const EMPTY_NEW_PLAN: NewPlanForm = { name: '', category: '', epics: '', repositories: [], goal: '', context: '' }

export interface NewPlanResult {
  name: string
  folder: string
  agent: string
  message: string
}

// A folder name from free text: lowercase, hyphens, at most 80 characters.
export function suggestName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

// What is wrong with a name, or null. `taken` holds names already used by
// a plan or a spec folder.
export function nameProblem(name: string, taken: Iterable<string>): string | null {
  const value = name.trim()
  if (!value) return 'Name the plan.'
  if (!SPEC_NAME.test(value)) {
    const hint = suggestName(value)
    return `Use lowercase letters, digits and hyphens, up to 80 characters${hint && hint !== value ? `, like ${hint}` : ''}.`
  }
  for (const used of taken) if (used === value) return `${value} is already used by a plan or spec folder.`
  return null
}

// Every problem that blocks Submit, in field order.
export function formProblems(form: NewPlanForm, taken: Iterable<string>, repositoryCount: number): string[] {
  const problems: string[] = []
  const name = nameProblem(form.name, taken)
  if (name) problems.push(name)
  if (!repositoryCount) problems.push('Register a repository in Settings › Repositories first.')
  else if (!form.repositories.length) problems.push('Pick at least one repository.')
  if (!form.goal.trim()) problems.push('Say what you want.')
  return problems
}

export const epicList = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export const isDirty = (form: NewPlanForm) => JSON.stringify(form) !== JSON.stringify(EMPTY_NEW_PLAN)

export function newPlanClient(api: AppApi) {
  return {
    request: async (workspaceId: string, form: NewPlanForm) =>
      (
        await api.post<{ result: NewPlanResult }>(COMMAND_PATH, {
          operation: 'plan.new',
          workspaceId,
          input: {
            name: form.name.trim(),
            category: form.category.trim(),
            epics: epicList(form.epics),
            repositories: form.repositories,
            goal: form.goal,
            context: form.context,
          },
        })
      ).result,
  }
}
