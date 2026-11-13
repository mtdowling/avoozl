// Kiro Crew's Spec Builder, as New plan uses it: one create call, then its
// page opened on that spec. The app's grant (permissions.api) also reaches
// Spec Builder's approve, handoff, execute, task and delete routes; Avoozl
// never calls them, and src/app/test/spec-builder-grant.test.mjs fails if
// any source file names a Spec Builder route other than this one.
import type { AppApi } from '@kirocrew/app-sdk'

export const SPEC_BUILDER_SPECS = '/api/apps/spec-builder/specs'
export const SPEC_BUILDER_PAGE = '/spec-builder'
// Spec Builder's page opens the spec this key names (its "last open" spec).
// shortcut: Spec Builder has no deep link; switch to one if it gains one.
const LAST_OPEN = 'spec-builder:last-open'

export interface SpecBuilderCreate {
  name: string
  working_dir: string
  spec_type: string
  description: string
}

export interface SpecBuilderCreated {
  name: string
  spec_dir: string
}

export function specBuilderClient(api: AppApi) {
  return {
    create: (body: SpecBuilderCreate) => api.post<SpecBuilderCreated>(SPEC_BUILDER_SPECS, body),
  }
}

// Why a create failed, in words for the drawer. `fallback` says the planner
// chat is the way on: Spec Builder is off, or Avoozl may not reach it yet.
export function specBuilderProblem(caught: unknown): { message: string; fallback: boolean } {
  const error = caught as { status?: number; body?: string; message?: string } | null
  let code = ''
  let text = ''
  try {
    const parsed = JSON.parse(error?.body ?? '') as { code?: string; error?: string }
    code = parsed.code ?? ''
    text = parsed.error ?? ''
  } catch {
    // Not JSON: the status and message below say enough.
  }
  if (code === 'app_disabled')
    return {
      message: 'Spec Builder is turned off. Turn it on in Kiro Crew: open Apps, pick Spec Builder, and switch it on. Then press Open in Spec Builder again.',
      fallback: true,
    }
  if (/not permitted to access/.test(error?.message ?? '') || (error?.status === 403 && !code))
    return {
      message: "Avoozl can't reach Spec Builder yet. Approve Avoozl's new Spec Builder permission in Kiro Crew under Apps › Updates, then try again.",
      fallback: true,
    }
  if (error?.status === 404)
    return { message: 'Spec Builder is not installed in this Kiro Crew.', fallback: true }
  if (code === 'spec_exists' || code === 'spec_files_exist')
    return { message: `Spec Builder already has a spec with this name. Pick another name. (${text})`, fallback: false }
  return { message: `Spec Builder refused the spec: ${text || error?.message || 'unknown error'}`, fallback: false }
}

// Open Spec Builder's page on one spec.
export function openSpecBuilder(name: string, navigate: (path: string) => void) {
  try {
    window.localStorage.setItem(LAST_OPEN, name)
  } catch {
    // Storage blocked: the page opens on its own last spec; the notice names this one.
  }
  navigate(SPEC_BUILDER_PAGE)
}
