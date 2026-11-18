// The tabs of a repository's Edit dialog (Settings > Repository setup), and
// which of them have unsaved changes or an error. Every setting the dialog
// edits lives on exactly one tab; the dialog's one Save writes them all.
import type { RepositoryForm } from './settings-api.ts'

export const EDIT_TABS = [
  { key: 'general', label: 'General' },
  { key: 'landing', label: 'Landing' },
  { key: 'github', label: 'GitHub' },
  { key: 'mirror', label: 'Mirror' },
  { key: 'map', label: 'Workflow map' },
] as const
export type EditTab = (typeof EDIT_TABS)[number]['key']

// The entry fields each tab edits. Role is on General and the public
// repository on Mirror; both are kept apart from the entry.
export const EDIT_TAB_FIELDS: Record<EditTab, readonly (keyof RepositoryForm)[]> = {
  general: ['name'],
  landing: ['baseBranch', 'releaseCapacity', 'requiredChecks', 'pullRequestReviews', 'reviewApprovals'],
  github: ['cacheSeconds', 'rules', 'managedLabels', 'untriaged', 'minimumPermission', 'allowedActors', 'priority'],
  mirror: ['mirror'],
  map: [],
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export interface EditState {
  // The saved entry, or null when the repository has none.
  saved: RepositoryForm | null
  // The edited entry, or null while untouched.
  entry: RepositoryForm | null
  roleChanged: boolean
  sourceChanged: boolean
}

export function dirtyTabs(state: EditState): Set<EditTab> {
  const dirty = new Set<EditTab>()
  if (state.roleChanged) dirty.add('general')
  if (state.sourceChanged) dirty.add('mirror')
  const { entry, saved } = state
  if (!entry) return dirty
  for (const tab of EDIT_TABS)
    if (EDIT_TAB_FIELDS[tab.key].some((field) => !saved || !same(entry[field], saved[field]))) dirty.add(tab.key)
  return dirty
}

// A tab with a problem that blocks Save or a required field left blank.
export function errorTabs(entry: RepositoryForm | null, mirrorProblem: string | null): Set<EditTab> {
  const errors = new Set<EditTab>()
  if (mirrorProblem) errors.add('mirror')
  if (entry && !entry.name.trim()) errors.add('general')
  if (entry && !entry.baseBranch.trim()) errors.add('landing')
  return errors
}
