// Demo mode's page side (design §6.11): the backend calls and the guard
// every host call passes while the demo is on.
// Kept free of JSX and runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

// The sample's workspace ID (src/app/demo.mjs DEMO_WORKSPACE_ID). No catalog
// workspace can have it: catalog IDs start with a letter.
export const DEMO_WORKSPACE_ID = '@demo'

export interface DemoState {
  active: boolean
  workspaceId?: string
  existing?: boolean
  at?: string | null
}

export function demoClient(api: AppApi) {
  const run = async (operation: string) => {
    const reply = await api.post<{ result: DemoState }>(COMMAND_PATH, { operation, input: {} })
    return reply.result
  }
  return {
    start: () => run('demo.start'),
    exit: () => run('demo.exit'),
    status: () => run('demo.status'),
  }
}

export const CHAT_PREVIEW = 'Demo mode: in your own workspace this would open a Kiro Crew chat. No chat started.'

// A host call the demo lets through: every Avoozl command (its backend
// answers changes with a preview) and reads such as the model list.
// Anything else posts to the host, which could start a session or open a
// folder, so it is refused here.
export function demoAllows(method: 'request' | 'get' | 'post' | 'put' | 'del', path: string): boolean {
  if (method === 'post' && path === COMMAND_PATH) return true
  return method === 'get'
}

export function demoRefusal(path: string): Error & { status: number; body: string } {
  const message = `Demo mode: in your own workspace this would call ${path}. Nothing changed.`
  return Object.assign(Error(message), { status: 409, body: JSON.stringify({ error: message, demo: true }) })
}

// The preview sentence a refused call carries, or null for a real error.
export function previewOf(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('body' in error)) return null
  try {
    const parsed = JSON.parse(String((error as { body: unknown }).body))
    return parsed && parsed.demo === true && typeof parsed.error === 'string' ? parsed.error : null
  } catch {
    return null
  }
}

// The host client as the demo sees it. `notice` hears each preview.
// The machine's own workspace list stays hidden: Settings sees only the
// sample, so a demo shown to someone else never shows real folder names.
export function guardApi(api: AppApi, notice: (text: string) => void): AppApi {
  const watch = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => {
      const text = previewOf(error)
      if (text) notice(text)
      throw error
    })
  const refuse = (path: string) => {
    const error = demoRefusal(path)
    notice(error.message)
    return Promise.reject(error)
  }
  const post = <T>(path: string, body?: unknown, init?: RequestInit): Promise<T> => {
    if (!demoAllows('post', path)) return refuse(path)
    const operation = (body as { operation?: unknown } | null)?.operation
    if (operation === 'workspaces.list') return Promise.resolve({ result: DEMO_CATALOG } as T)
    if (typeof operation === 'string' && operation.startsWith('workspaces.')) return refuse(`${path} (${operation})`)
    return watch(api.post<T>(path, body, init))
  }
  return {
    request: (path, init) => (demoAllows('request', path) ? watch(api.request(path, init)) : refuse(path)),
    get: (path, init) => (demoAllows('get', path) ? watch(api.get(path, init)) : refuse(path)),
    post,
    put: (path) => refuse(path),
    del: (path) => refuse(path),
  }
}

// What Settings › Workspaces lists during the demo.
export const DEMO_CATALOG = {
  defaultWorkspace: DEMO_WORKSPACE_ID,
  items: [{ id: DEMO_WORKSPACE_ID, name: 'Demo: Recipe Box', root: 'A temporary folder for the demo', enabled: true, state: 'ok', served: false }],
}
