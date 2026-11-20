// The host SDK's hooks as every view uses them, with identical reads in
// flight shared.
import { useAppApi as useHostApi, useChatLauncher, useNavigate } from '@kirocrew/app-sdk'

export { useChatLauncher, useNavigate }

// Reads Home and the nav send from several places at once (the Needs you
// count and Home's own list, the driver cell and Home's setup cards). Two
// identical calls in flight at the same time share one request. Only these
// read-only operations; a write is never shared.
const SHARED_READS = new Set(['conflicts.view', 'delivery.view', 'flow.view', 'github.settings.get', 'repositories.list'])
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
  return shareReads(useHostApi())
}
