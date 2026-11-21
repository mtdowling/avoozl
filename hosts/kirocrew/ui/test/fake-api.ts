// A stand-in AppApi for the client tests: post records each call and answers
// with `reply(body, path)` wrapped in { result }, as the host does. The other
// methods refuse, since no client test reads through them.
import type { AppApi } from '@kirocrew/app-sdk'

export type Body = { operation?: string; workspaceId?: string; input?: unknown; expectedRevision?: number; [key: string]: unknown }
export type Call = { path: string; body: Body }

export function fakeApi(reply: (body: Body, path: string) => unknown = () => ({})) {
  const calls: Call[] = []
  const refuse = () => Promise.reject(Error('The fake API answers post only.'))
  const api: AppApi = {
    request: refuse,
    get: refuse,
    put: refuse,
    del: refuse,
    // T is what the caller reads; the reply stands in for the host's answer.
    async post<T>(path: string, body?: unknown) {
      const sent = (body ?? {}) as Body
      calls.push({ path, body: sent })
      return { result: await reply(sent, path) } as T
    },
  }
  return { api, calls }
}
