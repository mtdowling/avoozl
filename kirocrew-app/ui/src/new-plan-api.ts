// New plan: the drawer's fields, their checks, and the plan.new call.
// Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { SpecBuilderCreate } from './spec-builder-api.ts'

// The spec folder name rule the backend applies (spec-plans.mjs NAME).
export const SPEC_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/

export const EPIC_PROBLEM = "Name the epic by its spec folder: lowercase letters, digits and hyphens."

export interface NewPlanForm {
  name: string
  category: string
  // The epic's spec folder name, or blank for none.
  epic: string
  // One phase per line; each becomes a tasks.md heading (Requirement 59.11).
  phases: string
  repositories: string[]
  goal: string
  context: string
  // The idea this spec comes from (Make it a spec, R63.9), or blank.
  idea: string
}

export const EMPTY_NEW_PLAN: NewPlanForm = { name: '', category: '', epic: '', phases: '', repositories: [], goal: '', context: '', idea: '' }

// The planner chat fallback.
export interface NewPlanResult {
  name: string
  folder: string
  agent: string
  message: string
}

// Whether the target repository has Avoozl's steering file.
export interface SteeringStatus {
  path: string
  state: 'missing' | 'current' | 'older' | 'changed'
  text?: string
}

export interface NewPlanPreview {
  name: string
  folder: string
  steering: SteeringStatus & { text: string }
}

export interface SpecBuilderHandoff {
  name: string
  folder: string
  steering: SteeringStatus
  specBuilder: SpecBuilderCreate
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
  if (!value) return 'Name the spec.'
  if (!SPEC_NAME.test(value)) {
    const hint = suggestName(value)
    return `Use lowercase letters, digits and hyphens, up to 80 characters${hint && hint !== value ? `, like ${hint}` : ''}.`
  }
  for (const used of taken) if (used === value) return `${value} is already used by a spec or its folder.`
  return null
}

// Every problem that blocks Submit, in field order.
export function formProblems(form: NewPlanForm, taken: Iterable<string>, repositoryCount: number): string[] {
  const problems: string[] = []
  const name = nameProblem(form.name, taken)
  if (name) problems.push(name)
  if (!repositoryCount) problems.push('Register a repository in Settings › Repositories first.')
  else if (!form.repositories.length) problems.push('Pick at least one repository.')
  if (form.epic.trim() && !SPEC_NAME.test(form.epic.trim())) problems.push(EPIC_PROBLEM)
  if (!form.goal.trim()) problems.push('Say what you want.')
  return problems
}

export const phaseList = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export const isDirty = (form: NewPlanForm) => JSON.stringify(form) !== JSON.stringify(EMPTY_NEW_PLAN)

const fields = (form: NewPlanForm) => ({
  name: form.name.trim(),
  category: form.category.trim(),
  epic: form.epic.trim(),
  phases: phaseList(form.phases),
  repositories: form.repositories,
  goal: form.goal,
  context: form.context,
  ...(form.idea ? { idea: form.idea } : {}),
})

export function newPlanClient(api: AppApi) {
  const call = async <T>(workspaceId: string, input: Record<string, unknown>) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation: 'plan.new', workspaceId, input })).result
  return {
    // Checks the fields and reads the steering file; records nothing.
    preview: (workspaceId: string, form: NewPlanForm) =>
      call<NewPlanPreview>(workspaceId, { ...fields(form), handoff: 'spec-builder', preview: true }),
    // Records the request and returns Spec Builder's create body.
    specBuilder: (workspaceId: string, form: NewPlanForm, writeSteering: boolean) =>
      call<SpecBuilderHandoff>(workspaceId, { ...fields(form), handoff: 'spec-builder', writeSteering }),
    // The fallback: an Avoozl planner chat's seed.
    request: (workspaceId: string, form: NewPlanForm) => call<NewPlanResult>(workspaceId, fields(form)),
  }
}
