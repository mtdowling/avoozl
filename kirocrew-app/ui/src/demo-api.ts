// Demo mode's page side (design §6.11): the backend calls, the tour's
// steps, and the guard every host call passes while the demo is on.
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

// The pages the tour visits. `tab` is App's tab key.
export type TourTab = 'dashboard' | 'plans' | 'graph' | 'untriaged' | 'flow' | 'settings'

export interface TourStep {
  id: string
  title: string
  caption: string
  tab: TourTab
  // A task whose drawer the step opens.
  task?: string
  // The Settings section the step opens.
  settingsTab?: string
  // A CSS selector for the part of the page the step points at, when the page
  // has it. A missing part leaves the step pointing at nothing.
  target?: string
}

// One step per page, in the order a first look makes sense.
export const TOUR: readonly TourStep[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    caption: 'This is your work at a glance: what is ready, running, done, and what waits on you.',
    tab: 'dashboard',
  },
  {
    id: 'needs-you',
    title: 'Needs you',
    caption: 'Avoozl asks only for real choices. Here one task waits for you to pick how to count ingredients.',
    tab: 'dashboard',
  },
  {
    id: 'handback',
    title: 'A crew handed back',
    caption: 'Crew Nova, on cloud-box, stopped and asked: does the week start on Monday or Sunday? Answer on GitHub. The work waits until you do.',
    tab: 'dashboard',
    target: '[data-waiting-handback]',
  },
  {
    id: 'review',
    title: 'A review is drafted',
    caption: 'A crew read a pull request and drafted a review. It is ready for you to post. Nothing goes to GitHub until you say so.',
    tab: 'dashboard',
    target: '[data-review-draft]',
  },
  {
    id: 'crews',
    title: 'Crews at work',
    caption: 'Issue Radar crews on three machines hold claims: Draco implements, Orion investigates, Vega just claimed an issue. Avoozl only reads this.',
    tab: 'dashboard',
    target: '[data-in-flight]',
  },
  {
    id: 'release',
    title: 'Release queue',
    caption: 'Avoozl adds the ready label in graph order, up to two at a time. Each waiting task shows one reason it is held.',
    tab: 'dashboard',
    target: '[data-release-repository]',
  },
  {
    id: 'stop-line',
    title: 'Stop the line',
    caption: 'The red Stop the line button pauses all new work at once. In the demo it only says what it would do. The bar above has an example you can flip.',
    tab: 'dashboard',
  },
  {
    id: 'driver',
    title: 'The driver session',
    caption: 'One driver session runs the releases and shows you where things stand. Open it from here. In the demo it does not start.',
    tab: 'dashboard',
    target: '[data-driver-session]',
  },
  {
    id: 'epics',
    title: 'Epic, spec, phase',
    caption: 'The Recipe Box epic holds three specs. Each spec has phases. A phase opens when the one before it has merged, and shows why anything is held.',
    tab: 'plans',
    target: '[data-epics-view]',
  },
  {
    id: 'graph',
    title: 'Graph',
    caption: 'Tasks are boxes. Lines say what must finish first. Green is done; a task with nothing left before it is ready.',
    tab: 'graph',
  },
  {
    id: 'task',
    title: 'A task and its trace',
    caption: 'Open any task to see its goal, its checks, its GitHub issue and pull request, and each step from spec to merge.',
    tab: 'graph',
    task: 'recipe-import.2.1',
  },
  {
    id: 'intake',
    title: 'Intake',
    caption: 'New GitHub issues and your own ideas land here. You pick which become work.',
    tab: 'untriaged',
  },
  {
    id: 'flow',
    title: 'Flow',
    caption: 'Flow shows how long work waits and runs, and each time the line stopped and how fast it was fixed.',
    tab: 'flow',
  },
  {
    id: 'mirror',
    title: 'Private mirror',
    caption: 'A public project can keep its crews in a private mirror. Merged work is forwarded to the public repository after a leak scan. This one is a sample.',
    tab: 'settings',
    settingsTab: 'repositories',
    target: '[data-mirror-sample]',
  },
  {
    id: 'settings',
    title: 'Settings',
    caption: 'Settings hold your workspaces, GitHub, delivery and rules. The demo changes none of them.',
    tab: 'settings',
    settingsTab: 'workspaces',
  },
]

// The next step index, kept inside the tour.
export function stepTo(at: number, move: 'next' | 'back' | 'first' | 'last', steps: readonly TourStep[] = TOUR): number {
  if (move === 'first') return 0
  if (move === 'last') return steps.length - 1
  return Math.max(0, Math.min(steps.length - 1, at + (move === 'next' ? 1 : -1)))
}

// What a key does in the tour, or null to leave it to the page.
export function tourKey(key: string): 'next' | 'back' | 'first' | 'last' | 'close' | null {
  if (key === 'ArrowRight' || key === 'PageDown') return 'next'
  if (key === 'ArrowLeft' || key === 'PageUp') return 'back'
  if (key === 'Home') return 'first'
  if (key === 'End') return 'last'
  if (key === 'Escape') return 'close'
  return null
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
