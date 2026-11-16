// The host SDK's hooks as every view uses them. Outside Demo mode they are
// the host's own. In Demo mode (design §6.11) host calls pass guardApi, and
// Open chat only says what it would do, so no view can start a session.
import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react'
import { useAppApi as useHostApi, useChatLauncher as useHostChat, useNavigate } from '@kirocrew/app-sdk'
import { CHAT_PREVIEW, guardApi } from './demo-api.ts'

export { useNavigate }

export interface DemoGuard {
  active: boolean
  // Shows one preview sentence on the page.
  notice(text: string): void
}

const DemoGuardContext = createContext<DemoGuard>({ active: false, notice: () => undefined })

export function DemoGuardProvider(props: { value: DemoGuard; children: ReactNode }) {
  return createElement(DemoGuardContext.Provider, { value: props.value }, props.children)
}

export const useDemoGuard = () => useContext(DemoGuardContext)

// Reads Home and the nav send from several places at once (the Needs you
// count and Home's own list, the driver cell and Home's setup cards). Two
// identical calls in flight at the same time share one request. Only these
// read-only operations; a write is never shared.
const SHARED_READS = new Set(['conflicts.view', 'delivery.view', 'driversession.view', 'flow.view', 'github.settings.get', 'instance.view', 'repositories.list'])
type HostApi = ReturnType<typeof useHostApi>
const shared = new WeakMap<object, HostApi>()
export function shareReads(api: HostApi): HostApi {
  const had = shared.get(api)
  if (had) return had
  const flight = new Map<string, Promise<unknown>>()
  const post = ((path: string, body?: unknown, init?: unknown) => {
    const operation = (body as { operation?: unknown } | null)?.operation
    if (typeof operation !== 'string' || !SHARED_READS.has(operation) || init !== undefined) return (api.post as (...args: unknown[]) => Promise<unknown>)(path, body, init)
    const key = `${path}\n${JSON.stringify(body)}`
    let request = flight.get(key)
    if (!request) {
      request = (api.post as (...args: unknown[]) => Promise<unknown>)(path, body).finally(() => flight.delete(key))
      flight.set(key, request)
    }
    return request
  }) as HostApi['post']
  // A child of the host's object, so its other methods stay as they are.
  const wrapped = Object.create(api) as HostApi
  wrapped.post = post
  shared.set(api, wrapped)
  return wrapped
}

export function useAppApi() {
  const api = shareReads(useHostApi())
  const { active, notice } = useDemoGuard()
  return useMemo(() => (active ? guardApi(api, notice) : api), [api, active, notice])
}

export function useChatLauncher() {
  const host = useHostChat()
  const { active, notice } = useDemoGuard()
  const openChat = host.openChat
  return useMemo(() => (active ? { openChat: () => notice(CHAT_PREVIEW) } : { openChat }), [active, notice, openChat])
}
