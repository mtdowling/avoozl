// The Workspace view's calls to Avoozl's app backend, over the host's
// permission-scoped `useAppApi()` client. The gateway signs each request and
// forwards `/apps/avoozl/api/<path>` to the backend's `/api/<path>`.
// Keep this module free of JSX and runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'

export const COMMAND_PATH = '/apps/avoozl/api/command'

export interface CatalogWorkspace {
  id: string
  name: string
  root: string
  enabled: boolean
  state: string
  served: boolean
}

export interface WorkspaceList {
  defaultWorkspace: string | null
  items: CatalogWorkspace[]
}

export interface Repository {
  id: string
  name: string
  localCheckout: string | null
  github: string | null
  baseBranch: string
}

export interface DetectedCheckout {
  root: string
  baseBranch: string
  currentBranch: string | null
  remote: string | null
  github: string | null
  id: string | null
}

export interface TickRun {
  at?: string
  outcome: 'ok' | 'locked' | 'error' | 'unreadable'
  policy?: string
  error?: string
}

export interface TickHealth {
  lastRun: TickRun | null
  lock: { pid: number; live: boolean } | null
}

export interface NewWorkspace {
  id: string
  root: string
  name?: string
}

// The backend's `error` sentence, or the HTTP status when the body has none.
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'body' in error) {
    const { body, status } = error as { body: unknown; status?: unknown }
    try {
      const parsed = JSON.parse(String(body))
      if (parsed && typeof parsed.error === 'string') return parsed.error
    } catch {
      // Not JSON; fall through to the status.
    }
    if (typeof status === 'number') return `Request failed (${status}).`
  }
  return error instanceof Error ? error.message : String(error)
}

export function workspaceClient(api: AppApi) {
  const run = async <T>(
    operation: string,
    input: Record<string, unknown> = {},
    workspaceId?: string,
  ): Promise<T> => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, {
      operation,
      input,
      ...(workspaceId ? { workspaceId } : {}),
    })
    return reply.result
  }
  return {
    list: () => run<WorkspaceList>('workspaces.list'),
    add: (input: NewWorkspace) => run<CatalogWorkspace>('workspaces.add', { ...input }),
    init: (input: NewWorkspace) => run<CatalogWorkspace>('workspaces.init', { ...input }),
    repositories: (workspaceId: string) =>
      run<{ items: Repository[] }>('repositories.list', {}, workspaceId).then((r) => r.items),
    // Read only: what adding this folder would register.
    detectRepository: (workspaceId: string, folder: string) =>
      run<DetectedCheckout>('repositories.detect', { folder }, workspaceId),
    // Stops Avoozl using a checkout. Refused while a run or lock uses it.
    removeRepository: (workspaceId: string, id: string) =>
      run<Repository & { removed: boolean }>('repositories.remove', { id }, workspaceId),
    registerRepository: (
      workspaceId: string,
      input: { id: string; localCheckout: string; baseBranch?: string },
    ) => run<Repository>('repositories.configure', { ...input }, workspaceId),
    tick: (workspaceId: string) => run<unknown>('workspace.tick', {}, workspaceId),
    tickHealth: (workspaceId: string) => run<TickHealth>('workspace.tick.health', {}, workspaceId),
  }
}

export type WorkspaceClient = ReturnType<typeof workspaceClient>

// One short line for the tick health card.
export function describeTick(health: TickHealth | null, now = Date.now()): string {
  if (!health) return 'Not loaded'
  const { lastRun, lock } = health
  if (lock) return lock.live ? `Running (pid ${lock.pid})` : `Stale lock (pid ${lock.pid})`
  if (!lastRun) return 'Never run'
  if (lastRun.outcome === 'unreadable') return 'Last run unreadable'
  const seconds = lastRun.at ? Math.max(0, Math.round((now - Date.parse(lastRun.at)) / 1000)) : null
  const ago =
    seconds === null ? '' : seconds < 90 ? ` ${seconds}s ago` : ` ${Math.round(seconds / 60)}m ago`
  if (lastRun.outcome === 'error') return `Failed${ago}: ${lastRun.error ?? 'unknown error'}`
  if (lastRun.outcome === 'locked') return `Skipped${ago}: another tick held the lock`
  if (lastRun.policy === 'invalid') return `Ran${ago}; .avoozl.json is invalid: ${lastRun.error ?? ''}`.trim()
  return `Ran${ago}; policy ${lastRun.policy ?? 'unknown'}`
}

// The workspace to show: the current one while it still exists, else the one
// this backend serves, else the catalog default, else the first.
export function pickDefault(list: WorkspaceList, current: string | null): string | null {
  if (current && list.items.some((w) => w.id === current)) return current
  return list.items.find((w) => w.served)?.id ?? list.defaultWorkspace ?? list.items[0]?.id ?? null
}

// The page's workspace survives a reload in localStorage. A missing, blocked
// or stale value falls back instead of throwing. The tab does not: the page
// always opens on the Dashboard, and a tab saved by an older page is ignored.
export const PAGE_STATE_KEY = 'avoozl.page'

export interface PageState {
  workspaceId: string | null
}

export function readPageState(storage: Pick<Storage, 'getItem'> | null): PageState {
  try {
    const value = JSON.parse(storage?.getItem(PAGE_STATE_KEY) ?? 'null')
    return { workspaceId: typeof value?.workspaceId === 'string' ? value.workspaceId : null }
  } catch {
    return { workspaceId: null }
  }
}

export function writePageState(storage: Pick<Storage, 'setItem'> | null, state: PageState): void {
  try {
    storage?.setItem(PAGE_STATE_KEY, JSON.stringify(state))
  } catch {
    // Storage may be full or blocked; the page still works without it.
  }
}

// Plain names for the catalog's workspace states (catalog-store.mjs). Today
// the code sets only three: "closed" for every enabled workspace (it opens on
// demand and the catalog never records that it did), "stopped" when turned
// off, and "draining" after a drain request. The other four are allowed
// values nothing sets yet; they get names so a later writer reads plainly.
// Yellow (warning) only where the owner must act.
export const WORKSPACE_STATES: Record<string, { label: string; tip: string; variant?: 'warning' | 'success' }> = {
  closed: { label: 'On', tip: 'Turned on. Avoozl opens it when a page or tick needs it.' },
  opening: { label: 'Opening', tip: 'Avoozl is opening its database.' },
  ready: { label: 'Active', tip: 'Open and ticking.', variant: 'success' },
  draining: { label: 'Finishing work', tip: 'Asked to drain: it stops taking new work.' },
  stopped: { label: 'Turned off', tip: 'Turned off. Ticks and pages skip it until it is turned on.' },
  degraded: { label: 'Needs attention', tip: 'Something is wrong with this workspace. Check its tick health.', variant: 'warning' },
  quarantined: { label: 'Paused for safety', tip: 'Paused for safety. Nothing runs here until you clear it.', variant: 'warning' },
}

export const workspaceState = (state: string) => WORKSPACE_STATES[state] ?? { label: state, tip: `State: ${state}` }
