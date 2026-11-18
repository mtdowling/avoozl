// The host shim: what Kiro Crew does around the page, written for a browser
// with no Kiro Crew. Nothing here draws a part or defines a style; the parts,
// the provider and the stylesheet are Kiro Crew's own (SW1, SW6).
import { useSyncExternalStore } from 'react'

const BASE = '/apps/avoozl'
const CSRF_HEADER = 'X-Avoozl-CSRF'
const THEME_KEY = 'avoozl-theme'

// Every request for the server's own origin carries the CSRF token the server
// put in the page. The reply is returned as it came (SW1.4).
export function installCsrf(win: Window = window) {
  const original = win.fetch.bind(win)
  win.fetch = (input, init) => {
    const token = win.document.querySelector('meta[name="avoozl-csrf"]')?.getAttribute('content')
    const url = new URL(input instanceof Request ? input.url : String(input), win.location.href)
    if (!token || url.origin !== win.location.origin) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(CSRF_HEADER, token)
    return original(input, { ...init, headers })
  }
}

type ChatLaunch = { message?: string; agent?: string; slotKey?: string; autoSend?: boolean }
let openChat: (launch: ChatLaunch) => void = () => console.info('Open chat is not available on this page yet.')
export const onOpenChat = (handler: typeof openChat) => {
  openChat = handler
}

// The SDK's navigate: a path under the app's base moves the page with the
// History API; a chat path opens the Start a session dialog; anything else
// does nothing and says so once (SW1.5).
export function navigate(path: string) {
  if (path === BASE || path.startsWith(`${BASE}/`) || path.startsWith(`${BASE}?`)) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  } else if (path === '/chat' || path.startsWith('/chat?') || path.startsWith('/chat/')) {
    const launch = (window as Window & { __mc_chat_launch?: ChatLaunch }).__mc_chat_launch
    openChat(launch ?? {})
  } else console.info('The standalone page has no route for', path.split('?')[0])
}

// One notice in the header (SW1.6).
let notice: { message: string; type: 'info' | 'success' | 'error' } | null = null
const listeners = new Set<() => void>()
export function notify(message: string, opts?: { type?: 'info' | 'success' | 'error' }) {
  notice = { message, type: opts?.type ?? 'info' }
  for (const listener of listeners) listener()
}
export const clearNotice = () => {
  notice = null
  for (const listener of listeners) listener()
}
export function useNotice() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => notice,
  )
}

// Kiro Crew's default palette, in the mode the person chose or the system's
// (SW6.2). Kiro Crew's stylesheet keys on these two attributes.
export type ThemeChoice = 'system' | 'light' | 'dark'
const PALETTE = 'kiro'
export const readTheme = (): ThemeChoice => {
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}
export function applyTheme(choice: ThemeChoice) {
  const mode = choice === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice
  const root = document.documentElement
  root.dataset.theme = `${PALETTE}-${mode}`
  root.dataset.mode = mode
  root.dataset.modePref = choice
}
export function saveTheme(choice: ThemeChoice) {
  if (choice === 'system') window.localStorage.removeItem(THEME_KEY)
  else window.localStorage.setItem(THEME_KEY, choice)
  applyTheme(choice)
}

export async function signOut() {
  await fetch('/logout', { method: 'POST' })
  window.location.reload()
}
